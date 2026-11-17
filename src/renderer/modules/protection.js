// LimpiaPc-MX — Protección  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, $$, esc, fmtBytes, fmtDate, shortPath } = UI;
  let tab = 'malware';

  function tabs(el, onTab) {
    return `<div class="tabs">${[['malware', 'Malware'], ['privacy', 'Privacidad'], ['quarantine', 'Cuarentena'], ['realtime', 'Tiempo real']].map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  }

  Views.protection = {
    render(el) {
      el.innerHTML = `<h1>Protección</h1><p class="lead">Mantén alejados el malware, el adware y los rastreadores. Analiza tu equipo, limpia tus huellas de navegación y vigila en tiempo real tus descargas y elementos de inicio.</p>${tabs()}<div id="pt"></div>`;
      $('.tabs', el).onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; this.render(el); };
      this[tab]($('#pt', el));
    },

    malware(el) {
      el.innerHTML = `<div class="grid g3">${[['quick', 'Rápido', 'Ubicaciones de arranque, descargas y temporales.'], ['balanced', 'Equilibrado', 'Además Escritorio, Documentos y aplicaciones.'], ['deep', 'Profundo', 'Toda tu carpeta personal y ubicaciones del sistema.']].map(([k, n, d], i) => `
        <label class="card hover" style="--c:var(--m-protection)"><div class="row"><div class="ico" style="margin:0">${ICONS.protection}</div><span class="spacer"></span><input type="radio" name="mode" value="${k}" ${i === 0 ? 'checked' : ''}></div><h3 style="margin-top:12px">${n}</h3><div class="muted small">${d}</div></label>`).join('')}</div>
        <div class="card" style="margin-top:16px"><div class="row"><div><h3>Motor de análisis</h3><div class="muted small">LimpiaPc usa su motor heurístico (firmas, adware conocido, dobles extensiones, agentes de inicio ocultos, mineros, scripts ofuscados) y, si tienes <b>ClamAV</b> instalado, lo combina automáticamente.</div></div><span class="spacer"></span><button class="btn primary big" id="scan">Analizar ahora</button></div></div>`;
      $('#scan', el).onclick = async () => {
        const mode = $('input[name=mode]:checked', el).value;
        const host = el.closest('.view');
        const sc = UI.scanning(host, { key: 'protection', title: 'Buscando amenazas…', onCancel: () => lpc.call('protection.cancel') });
        const r = await lpc.call('protection.scan', mode, d => sc.update({ step: d.step, scanned: d.scanned }));
        sc.stop();
        if (!r.threats.length) return UI.doneView(host, { title: 'Tu equipo está protegido', sub: `Se analizaron ${r.scanned.toLocaleString('es-MX')} archivos con ${r.engine}. No se encontraron amenazas.`, back: () => this.render(host) });
        host.innerHTML = `<h1>${r.threats.length} amenazas encontradas</h1><p class="lead">Mueve los elementos a cuarentena: quedan aislados y podrás restaurarlos si fue un falso positivo.</p><div class="card" id="tl"></div>
          <div class="bottombar"><span class="spacer"></span><button class="btn ghost" id="back">Volver</button><button class="btn danger big" id="q">Mover a cuarentena</button></div>`;
        const sl = UI.selectableList($('#tl', host), r.threats, { preselect: () => true, render: t => `<div class="t"><b>${esc(t.path.split(/[\\/]/).pop())}</b><span>${esc(t.reasons.join(' · '))}</span><span>${esc(shortPath(t.path))}</span></div><div class="v"><span class="pill bad">Amenaza</span></div>` });
        $('#back', host).onclick = () => this.render(host);
        $('#q', host).onclick = async () => {
          const res = await lpc.call('protection.quarantine', [...sl.sel]);
          UI.doneView(host, { title: 'Amenazas neutralizadas', sub: `${res.ok} elementos en cuarentena${res.failed.length ? `, ${res.failed.length} no se pudieron mover (puede requerir permisos).` : '.'}`, back: () => this.render(host) });
        };
      };
    },

    async privacy(el) {
      el.innerHTML = '<div class="progress indet"><i></i></div>';
      const [data, running] = await Promise.all([lpc.call('protection.privacyScan'), lpc.call('protection.runningBrowsers')]);
      if (!data.length) { el.innerHTML = `<div class="empty">${ICONS.lock}<h3>No se encontraron datos de navegación</h3></div>`; return; }
      const files = new Map();
      el.innerHTML = `${running.length ? `<div class="card" style="border-color:var(--warn);margin-bottom:14px"><b style="color:var(--warn)">Cierra tus navegadores</b><div class="muted small">Está abierto: ${esc(running.join(', '))}. Ciérralo para poder borrar su historial y cookies.</div></div>` : ''}
        <div class="grid g2">${data.map((b, bi) => `<div class="card"><div class="row"><div class="thumb">${ICONS.eye}</div><h3 style="margin:0">${esc(b.browser)}</h3><span class="spacer"></span>${b.profiles ? `<span class="pill">${b.profiles} perfil(es)</span>` : ''}</div><div class="list" style="margin-top:8px">${b.items.map((it, ii) => { files.set(bi + ':' + ii, it.files); return `<label class="item"><input type="checkbox" data-f="${bi}:${ii}"><div class="t"><b>${esc(it.name)}</b></div><div class="v">${fmtBytes(it.bytes)}</div></label>`; }).join('')}</div></div>`).join('')}</div>
        <div class="bottombar"><span class="muted">Las contraseñas guardadas y los marcadores nunca se tocan.</span><span class="spacer"></span><button class="btn primary big" id="pc">Eliminar seleccionados</button></div>`;
      $('#pc', el).onclick = async () => {
        const chosen = $$('[data-f]:checked', el).flatMap(c => files.get(c.dataset.f));
        if (!chosen.length) return UI.toast('Nada seleccionado', 'Elige qué rastros eliminar.', 'warning');
        if (!(await UI.modal({ title: 'Eliminar rastros de privacidad', body: 'Se cerrarán tus sesiones iniciadas en los sitios web de los navegadores elegidos si borras las cookies. ¿Continuar?', ok: 'Eliminar', danger: true }))) return;
        const r = await lpc.call('protection.privacyClean', chosen);
        UI.toast('Privacidad', `Se eliminaron ${fmtBytes(r.freed)} de rastros.`, 'success');
        this.privacy(el);
      };
    },

    async quarantine(el) {
      const list = await lpc.call('protection.quarantineList');
      el.innerHTML = `<div class="card">${list.length ? `<div class="list">${list.map(q => `<div class="item"><div class="thumb">${ICONS.lock}</div><div class="t"><b>${esc(q.original.split(/[\\/]/).pop())}</b><span>${esc(shortPath(q.original))} · ${fmtDate(q.at)}</span></div><div class="v"><button class="btn sm ghost" data-r="${q.id}">Restaurar</button><button class="btn sm danger" data-d="${q.id}">Eliminar</button></div></div>`).join('')}</div>` : `<div class="empty">${ICONS.lock}<h3>La cuarentena está vacía</h3></div>`}</div>`;
      el.onclick = async e => {
        const r = e.target.closest('[data-r]'), d = e.target.closest('[data-d]');
        if (r) { await lpc.call('protection.quarantineAction', r.dataset.r, 'restore'); UI.toast('Restaurado', 'El archivo volvió a su ubicación.', 'success'); this.quarantine(el); }
        if (d && await UI.modal({ title: 'Eliminar definitivamente', body: 'Esta acción no se puede deshacer.', ok: 'Eliminar', danger: true })) { await lpc.call('protection.quarantineAction', d.dataset.d, 'delete'); this.quarantine(el); }
      };
    },

    realtime(el) {
      el.innerHTML = `<div class="card"><div class="row"><div class="ico" style="--c:var(--m-protection);margin:0">${ICONS.protection}</div><div><h3>Monitor en tiempo real</h3><div class="muted small">Vigila tu carpeta de Descargas y los elementos de inicio. Te avisa al instante si llega un archivo sospechoso o si una app se agrega al arranque.</div></div><span class="spacer"></span><input type="checkbox" class="switch" id="rt" ${App.settings.realtimeProtection ? 'checked' : ''}></div></div>`;
      $('#rt', el).onchange = e => { App.setSetting('realtimeProtection', e.target.checked); UI.toast('Protección en tiempo real', e.target.checked ? 'Activada' : 'Desactivada', e.target.checked ? 'success' : 'warning'); };
    },
  };
})();
