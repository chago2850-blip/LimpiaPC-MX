// LimpiaPc-MX — Triturador de archivos  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, esc, fmtBytes, shortPath } = UI;
  let files = [];

  Views.shredder = {
    render(el) {
      el.innerHTML = `<h1>Triturador</h1><p class="lead">Elimina archivos confidenciales de forma que no puedan recuperarse: se sobrescriben con datos aleatorios varias veces, se renombran y luego se borran. También sirve para archivos que se niegan a eliminarse.</p>
        <div class="card" id="drop" style="border-style:dashed;text-align:center;padding:40px;--c:var(--m-shredder)"><div class="ico" style="margin:0 auto 12px">${ICONS.shredder}</div><h3>Arrastra aquí archivos o carpetas</h3><div class="muted small" style="margin-bottom:14px">o</div><button class="btn primary" id="add">${ICONS.plus} Agregar elementos</button></div>
        <div class="card" style="margin-top:14px" id="fl"></div>
        <div class="card" style="margin-top:14px"><div class="row"><div><h3 style="margin:0">Nivel de seguridad</h3><div class="muted small">En unidades SSD la sobrescritura no garantiza el borrado físico por el nivelado de desgaste; combínalo con el cifrado del disco (FileVault, BitLocker, LUKS).</div></div><span class="spacer"></span>
          <select id="passes"><option value="1">Rápido · 1 pasada</option><option value="3" selected>Estándar · 3 pasadas</option><option value="7">Paranoico · 7 pasadas</option></select></div></div>
        <div class="bottombar"><span class="spacer"></span><button class="btn danger big" id="go">${ICONS.shredder} Triturar</button></div>`;
      const draw = () => {
        $('#fl', el).innerHTML = files.length ? `<div class="list">${files.map((f, i) => `<div class="item"><div class="thumb">${ICONS.file}</div><div class="t"><b>${esc(f.split(/[\\/]/).pop())}</b><span>${esc(shortPath(f))}</span></div><div class="v"><button class="btn sm ghost icon" data-x="${i}">${ICONS.x}</button></div></div>`).join('')}</div>` : '<div class="muted small">No hay elementos en la lista.</div>';
      };
      draw();
      $('#fl', el).onclick = e => { const b = e.target.closest('[data-x]'); if (b) { files.splice(+b.dataset.x, 1); draw(); } };
      $('#add', el).onclick = async () => { const r = await lpc.call('dialog.pick', { files: true, title: 'Elementos a triturar' }); if (r) { files = [...new Set([...files, ...r])]; draw(); } };
      const drop = $('#drop', el);
      drop.ondragover = e => { e.preventDefault(); drop.style.background = 'var(--glass2)'; };
      drop.ondragleave = () => { drop.style.background = ''; };
      drop.ondrop = e => { e.preventDefault(); drop.style.background = ''; files = [...new Set([...files, ...[...e.dataTransfer.files].map(f => lpc.pathForFile(f))])]; draw(); };
      $('#go', el).onclick = async () => {
        if (!files.length) return UI.toast('Agrega elementos', '', 'warning');
        if (!(await UI.modal({ title: 'Triturar definitivamente', body: `Se destruirán ${files.length} elementos. <b>No podrás recuperarlos de ninguna manera.</b>`, ok: 'Triturar', danger: true }))) return;
        const sc = UI.scanning(el, { key: 'shredder', title: 'Triturando…' });
        const r = await lpc.call('storage.shred', files, { passes: +$('#passes', el).value }, d => sc.update({ step: d.step }));
        sc.stop(); files = [];
        UI.doneView(el, { title: 'Elementos destruidos', sub: `${fmtBytes(r.freed)} triturados de forma segura.${r.errors.length ? ` ${r.errors.length} elementos no se pudieron triturar.` : ''}`, back: () => this.render(el) });
      };
    },
  };
})();
