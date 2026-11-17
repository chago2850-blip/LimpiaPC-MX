// LimpiaPc-MX — Limpieza  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, $$, esc, fmtBytes, shortPath } = UI;

  Views.cleanup = {
    render(el) {
      UI.hero(el, {
        key: 'cleanup', title: 'Limpieza',
        desc: 'Libera espacio eliminando basura del sistema, cachés, registros, archivos temporales, papelera y restos de desarrollo. Solo se tocan archivos que el sistema y las apps regeneran.',
        feats: [['Basura del sistema', 'Cachés, registros, informes de fallos y temporales.'], ['Navegadores y desarrolladores', 'Cachés de Chrome, Edge, Firefox, Safari, npm, pip, Xcode y más.'], ['Papelera y descargas incompletas', 'Vacía la papelera y quita descargas abandonadas.']],
        action: 'Analizar', onStart: () => this.scan(el),
      });
    },
    async scan(el) {
      const sc = UI.scanning(el, { key: 'cleanup', title: 'Buscando basura…' });
      const res = await lpc.call('cleanup.scan', {}, d => sc.update(d));
      sc.stop();
      this.results(el, res);
    },
    results(el, res) {
      const cats = res.filter(c => c.bytes > 0 || c.count > 0);
      if (!cats.length) return UI.doneView(el, { title: 'Todo limpio', sub: 'No encontramos basura que eliminar.', back: () => this.render(el) });
      // selección: catId -> Set(paths) ; las categorías "safe" van preseleccionadas
      const sel = {}; cats.forEach(c => { sel[c.id] = new Set(c.safe ? c.items.map(i => i.path) : []); });
      let current = cats[0].id;
      el.innerHTML = `<div class="row"><div><h1>Limpieza</h1><p class="lead">Encontramos ${fmtBytes(cats.reduce((a, c) => a + c.bytes, 0))} de basura. Las categorías marcadas como <span class="pill warn">Admin</span> pedirán tu contraseña.</p></div></div>
        <div class="split"><div class="card" id="cats"></div><div class="card" id="items"></div></div>
        <div class="bottombar"><span class="muted" id="tot"></span><span class="spacer"></span><button class="btn ghost" id="again">${ICONS.refresh} Volver a analizar</button><button class="btn primary big" id="go">Limpiar</button></div>`;
      const catBytes = c => c.items.filter(i => sel[c.id].has(i.path)).reduce((a, b) => a + b.bytes, 0);
      const drawCats = () => {
        $('#cats', el).innerHTML = cats.map(c => {
          const n = sel[c.id].size, all = n === c.items.length && n > 0;
          return `<div class="cat ${c.id === current ? 'sel' : ''}" data-id="${c.id}"><input type="checkbox" data-cat="${c.id}" ${all ? 'checked' : ''} ${n && !all ? 'data-ind="1"' : ''}><div><b>${esc(c.name)}</b><span>${esc(c.group)}${c.admin ? ' · <span class="pill warn">Admin</span>' : ''}</span></div><div class="muted small">${fmtBytes(c.bytes)}</div></div>`;
        }).join('');
        $$('[data-ind]', el).forEach(i => i.indeterminate = true);
        const total = cats.reduce((a, c) => a + catBytes(c), 0);
        $('#tot', el).textContent = `Seleccionado: ${fmtBytes(total)}`;
        $('#go', el).disabled = !total && !cats.some(c => sel[c.id].size);
      };
      const drawItems = () => {
        const c = cats.find(x => x.id === current);
        $('#items', el).innerHTML = `<div class="row" style="margin-bottom:8px"><div><h2 style="margin:0">${esc(c.name)}</h2><div class="muted small">${esc(c.desc)}</div></div><span class="spacer"></span><button class="btn sm ghost" id="all">Todo</button><button class="btn sm ghost" id="none">Nada</button></div>
          <div class="list">${c.items.map((it, i) => `<label class="item"><input type="checkbox" data-it="${i}" ${sel[c.id].has(it.path) ? 'checked' : ''}><div class="t"><b>${esc(it.path.split(/[\\/]/).pop())}</b><span>${esc(shortPath(it.path))}</span></div><div class="v">${fmtBytes(it.bytes)}${it.virtual ? '' : `<button class="btn sm ghost icon" data-reveal="${i}" title="Mostrar">${ICONS.eye}</button>`}</div></label>`).join('')}</div>
          ${c.count > c.items.length ? `<div class="muted small" style="margin-top:8px">Mostrando los ${c.items.length} elementos más grandes de ${c.count}.</div>` : ''}`;
        $('#all', el).onclick = () => { c.items.forEach(i => sel[c.id].add(i.path)); drawItems(); drawCats(); };
        $('#none', el).onclick = () => { sel[c.id].clear(); drawItems(); drawCats(); };
      };
      $('#cats', el).onclick = e => {
        const cb = e.target.closest('[data-cat]');
        if (cb) { const c = cats.find(x => x.id === cb.dataset.cat); if (cb.checked) c.items.forEach(i => sel[c.id].add(i.path)); else sel[c.id].clear(); current = c.id; drawCats(); drawItems(); return; }
        const row = e.target.closest('.cat'); if (row) { current = row.dataset.id; drawCats(); drawItems(); }
      };
      $('#items', el).onclick = e => { const r = e.target.closest('[data-reveal]'); if (r) { e.preventDefault(); lpc.call('shell.reveal', cats.find(x => x.id === current).items[r.dataset.reveal].path); } };
      $('#items', el).onchange = e => { const i = e.target.dataset.it; if (i === undefined) return; const c = cats.find(x => x.id === current); e.target.checked ? sel[c.id].add(c.items[i].path) : sel[c.id].delete(c.items[i].path); drawCats(); };
      $('#again', el).onclick = () => this.scan(el);
      $('#go', el).onclick = async () => {
        const selection = {};
        for (const c of cats) { if (!sel[c.id].size) continue; selection[c.id] = sel[c.id].size === c.items.length ? true : [...sel[c.id]]; }
        const sc = UI.scanning(el, { key: 'cleanup', title: 'Limpiando…' });
        const r = await lpc.call('cleanup.clean', selection, d => sc.update(d));
        sc.stop();
        UI.doneView(el, { title: `${fmtBytes(r.freed)} liberados`, sub: r.errors ? `Algunos elementos estaban en uso y se omitieron (${r.errors}).` : 'Tu equipo quedó reluciente.', back: () => this.render(el) });
      };
      drawCats(); drawItems();
    },
  };
})();
