// LimpiaPc-MX — Cuidado inteligente  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, $$, esc, fmtBytes, fmtAgo } = UI;

  Views.smartcare = {
    render(el) {
      UI.hero(el, {
        key: 'smartcare', title: 'Cuidado inteligente',
        desc: `Un solo clic para revisar todo tu equipo: basura, amenazas, rendimiento, actualizaciones y desorden. Último mantenimiento: ${fmtAgo(App.settings.lastSmartCare)}.`,
        feats: [['Limpieza', 'Encuentra cachés, registros y basura segura de borrar.'], ['Protección', 'Busca malware, adware y elementos de inicio sospechosos.'], ['Rendimiento', 'Recomienda tareas de mantenimiento para acelerar tu equipo.'], ['Aplicaciones y desorden', 'Detecta actualizaciones pendientes y descargas olvidadas.']],
        action: 'Escanear', onStart: () => this.scan(el),
      });
    },
    async scan(el) {
      const sc = UI.scanning(el, { key: 'smartcare', title: 'Revisando tu equipo…' });
      const res = await lpc.call('smartcare.scan', d => sc.update({ pct: d.pct, step: d.step }));
      sc.stop();
      this.results(el, res);
    },
    results(el, res) {
      const junk = res.cleanup.filter(c => c.bytes > 0);
      const threats = res.protection.threats;
      const tasks = res.performance.tasks;
      const ups = res.apps.updates;
      const cards = [
        { k: 'cleanup', title: 'Limpieza', big: fmtBytes(res.junkBytes), sub: `${junk.length} categorías de basura`, on: res.junkBytes > 0, icon: 'cleanup' },
        { k: 'protection', title: 'Protección', big: threats.length ? `${threats.length} amenazas` : 'Sin amenazas', sub: `${res.protection.scanned.toLocaleString('es-MX')} archivos · ${esc(res.protection.engine)}`, on: threats.length > 0, icon: 'protection' },
        { k: 'performance', title: 'Rendimiento', big: `${tasks.length} tareas`, sub: `${res.performance.startupCount} elementos de inicio activos`, on: true, icon: 'performance' },
        { k: 'apps', title: 'Aplicaciones', big: ups.length ? `${ups.length} actualizaciones` : 'Al día', sub: res.apps.managers.length ? 'Vía ' + res.apps.managers.join(', ') : 'Sin gestor de paquetes detectado', on: false, info: true, icon: 'apps' },
        { k: 'clutter', title: 'Mi desorden', big: fmtBytes(res.clutter.bytes), sub: `${res.clutter.downloadsOld.length} descargas de más de 30 días`, on: false, info: true, icon: 'clutter' },
      ];
      el.innerHTML = `<div class="row"><div><h1>Esto es lo que encontramos</h1><p class="lead">Revisa cada módulo y elige qué hacer. Lo seleccionado se ejecutará con un clic.</p></div></div>
        <div class="grid g3">${cards.map(c => `<div class="card" style="--c:var(--m-${c.k})">
          <div class="row"><div class="ico">${ICONS[c.icon]}</div><span class="spacer"></span>${c.info ? `<button class="btn sm ghost" data-go="${c.k}">Revisar</button>` : `<input type="checkbox" class="switch" data-k="${c.k}" ${c.on ? 'checked' : ''}>`}</div>
          <div class="muted small">${c.title}</div><div class="stat-big">${c.big}</div><div class="muted small" style="margin-top:4px">${c.sub}</div>
          <button class="btn sm ghost" style="margin-top:12px" data-detail="${c.k}">Ver detalles</button></div>`).join('')}</div>
        <div class="card" id="detail" style="margin-top:16px;display:none"></div>
        <div class="bottombar"><span class="muted" id="sumtxt"></span><span class="spacer"></span><button class="btn ghost" id="rescan">${ICONS.refresh} Volver a escanear</button><button class="btn primary big" id="run">Ejecutar</button></div>`;
      const pick = { cleanup: new Set(junk.filter(c => c.id !== 'trash' || true).map(c => c.id)), threats: new Set(threats.map(t => t.path)), tasks: new Set(tasks.map(t => t.id)) };
      const on = k => { const s = $(`[data-k="${k}"]`, el); return s && s.checked; };
      const sum = () => { $('#sumtxt', el).textContent = `Se liberarán aprox. ${fmtBytes(on('cleanup') ? junk.filter(c => pick.cleanup.has(c.id)).reduce((a, c) => a + c.bytes, 0) : 0)}`; };
      el.addEventListener('change', sum); sum();
      $('#rescan', el).onclick = () => this.scan(el);
      $$('[data-detail]', el).forEach(b => b.onclick = () => {
        const k = b.dataset.detail, d = $('#detail', el); d.style.display = '';
        if (k === 'cleanup') d.innerHTML = `<h2>Basura encontrada</h2><div class="list">${junk.map(c => `<label class="item"><input type="checkbox" data-c="${c.id}" ${pick.cleanup.has(c.id) ? 'checked' : ''}><div class="t"><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></div><div class="v">${fmtBytes(c.bytes)}</div></label>`).join('') || '<div class="muted">No hay basura. ✨</div>'}</div>`;
        if (k === 'protection') d.innerHTML = `<h2>Amenazas</h2>${threats.length ? `<div class="list">${threats.map(t => `<label class="item"><input type="checkbox" data-t="${esc(t.path)}" ${pick.threats.has(t.path) ? 'checked' : ''}><div class="t"><b>${esc(t.path.split(/[\\/]/).pop())}</b><span>${esc(t.reasons.join(' · '))} — ${esc(UI.shortPath(t.path))}</span></div><div class="v"><span class="pill bad">Sospechoso</span></div></label>`).join('')}</div>` : '<div class="muted">Tu equipo está limpio. 🛡️</div>'}`;
        if (k === 'performance') d.innerHTML = `<h2>Tareas recomendadas</h2><div class="list">${tasks.map(t => `<label class="item"><input type="checkbox" data-p="${t.id}" ${pick.tasks.has(t.id) ? 'checked' : ''}><div class="t"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></div><div class="v">${t.admin ? '<span class="pill warn">Admin</span>' : ''}</div></label>`).join('')}</div>`;
        if (k === 'apps') d.innerHTML = `<h2>Actualizaciones disponibles</h2><div class="list">${ups.slice(0, 50).map(u => `<div class="item"><div class="thumb">${ICONS.update}</div><div class="t"><b>${esc(u.name)}</b><span>${esc(u.manager)} · ${esc(u.current || '')} → ${esc(u.available || '')}</span></div><div class="v"></div></div>`).join('') || '<div class="muted">Todo está actualizado.</div>'}</div>`;
        if (k === 'clutter') d.innerHTML = `<h2>Descargas antiguas</h2><div class="list">${res.clutter.downloadsOld.slice(0, 40).map(f => `<div class="item"><div class="thumb">${UI.fileIcon(f.kind)}</div><div class="t"><b>${esc(f.name)}</b><span>${UI.fmtDate(f.modified)}</span></div><div class="v">${fmtBytes(f.bytes)}</div></div>`).join('') || '<div class="muted">Sin descargas viejas.</div>'}</div>`;
        d.onchange = e => {
          const t = e.target; const set = t.dataset.c ? pick.cleanup : t.dataset.t ? pick.threats : t.dataset.p ? pick.tasks : null; if (!set) return;
          const v = t.dataset.c || t.dataset.t || t.dataset.p; t.checked ? set.add(v) : set.delete(v); sum();
        };
        d.scrollIntoView({ behavior: 'smooth' });
      });
      $('#run', el).onclick = async () => {
        const plan = { cleanup: on('cleanup') ? [...pick.cleanup] : [], threats: on('protection') ? [...pick.threats] : [], tasks: on('performance') ? [...pick.tasks] : [] };
        if (!plan.cleanup.length && !plan.threats.length && !plan.tasks.length) return UI.toast('Nada seleccionado', 'Activa al menos un módulo.', 'warning');
        const sc = UI.scanning(el, { key: 'smartcare', title: 'Cuidando tu equipo…' });
        const r = await lpc.call('smartcare.run', plan, d => sc.update({ pct: d.pct, step: d.step }));
        sc.stop();
        App.settings.lastSmartCare = Date.now();
        UI.doneView(el, { title: '¡Tu equipo está como nuevo!', sub: `Se liberaron ${fmtBytes(r.freed)}, ${r.quarantined} amenazas a cuarentena y ${r.tasks.filter(t => t.ok).length}/${r.tasks.length} tareas de mantenimiento completadas.`, back: () => App.go('home') });
      };
    },
  };
})();
