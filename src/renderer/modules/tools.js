// LimpiaPc-MX — Mis herramientas: herramientas fijadas, acciones rápidas y flujos  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, $$, esc, fmtBytes } = UI;
  const ALL_TOOLS = [
    ['smartcare', 'Cuidado inteligente'], ['cleanup', 'Limpieza'], ['protection', 'Protección'], ['performance', 'Rendimiento'], ['apps', 'Aplicaciones'],
    ['clutter', 'Mi desorden'], ['spacelens', 'Lente de espacio'], ['cloud', 'Limpieza de la nube'], ['shredder', 'Triturador'],
  ];

  Views.tools = {
    async render(el) {
      const quick = await lpc.call('quick.list');
      const pinned = App.settings.pinnedTools || [];
      const wfs = App.settings.workflows || [];
      el.innerHTML = `<h1>Mis herramientas</h1><p class="lead">Tu centro de control personal: fija tus herramientas favoritas, lanza acciones de un clic y arma flujos de trabajo que ejecutan varias tareas seguidas.</p>
        <div class="row"><h2 style="margin:0">Herramientas fijadas</h2><span class="spacer"></span><button class="btn sm ghost" id="edit">${ICONS.pin} Editar</button></div>
        <div class="grid g4" style="margin:12px 0 26px">${pinned.map(id => { const t = ALL_TOOLS.find(x => x[0] === id); return t ? `<div class="card hover" data-go="${id}" style="--c:var(--m-${id})"><div class="ico">${ICONS[id]}</div><h3>${t[1]}</h3></div>` : ''; }).join('')}
          <div class="card hover" id="scr" style="--c:#94a3b8"><div class="ico">${ICONS.monitor}</div><h3>Limpieza de pantalla</h3></div></div>
        <h2>Acciones rápidas</h2>
        <div class="grid g3" style="margin-bottom:26px">${quick.map(q => { const tip = q.available === false ? `No disponible: ${q.unavailableReason}` : `${q.name}: ${q.desc || ''}${q.admin ? ' (Pedirá tu contraseña de administrador.)' : ''}`; return `<div class="card" ${q.available === false ? 'style="opacity:.55"' : ''} data-tip="${esc(tip)}"><div class="row"><div style="min-width:0"><h3 style="margin:0">${esc(q.name)}</h3>${q.admin ? '<span class="pill warn">Admin</span> ' : ''}${q.available === false ? '<span class="pill">No instalado</span>' : ''}</div><span class="spacer"></span><button class="btn sm primary" data-q="${q.id}" data-tip="${esc(tip)}" aria-label="${esc(tip)}" ${q.available === false ? 'disabled' : ''}>${ICONS.play}</button></div></div>`; }).join('')}</div>
        <div class="row"><h2 style="margin:0">Flujos de trabajo</h2><span class="spacer"></span><button class="btn sm ghost" id="nwf">${ICONS.plus} Nuevo flujo</button></div>
        <div class="grid g2" style="margin-top:12px">${wfs.map(w => `<div class="card"><div class="row"><div><h3 style="margin:0">${esc(w.name)}</h3><div class="muted small">${w.steps.map(s => esc((quick.find(q => q.id === s) || { name: s }).name)).join(' → ')}</div></div><span class="spacer"></span><button class="btn sm ghost icon" data-dw="${w.id}">${ICONS.trash}</button><button class="btn sm primary" data-w="${w.id}">${ICONS.play} Ejecutar</button></div></div>`).join('') || '<div class="muted">Aún no tienes flujos.</div>'}</div>`;
      $('#scr', el).onclick = () => $('#tb-screen').click();
      el.onclick = async e => {
        const q = e.target.closest('[data-q]'), w = e.target.closest('[data-w]'), dw = e.target.closest('[data-dw]');
        if (q) {
          q.disabled = true; q.innerHTML = '…';
          const r = await lpc.call('quick.run', q.dataset.q);
          q.disabled = false; q.innerHTML = ICONS.play;
          UI.toast((quick.find(x => x.id === q.dataset.q) || {}).name || 'Acción', r && r.ok === false ? (r.error || 'No se pudo completar.') : (r && r.freed ? fmtBytes(r.freed) + ' liberados' : 'Completado'), r && r.ok === false ? 'warning' : 'success', r && r.ok === false ? 8000 : 4200);
        }
        if (w) { w.disabled = true; w.textContent = 'Ejecutando…'; await lpc.call('workflow.run', w.dataset.w, () => {}); this.render(el); }
        if (dw) { await App.setSetting('workflows', wfs.filter(x => x.id !== dw.dataset.dw)); this.render(el); }
      };
      $('#edit', el).onclick = async () => {
        const m = UI.h(`<div class="modal-bg"><div class="modal"><h2>Herramientas fijadas</h2><div class="list">${ALL_TOOLS.map(([id, n]) => `<label class="item"><input type="checkbox" value="${id}" ${pinned.includes(id) ? 'checked' : ''}><div class="t"><b>${n}</b></div><div></div></label>`).join('')}</div><div class="actions"><button class="btn primary" id="ok">Guardar</button></div></div></div>`);
        document.body.appendChild(m);
        $('#ok', m).onclick = async () => { await App.setSetting('pinnedTools', $$('input:checked', m).map(i => i.value)); m.remove(); this.render(el); };
      };
      $('#nwf', el).onclick = () => {
        const m = UI.h(`<div class="modal-bg"><div class="modal"><h2>Nuevo flujo de trabajo</h2><input type="text" id="wn" placeholder="Nombre del flujo" style="width:100%;margin-bottom:12px"><div class="muted small" style="margin-bottom:6px">Elige los pasos (se ejecutan en este orden):</div><div class="list" style="max-height:300px;overflow:auto">${quick.filter(q => q.available !== false).map(q => `<label class="item" data-tip="${esc(q.desc || '')}"><input type="checkbox" value="${q.id}"><div class="t"><b>${esc(q.name)}</b></div><div class="v">${q.admin ? '<span class="pill warn">Admin</span>' : ''}</div></label>`).join('')}</div><div class="actions"><button class="btn ghost" id="cx">Cancelar</button><button class="btn primary" id="ok">Crear</button></div></div></div>`);
        document.body.appendChild(m);
        $('#cx', m).onclick = () => m.remove();
        $('#ok', m).onclick = async () => {
          const steps = $$('input:checked', m).map(i => i.value);
          const name = $('#wn', m).value.trim() || 'Mi flujo';
          if (!steps.length) return UI.toast('Agrega pasos', '', 'warning');
          await App.setSetting('workflows', [...wfs, { id: 'wf-' + Date.now(), name, steps }]); m.remove(); this.render(el);
        };
      };
    },
  };
})();
