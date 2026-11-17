// LimpiaPc-MX — Lente de espacio (mapa de burbujas)  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, $$, esc, fmtBytes, shortPath } = UI;
  const PALETTE = ['#8b5cf6', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#a78bfa', '#fb7185', '#2dd4bf', '#c084fc'];
  let state = null;

  Views.spacelens = {
    leave() { lpc.call('storage.cancelLens'); },
    async render(el) {
      const vols = await lpc.call('storage.volumes');
      el.innerHTML = `<h1>Lente de espacio</h1><p class="lead">Mira de un vistazo qué ocupa tu almacenamiento. Las burbujas más grandes son las carpetas que más pesan: entra en ellas y libera espacio en segundos.</p>
        <div class="grid g3">${vols.map((v, i) => `<div class="card hover" data-vol="${i}" style="--c:var(--m-spacelens)"><div class="row"><div class="ico" style="margin:0">${ICONS.disk}</div><div style="min-width:0"><h3 style="margin:0">${esc(v.mount)}</h3><div class="muted small">${esc(v.type || v.fs)}</div></div></div>
          <div class="progress" style="margin-top:14px"><i style="width:${v.use}%"></i></div><div class="row small" style="margin-top:6px"><span>${fmtBytes(v.used)} usados</span><span class="spacer"></span><span class="muted">${fmtBytes(v.available)} libres</span></div></div>`).join('')}
          <div class="card hover" id="home" style="--c:var(--m-spacelens)"><div class="ico">${ICONS.home}</div><h3>Carpeta personal</h3><div class="muted small">${esc(shortPath(window.__home))}</div></div>
          <div class="card hover" id="pick" style="--c:var(--m-spacelens)"><div class="ico">${ICONS.folder}</div><h3>Elegir carpeta…</h3><div class="muted small">Analiza cualquier carpeta o disco externo.</div></div></div>`;
      el.onclick = async e => {
        const v = e.target.closest('[data-vol]'); if (v) return this.scan(el, vols[v.dataset.vol].mount);
        if (e.target.closest('#home')) return this.scan(el, window.__home);
        if (e.target.closest('#pick')) { const r = await lpc.call('dialog.pick', { title: 'Carpeta a analizar' }); if (r) this.scan(el, r[0]); }
      };
    },
    async scan(el, root) {
      el.onclick = null;
      const sc = UI.scanning(el, { key: 'spacelens', title: 'Midiendo el espacio…', onCancel: () => lpc.call('storage.cancelLens') });
      const r = await lpc.call('storage.lens', root, { depth: 3 }, d => sc.update({ step: d.step, scanned: d.files }));
      sc.stop();
      state = { root: r.tree, stack: [r.tree], sel: new Set() };
      this.show(el);
    },
    show(el) {
      const node = state.stack[state.stack.length - 1];
      el.innerHTML = `<div class="row"><h1 style="margin:0">Lente de espacio</h1><span class="spacer"></span><button class="btn ghost" id="back">${ICONS.home} Volúmenes</button></div>
        <div class="crumbs" style="margin-top:10px">${state.stack.map((n, i) => `<a data-crumb="${i}">${esc(i === 0 ? shortPath(n.path) : n.name)}</a>`).join('<span class="dim">›</span>')}<span class="spacer"></span><span class="muted">${fmtBytes(node.size)} · ${node.files.toLocaleString('es-MX')} archivos</span></div>
        <div class="lens-wrap"><div class="card lens-canvas" id="cv"></div><div class="card" style="overflow:auto"><div class="list" id="kids"></div></div></div>
        <div class="bottombar"><span class="muted" id="lt">Seleccionado: 0 B</span><span class="spacer"></span><button class="btn danger big" id="rm">Mover a la papelera</button></div>`;
      $('#back', el).onclick = () => this.render(el);
      $$('[data-crumb]', el).forEach(a => a.onclick = () => { state.stack = state.stack.slice(0, +a.dataset.crumb + 1); this.show(el); });
      this.drawBubbles($('#cv', el), node, el);
      const kids = node.children || [];
      $('#kids', el).innerHTML = kids.map((c, i) => `<label class="item"><input type="checkbox" data-k="${i}" ${c.other ? 'disabled' : ''} ${state.sel.has(c.path) ? 'checked' : ''}><div class="t" ${c.dir && !c.other ? `data-open="${i}" style="cursor:pointer"` : ''}><b>${c.dir ? '📁 ' : ''}${esc(c.name)}</b><span>${c.files ? c.files.toLocaleString('es-MX') + ' archivos' : ''}</span></div><div class="v">${fmtBytes(c.size)}</div></label>`).join('') || '<div class="empty">Carpeta vacía</div>';
      $('#kids', el).onchange = e => { const i = e.target.dataset.k; if (i === undefined) return; const p = kids[i].path; e.target.checked ? state.sel.add(p) : state.sel.delete(p); upd(); };
      $('#kids', el).onclick = e => { const o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); this.open(el, kids[o.dataset.open]); } };
      const upd = () => { const all = []; const walk = n => { if (state.sel.has(n.path) && !n.other) all.push(n.size); else (n.children || []).forEach(walk); }; walk(state.root); $('#lt', el).textContent = `Seleccionado: ${fmtBytes(all.reduce((a, b) => a + b, 0))} (${state.sel.size})`; };
      upd();
      $('#rm', el).onclick = async () => {
        if (!state.sel.size) return;
        if (!(await UI.modal({ title: 'Mover a la papelera', body: `Se moverán ${state.sel.size} elementos a la papelera.`, ok: 'Mover', danger: true }))) return;
        const r = await lpc.call('clutter.remove', [...state.sel], 'trash');
        UI.toast('Espacio liberado', fmtBytes(r.freed) + (r.errors.length ? ` · ${r.errors.length} errores` : ''), r.errors.length ? 'warning' : 'success');
        const prune = n => { if (!n.children) return 0; let rem = 0; n.children = n.children.filter(c => { if (state.sel.has(c.path) && !c.other) { rem += c.size; return false; } return true; }); for (const c of n.children) rem += prune(c); n.size -= rem; return rem; };
        prune(state.root); state.sel.clear(); this.show(el);
      };
    },
    async open(el, n) {
      if (n.other) return;
      if (n.file) return lpc.call('shell.reveal', n.path);
      if (n.children && n.children.length) { state.stack.push(n); return this.show(el); }
      // nodo más profundo que el análisis inicial: escanear bajo demanda
      const cv = $('#cv', el); if (cv) cv.innerHTML = '<div class="scanning" style="min-height:100%"><div class="pulse muted">Analizando ' + esc(n.name) + '…</div></div>';
      const r = await lpc.call('storage.lens', n.path, { depth: 2 }, () => {});
      Object.assign(n, r.tree, { name: n.name });
      state.stack.push(n); this.show(el);
    },
    drawBubbles(cv, node, el) {
      const W = cv.clientWidth || 700, H = cv.clientHeight || 520;
      const data = { name: node.name, children: (node.children || []).map(c => ({ ...c, children: c.children && !c.other ? c.children.filter(g => !g.other).slice(0, 30).map(g => ({ ...g, children: undefined })) : undefined })) };
      const root = d3.hierarchy(data).sum(d => d.children ? 0 : Math.max(d.size, 1)).sort((a, b) => b.value - a.value);
      d3.pack().size([W, H]).padding(d => d.depth === 0 ? 6 : 3)(root);
      const tip = $('#tip');
      let svg = `<svg viewBox="0 0 ${W} ${H}"><defs>${PALETTE.map((c, i) => `<radialGradient id="b${i}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity=".45"/></radialGradient>`).join('')}</defs>`;
      const top = root.children || [];
      top.forEach((n, i) => {
        const ci = i % PALETTE.length;
        svg += `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="url(#b${ci})" stroke="${PALETTE[ci]}" stroke-opacity=".6" data-t="${i}" ${n.data.other ? 'opacity=".35"' : ''}/>`;
        (n.children || []).forEach((c, j) => { svg += `<circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.25)" data-t="${i}" data-c="${j}"/>`; });
      });
      top.forEach(n => { if (n.r > 34) svg += `<text x="${n.x}" y="${n.y - (n.children ? n.r - 18 : -4)}">${esc(n.data.name.length > Math.floor(n.r / 5) ? n.data.name.slice(0, Math.floor(n.r / 5)) + '…' : n.data.name)}</text>${n.r > 50 ? `<text x="${n.x}" y="${n.y - (n.children ? n.r - 32 : -18)}" style="font-weight:400;opacity:.85">${fmtBytes(n.data.size)}</text>` : ''}`; });
      svg += '</svg>';
      cv.innerHTML = svg;
      cv.onmousemove = e => {
        const c = e.target.closest('circle'); if (!c) { tip.style.display = 'none'; return; }
        const t = top[c.dataset.t]; const d = c.dataset.c !== undefined ? t.children[c.dataset.c].data : t.data;
        tip.innerHTML = `<b>${esc(d.name)}</b><br><span class="muted">${fmtBytes(d.size)}${d.files ? ' · ' + d.files.toLocaleString('es-MX') + ' archivos' : ''}</span>`;
        tip.style.display = 'block'; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px';
      };
      cv.onmouseleave = () => { tip.style.display = 'none'; };
      cv.onclick = e => {
        const c = e.target.closest('circle'); if (!c) return; tip.style.display = 'none';
        const t = top[c.dataset.t];
        const n = (node.children || []).find(x => x.path === t.data.path && x.name === t.data.name);
        if (n) this.open(el, n);
      };
    },
  };
})();
