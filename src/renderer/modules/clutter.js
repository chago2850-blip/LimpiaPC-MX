// LimpiaPc-MX — Mi desorden  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, $$, esc, fmtBytes, fmtDate, fmtAgo, shortPath } = UI;
  let tab = 'large';
  let roots = null;
  const fileUrl = p => 'file://' + (p.startsWith('/') ? '' : '/') + p.split(/[\\/]/).map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');

  function bottom(el, total, label = 'Mover a la papelera') {
    return `<div class="bottombar"><span class="muted" id="ct">Seleccionado: ${fmtBytes(total)}</span><span class="spacer"></span><select id="dm"><option value="trash" ${App.settings.deleteMode === 'trash' ? 'selected' : ''}>Mover a la papelera</option><option value="permanent" ${App.settings.deleteMode === 'permanent' ? 'selected' : ''}>Eliminar permanentemente</option></select><button class="btn danger big" id="del">Eliminar</button></div>`;
  }
  async function doDelete(el, paths, after) {
    if (!paths.length) return UI.toast('Nada seleccionado', '', 'warning');
    const mode = $('#dm', el).value;
    if (mode === 'permanent' && !(await UI.modal({ title: 'Eliminar permanentemente', body: `Se borrarán ${paths.length} elementos sin pasar por la papelera. Esta acción no se puede deshacer.`, ok: 'Eliminar', danger: true }))) return;
    const r = await lpc.call('clutter.remove', paths, mode);
    UI.toast('Listo', `${fmtBytes(r.freed)} ${mode === 'trash' ? 'enviados a la papelera' : 'eliminados'}${r.errors.length ? ` · ${r.errors.length} errores` : ''}`, r.errors.length ? 'warning' : 'success');
    after();
  }

  Views.clutter = {
    render(el) {
      el.innerHTML = `<h1>Mi desorden</h1><p class="lead">Encuentra archivos enormes u olvidados, copias duplicadas (aunque tengan otro nombre), fotos casi idénticas y descargas acumuladas.</p>
        <div class="row wrap"><div class="tabs">${[['large', 'Grandes y antiguos'], ['dups', 'Duplicados'], ['similar', 'Imágenes similares'], ['downloads', 'Descargas']].map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><span class="spacer"></span>
        <div class="row" style="margin-bottom:18px"><span class="muted small" id="rt">${roots ? esc(roots.map(shortPath).join(', ')) : 'Carpeta personal'}</span><button class="btn sm ghost" id="pick">${ICONS.folder} Elegir carpetas</button></div></div><div id="pt"></div>`;
      $('.tabs', el).onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; this.render(el); };
      $('#pick', el).onclick = async () => { const r = await lpc.call('dialog.pick', { title: 'Carpetas a analizar' }); if (r) { roots = r; this.render(el); } };
      this[tab]($('#pt', el), el);
    },

    start(el, host, title, fn) {
      el.innerHTML = `<div class="card"><div class="row"><div><h3>${title}</h3><div class="muted small">Analiza ${roots ? esc(roots.map(shortPath).join(', ')) : 'tu carpeta personal'}.</div></div><span class="spacer"></span><button class="btn primary" id="go">Analizar</button></div></div>`;
      $('#go', el).onclick = async () => {
        el.innerHTML = `<div class="card"><div class="row"><div class="muted small" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" id="cs">Preparando…</div><button class="btn sm ghost" id="cc">Detener</button></div><div class="progress indet" style="margin-top:10px"><i></i></div></div>`;
        $('#cc', el).onclick = () => lpc.call('clutter.cancel');
        await fn(d => { const s = $('#cs', el); if (s) s.textContent = (d.step ? shortPath(d.step) : '') + (d.scanned ? ` · ${d.scanned.toLocaleString('es-MX')} archivos` : ''); });
      };
    },

    large(el, host) {
      this.start(el, host, 'Archivos grandes y antiguos', async prog => {
        const r = await lpc.call('clutter.largeOld', roots ? { roots } : {}, prog);
        let kind = 'all';
        const kinds = [...new Set(r.files.map(f => f.kind))];
        const draw = () => {
          const list = r.files.filter(f => kind === 'all' || (kind === 'old' ? f.old : f.kind === kind));
          el.innerHTML = `<div class="row" style="margin-bottom:10px"><select id="k"><option value="all">Todos (${r.files.length})</option><option value="old">Sin abrir hace mucho</option>${kinds.map(k => `<option ${k === kind ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select><span class="muted small">${r.scanned.toLocaleString('es-MX')} archivos analizados</span></div><div class="card" id="fl"></div>${bottom(el, 0)}`;
          $('#k', el).value = kind; $('#k', el).onchange = e => { kind = e.target.value; draw(); };
          const sl = UI.selectableList($('#fl', el), list.slice(0, 1000), {
            onChange: (s, t) => { const c = $('#ct', el); if (c) c.textContent = 'Seleccionado: ' + fmtBytes(t); },
            render: f => `<div class="t"><b>${esc(f.name)} ${f.old ? '<span class="pill warn">Antiguo</span>' : ''}</b><span>${esc(shortPath(f.path))} · modificado ${fmtDate(f.modified)} · abierto ${fmtAgo(f.accessed)}</span></div><div class="v">${fmtBytes(f.bytes)}<button class="btn sm ghost icon" data-rv="${esc(f.path)}">${ICONS.eye}</button></div>`,
          });
          $('#fl', el).onclick = e => { const b = e.target.closest('[data-rv]'); if (b) { e.preventDefault(); lpc.call('shell.reveal', b.dataset.rv); } };
          $('#del', el).onclick = () => doDelete(el, [...sl.sel], () => { r.files = r.files.filter(f => !sl.sel.has(f.path)); draw(); });
        };
        draw();
      });
    },

    dups(el, host) {
      this.start(el, host, 'Archivos duplicados', async prog => {
        const r = await lpc.call('clutter.duplicates', roots ? { roots } : {}, prog);
        if (!r.groups.length) { el.innerHTML = `<div class="empty">${ICONS.copy}<h3>No hay duplicados</h3></div>`; return; }
        const sel = new Set();
        const wasted = r.groups.reduce((a, g) => a + g.wasted, 0);
        const draw = () => {
          el.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="muted">${r.groups.length} grupos · ${fmtBytes(wasted)} desperdiciados</span><span class="spacer"></span><button class="btn sm ghost" id="auto">Selección automática (conservar el más antiguo)</button><button class="btn sm ghost" id="autonew">Conservar el más reciente</button></div>
            <div id="gl">${r.groups.slice(0, 400).map((g, gi) => `<div class="dupgroup"><div class="row small muted" style="padding:4px 8px">${g.files.length} copias · ${fmtBytes(g.bytes)} c/u</div>${g.files.map((f, fi) => `<label class="item"><input type="checkbox" data-p="${esc(f.path)}" ${sel.has(f.path) ? 'checked' : ''}><div class="t"><b>${esc(f.name)}</b><span>${esc(shortPath(f.path))} · ${fmtDate(f.modified)}</span></div><div class="v">${fi === 0 ? '<span class="pill ok">Original</span>' : ''}<button class="btn sm ghost icon" data-rv="${esc(f.path)}">${ICONS.eye}</button></div></label>`).join('')}</div>`).join('')}</div>${bottom(el, 0)}`;
          const upd = () => { const t = r.groups.flatMap(g => g.files).filter(f => sel.has(f.path)).reduce((a, b) => a + b.bytes, 0); $('#ct', el).textContent = 'Seleccionado: ' + fmtBytes(t); };
          $('#gl', el).onchange = e => { const p = e.target.dataset.p; if (p) { e.target.checked ? sel.add(p) : sel.delete(p); upd(); } };
          $('#gl', el).onclick = e => { const b = e.target.closest('[data-rv]'); if (b) { e.preventDefault(); lpc.call('shell.reveal', b.dataset.rv); } };
          $('#auto', el).onclick = () => { sel.clear(); r.groups.forEach(g => g.files.slice(1).forEach(f => sel.add(f.path))); draw(); };
          $('#autonew', el).onclick = () => { sel.clear(); r.groups.forEach(g => g.files.slice(0, -1).forEach(f => sel.add(f.path))); draw(); };
          $('#del', el).onclick = () => {
            const bad = r.groups.find(g => g.files.every(f => sel.has(f.path)));
            if (bad) return UI.toast('Cuidado', `Seleccionaste todas las copias de «${bad.files[0].name}». Deja al menos una.`, 'warning');
            doDelete(el, [...sel], () => { r.groups = r.groups.map(g => ({ ...g, files: g.files.filter(f => !sel.has(f.path)) })).filter(g => g.files.length > 1); sel.clear(); draw(); });
          };
          upd();
        };
        draw();
      });
    },

    similar(el, host) {
      this.start(el, host, 'Imágenes similares', async prog => {
        const r = await lpc.call('clutter.similar', roots ? { roots } : {}, prog);
        if (!r.groups.length) { el.innerHTML = `<div class="empty">${ICONS.image}<h3>No se encontraron imágenes parecidas</h3><p class="muted">Se analizaron ${r.scanned} imágenes.</p></div>`; return; }
        const sel = new Set();
        r.groups.forEach(g => g.files.slice(1).forEach(f => sel.add(f.path)));
        const draw = () => {
          el.innerHTML = `<div class="muted" style="margin-bottom:10px">${r.groups.length} grupos de fotos parecidas. Preseleccionamos todas menos la de mayor tamaño (mejor calidad) de cada grupo.</div>
            <div id="gl">${r.groups.slice(0, 200).map(g => `<div class="dupgroup"><div class="row wrap" style="gap:12px;padding:6px">${g.files.map((f, i) => `<label style="cursor:pointer;text-align:center;width:130px"><img class="imgthumb" loading="lazy" src="${fileUrl(f.path)}"><div class="row small" style="justify-content:center;margin-top:6px;gap:6px"><input type="checkbox" data-p="${esc(f.path)}" ${sel.has(f.path) ? 'checked' : ''}>${fmtBytes(f.bytes)}</div><div class="dim small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</div>${i === 0 ? '<span class="pill ok">Mejor</span>' : ''}</label>`).join('')}</div></div>`).join('')}</div>${bottom(el, 0)}`;
          const upd = () => { const t = r.groups.flatMap(g => g.files).filter(f => sel.has(f.path)).reduce((a, b) => a + b.bytes, 0); $('#ct', el).textContent = 'Seleccionado: ' + fmtBytes(t); };
          $('#gl', el).onchange = e => { const p = e.target.dataset.p; if (p) { e.target.checked ? sel.add(p) : sel.delete(p); upd(); } };
          $('#del', el).onclick = () => doDelete(el, [...sel], () => { r.groups = r.groups.map(g => ({ ...g, files: g.files.filter(f => !sel.has(f.path)) })).filter(g => g.files.length > 1); sel.clear(); draw(); });
          upd();
        };
        draw();
      });
    },

    async downloads(el) {
      el.innerHTML = '<div class="progress indet"><i></i></div>';
      const list = await lpc.call('clutter.downloads', { olderThanDays: 30 });
      if (!list.length) { el.innerHTML = `<div class="empty">${ICONS.download}<h3>Tu carpeta de Descargas está vacía</h3></div>`; return; }
      el.innerHTML = `<div class="muted" style="margin-bottom:10px">${list.length} elementos · ${fmtBytes(list.reduce((a, b) => a + b.bytes, 0))}. Preseleccionamos los de más de 30 días.</div><div class="card" id="dl"></div>${bottom(el, 0)}`;
      const sl = UI.selectableList($('#dl', el), list, {
        preselect: f => f.old, onChange: (s, t) => { const c = $('#ct', el); if (c) c.textContent = 'Seleccionado: ' + fmtBytes(t); },
        render: f => `<div class="t"><b>${esc(f.name)} ${f.old ? '<span class="pill warn">+30 días</span>' : ''}</b><span>${esc(f.kind)} · ${fmtDate(f.modified)}</span></div><div class="v">${fmtBytes(f.bytes)}</div>`,
      });
      $('#del', el).onclick = () => doDelete(el, [...sl.sel], () => this.downloads(el));
    },
  };
})();
