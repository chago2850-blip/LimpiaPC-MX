// LimpiaPc-MX — Aplicaciones  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, $$, esc, fmtBytes, fmtAgo, shortPath } = UI;
  let tab = 'uninstall';
  const DAY = 86400000;

  Views.apps = {
    render(el) {
      el.innerHTML = `<h1>Aplicaciones</h1><p class="lead">Desinstala por completo (con todos sus restos), mantén tus apps actualizadas, elimina sobras de programas que ya no existen y controla las extensiones de tus navegadores.</p>
        <div class="tabs">${[['uninstall', 'Desinstalador'], ['updates', 'Actualizador'], ['orphans', 'Restos huérfanos'], ['extensions', 'Extensiones']].map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div id="pt"></div>`;
      $('.tabs', el).onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; this.render(el); };
      this[tab]($('#pt', el));
    },

    async loadApps(el, force) {
      if (App.cache.apps && !force) return App.cache.apps;
      el.innerHTML = `<div class="card"><div class="muted" id="ap-step">Buscando aplicaciones instaladas…</div><div class="progress" style="margin-top:10px"><i id="ap-bar" style="width:0"></i></div></div>`;
      App.cache.apps = await lpc.call('apps.list', d => { const b = $('#ap-bar', el), s = $('#ap-step', el); if (b) b.style.width = d.pct + '%'; if (s && d.step) s.textContent = d.step; });
      return App.cache.apps;
    },

    async uninstall(el) {
      const apps = await this.loadApps(el);
      let filter = 'all', q = '', sort = 'name';
      el.innerHTML = `<div class="row wrap" style="margin-bottom:12px"><input type="text" class="search" placeholder="Buscar aplicación…" id="q">
        <select id="f"><option value="all">Todas (${apps.length})</option><option value="unused">Sin uso en 90+ días</option><option value="large">Más de 500 MB</option>${[...new Set(apps.map(a => a.source))].map(s => `<option value="src:${esc(s)}">${esc(s)}</option>`).join('')}</select>
        <select id="s"><option value="name">Nombre</option><option value="size">Tamaño</option><option value="used">Último uso</option></select><span class="spacer"></span><button class="btn ghost" id="rl">${ICONS.refresh} Recargar</button></div>
        <div class="card"><div class="list" id="al"></div></div>`;
      const draw = () => {
        let list = apps.filter(a => a.name.toLowerCase().includes(q));
        if (filter === 'unused') list = list.filter(a => a.lastUsed && Date.now() - a.lastUsed > 90 * DAY);
        if (filter === 'large') list = list.filter(a => a.bytes > 500 * 1024 * 1024);
        if (filter.startsWith('src:')) list = list.filter(a => a.source === filter.slice(4));
        list.sort(sort === 'size' ? (a, b) => b.bytes - a.bytes : sort === 'used' ? (a, b) => (a.lastUsed || 0) - (b.lastUsed || 0) : (a, b) => a.name.localeCompare(b.name, 'es'));
        $('#al', el).innerHTML = list.map(a => `<div class="item"><div class="thumb">${ICONS.apps}</div><div class="t"><b>${esc(a.name)} <span class="dim small">${esc(a.version || '')}</span></b><span>${esc(a.source || '')}${a.publisher ? ' · ' + esc(a.publisher) : ''}${a.lastUsed ? ' · usada ' + fmtAgo(a.lastUsed) : ''}</span></div>
          <div class="v">${a.bytes ? fmtBytes(a.bytes) : ''}${a.removable ? `<button class="btn sm ghost" data-reset="${esc(a.id)}">Restablecer</button><button class="btn sm danger" data-un="${esc(a.id)}">Desinstalar</button>` : '<span class="pill">Protegida</span>'}</div></div>`).join('') || '<div class="empty">Sin resultados</div>';
      };
      $('#q', el).oninput = e => { q = e.target.value.toLowerCase(); draw(); };
      $('#f', el).onchange = e => { filter = e.target.value; draw(); };
      $('#s', el).onchange = e => { sort = e.target.value; draw(); };
      $('#rl', el).onclick = async () => { await this.loadApps(el, true); this.uninstall(el); };
      $('#al', el).onclick = async e => {
        const u = e.target.closest('[data-un]'), r = e.target.closest('[data-reset]');
        if (!u && !r) return;
        const a = apps.find(x => x.id === (u || r).dataset[u ? 'un' : 'reset']);
        const btn = u || r; btn.disabled = true; btn.textContent = 'Buscando restos…';
        const left = await lpc.call('apps.leftovers', a);
        btn.disabled = false; btn.textContent = u ? 'Desinstalar' : 'Restablecer';
        const leftHtml = left.length ? `<div class="list" style="margin-top:10px;max-height:240px;overflow:auto">${left.map(l => `<div class="item"><div class="thumb">${ICONS.folder}</div><div class="t"><span>${esc(shortPath(l.path))}</span></div><div class="v small">${fmtBytes(l.bytes)}</div></div>`).join('')}</div>` : '<div class="small" style="margin-top:8px">No se encontraron archivos de soporte.</div>';
        const total = left.reduce((x, y) => x + y.bytes, 0) + (u ? a.bytes || 0 : 0);
        const ok = await UI.modal({
          title: u ? `Desinstalar ${a.name}` : `Restablecer ${a.name}`,
          body: (u ? `Se eliminará la aplicación y ${left.length} archivos relacionados (${fmtBytes(total)}).` : `Se borrarán sus preferencias, cachés y datos (${fmtBytes(total)}) para que vuelva a su estado inicial. La app seguirá instalada.`) + leftHtml,
          ok: u ? 'Desinstalar' : 'Restablecer', danger: true, wide: true,
        });
        if (!ok) return;
        UI.toast(a.name, u ? 'Desinstalando…' : 'Restableciendo…');
        const res = await lpc.call('apps.uninstall', a, { withLeftovers: true, resetOnly: !!r });
        if (res.errors.length) UI.toast('Terminado con avisos', res.errors[0], 'warning', 7000);
        else UI.toast(a.name, `${u ? 'Desinstalada' : 'Restablecida'} · ${fmtBytes(res.freed)} liberados`, 'success');
        if (u && !res.errors.length) { App.cache.apps = apps.filter(x => x !== a); this.uninstall(el); }
      };
      draw();
    },

    async updates(el) {
      el.innerHTML = '<div class="card"><div class="muted">Consultando actualizaciones disponibles…</div><div class="progress indet" style="margin-top:10px"><i></i></div></div>';
      const r = await lpc.call('apps.updates');
      if (!r.managers.length) { el.innerHTML = `<div class="empty">${ICONS.update}<h3>No se encontró un gestor de actualizaciones</h3><p class="muted">Instala ${window.__info.platform === 'win32' ? '<b>winget</b> (App Installer de Microsoft Store)' : window.__info.platform === 'darwin' ? '<b>Homebrew</b> o <b>mas</b>' : 'APT, DNF, Pacman, Flatpak o Snap'} para habilitar el actualizador.</p></div>`; return; }
      if (!r.updates.length) { el.innerHTML = `<div class="empty">${ICONS.check}<h3>Todo está actualizado</h3><p class="muted">Revisado con ${esc(r.managers.join(', '))}.</p></div>`; return; }
      el.innerHTML = `<div class="card" id="ul"></div><div class="bottombar"><span class="muted">Revisado con ${esc(r.managers.join(', '))}</span><span class="spacer"></span><button class="btn primary big" id="up">${ICONS.update} Actualizar</button></div>`;
      const sl = UI.selectableList($('#ul', el), r.updates, { key: u => u.manager + ':' + u.id, preselect: () => true, render: u => `<div class="t"><b>${esc(u.name)}</b><span>${esc(u.manager)} · ${esc(u.id)}</span></div><div class="v">${esc(u.current || '')} → <b style="color:var(--ok)">${esc(u.available || 'nueva')}</b></div>` });
      $('#up', el).onclick = async e => {
        const list = r.updates.filter(u => sl.sel.has(u.manager + ':' + u.id));
        if (!list.length) return;
        e.target.disabled = true; e.target.textContent = 'Actualizando…';
        const res = await lpc.call('apps.applyUpdates', list);
        UI.toast('Actualizador', `${res.filter(x => x.ok).length} de ${res.length} operaciones correctas.`, 'success');
        this.updates(el);
      };
    },

    async orphans(el) {
      const apps = await this.loadApps(el);
      el.innerHTML = '<div class="card"><div class="muted">Buscando restos de apps desinstaladas…</div><div class="progress indet" style="margin-top:10px"><i></i></div></div>';
      const list = await lpc.call('apps.orphans', apps.map(a => ({ name: a.name, bundleId: a.bundleId, pkg: a.pkg, publisher: a.publisher })));
      if (!list.length) { el.innerHTML = `<div class="empty">${ICONS.check}<h3>No encontramos restos huérfanos</h3>${window.__info.platform === 'linux' ? '<p class="muted">En Linux revisa la pestaña Desinstalador o la Limpieza.</p>' : ''}</div>`; return; }
      el.innerHTML = `<div class="card" style="margin-bottom:12px"><div class="muted small">Carpetas de datos que no corresponden a ninguna aplicación instalada. Revísalas antes de eliminar: algunas podrían pertenecer a herramientas que no aparecen en la lista.</div></div><div class="card" id="ol"></div>
        <div class="bottombar"><span class="muted" id="ot"></span><span class="spacer"></span><button class="btn danger big" id="od">Eliminar seleccionados</button></div>`;
      const sl = UI.selectableList($('#ol', el), list, { onChange: (s, t) => { const o = $('#ot', el); if (o) o.textContent = 'Seleccionado: ' + fmtBytes(t); }, render: o => `<div class="t"><b>${esc(o.name)}</b><span>${esc(shortPath(o.path))}</span></div><div class="v">${fmtBytes(o.bytes)}</div>` });
      $('#od', el).onclick = async () => {
        if (!sl.sel.size) return;
        const r = await lpc.call('clutter.remove', [...sl.sel]);
        UI.toast('Restos eliminados', fmtBytes(r.freed) + ' liberados', 'success'); this.orphans(el);
      };
    },

    async extensions(el) {
      el.innerHTML = '<div class="progress indet"><i></i></div>';
      const list = await lpc.call('apps.extensions');
      if (!list.length) { el.innerHTML = `<div class="empty">${ICONS.puzzle}<h3>No se encontraron extensiones</h3></div>`; return; }
      const by = {}; list.forEach((x, i) => { x._i = i; (by[x.browser] = by[x.browser] || []).push(x); });
      el.innerHTML = `<div class="card" style="margin-bottom:12px"><div class="muted small">Cierra el navegador antes de eliminar una extensión. Las extensiones con muchos permisos pueden leer tus datos de navegación.</div></div>` + Object.entries(by).map(([b, arr]) => `<div class="card" style="margin-bottom:14px"><h3>${esc(b)} <span class="pill">${arr.length}</span></h3><div class="list">${arr.map(x => `<div class="item"><div class="thumb">${ICONS.puzzle}</div><div class="t"><b>${esc(x.name)} <span class="dim small">${esc(x.version || '')}</span></b><span>${esc(x.profile)} · ${esc((x.permissions || []).join(', ') || 'sin permisos especiales')}</span></div><div class="v">${x.readonly ? '<span class="pill">Desde Firefox</span>' : `<button class="btn sm danger" data-x="${x._i}">Eliminar</button>`}</div></div>`).join('')}</div></div>`).join('');
      el.onclick = async e => {
        const b = e.target.closest('[data-x]'); if (!b) return;
        const x = list[b.dataset.x];
        if (!(await UI.modal({ title: 'Eliminar extensión', body: `¿Eliminar <b>${esc(x.name)}</b> de ${esc(x.browser)}?`, ok: 'Eliminar', danger: true }))) return;
        const r = await lpc.call('apps.removeExtension', x);
        UI.toast(r.ok ? 'Extensión eliminada' : 'No se pudo eliminar', r.error || x.name, r.ok ? 'success' : 'warning'); this.extensions(el);
      };
    },
  };
})();
