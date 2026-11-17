// LimpiaPc-MX — Limpieza de la nube  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, esc, fmtBytes, fmtDate, fmtAgo, shortPath } = UI;
  const SVC = { icloud: ['iCloud', '#60a5fa'], onedrive: ['OneDrive', '#38bdf8'], gdrive: ['Google Drive', '#34d399'], dropbox: ['Dropbox', '#3b82f6'], nextcloud: ['Nextcloud', '#0ea5e9'], mega: ['MEGA', '#f43f5e'], box: ['Box', '#2563eb'], pcloud: ['pCloud', '#22d3ee'], otro: ['Nube', '#a78bfa'] };

  Views.cloud = {
    async render(el) {
      const folders = await lpc.call('storage.cloudFolders');
      el.innerHTML = `<h1>Limpieza de la nube</h1><p class="lead">Un solo panel para iCloud Drive, OneDrive, Google Drive, Dropbox, Nextcloud y MEGA. Descubre cuánto espacio local ocupan tus archivos sincronizados, libera copias locales sin perderlas de la nube o elimina lo que ya no necesitas.</p>
        ${folders.length ? `<div class="grid g3">${folders.map((f, i) => `<div class="card hover" data-f="${i}" style="--c:${(SVC[f.service] || SVC.otro)[1]}"><div class="ico">${ICONS.cloud}</div><h3>${esc(f.name)}</h3><div class="muted small">${esc(shortPath(f.path))}</div>${f.canEvict ? '<span class="pill info" style="margin-top:8px;display:inline-block">Admite liberar copia local</span>' : ''}</div>`).join('')}</div>`
        : `<div class="empty">${ICONS.cloud}<h3>No encontramos carpetas de nube sincronizadas</h3><p class="muted">Instala el cliente de escritorio de tu servicio (OneDrive, Google Drive, Dropbox, iCloud, Nextcloud…) y vuelve aquí.</p></div>`}`;
      el.onclick = e => { const c = e.target.closest('[data-f]'); if (c) this.scan(el, folders[c.dataset.f]); };
    },
    async scan(el, f) {
      el.onclick = null;
      const sc = UI.scanning(el, { key: 'cloud', title: 'Analizando ' + f.name + '…' });
      const r = await lpc.call('storage.cloudScan', f.path, d => sc.update({ step: d.step, scanned: d.scanned }));
      sc.stop();
      const pct = r.logical ? Math.round(r.local / r.logical * 100) : 0;
      el.innerHTML = `<div class="row"><h1 style="margin:0">${esc(f.name)}</h1><span class="spacer"></span><button class="btn ghost" id="bk">Volver</button></div>
        <div class="grid g3" style="margin:16px 0"><div class="card"><div class="muted small">Ocupa en tu disco</div><div class="stat-big">${fmtBytes(r.local)}</div></div><div class="card"><div class="muted small">Tamaño total en la nube</div><div class="stat-big">${fmtBytes(r.logical)}</div></div><div class="card"><div class="muted small">Archivos</div><div class="stat-big">${r.count.toLocaleString('es-MX')}</div><div class="muted small">${pct}% descargado localmente</div></div></div>
        <div class="card" id="cl"></div>
        <div class="bottombar"><span class="muted" id="ct"></span><span class="spacer"></span>${f.canEvict ? '<button class="btn primary" id="ev">Liberar copia local</button>' : ''}<button class="btn danger" id="rm">Eliminar</button></div>`;
      $('#bk', el).onclick = () => this.render(el);
      const files = r.files.filter(x => x.local > 0 || !f.canEvict);
      const sl = UI.selectableList($('#cl', el), files, {
        size: x => x.local, onChange: (s, t) => { const c = $('#ct', el); if (c) c.textContent = `Seleccionado: ${s.size} · ${fmtBytes(t)} locales`; },
        render: x => `<div class="t"><b>${esc(x.name)}</b><span>${esc(shortPath(x.path))} · abierto ${fmtAgo(x.accessed)}</span></div><div class="v">${x.local < x.bytes ? '<span class="pill">Solo en la nube</span>' : ''}${fmtBytes(x.local)}</div>`,
      });
      if ($('#ev', el)) $('#ev', el).onclick = async () => {
        if (!sl.sel.size) return;
        const res = await lpc.call('storage.cloudEvict', [...sl.sel]);
        UI.toast('Copias locales liberadas', `${res.ok} archivos ahora solo están en la nube.${res.errors.length ? ' ' + res.errors.length + ' errores.' : ''}`, res.errors.length ? 'warning' : 'success');
        this.scan(el, f);
      };
      $('#rm', el).onclick = async () => {
        if (!sl.sel.size) return;
        if (!(await UI.modal({ title: 'Eliminar de la nube', body: `Los ${sl.sel.size} archivos se moverán a la papelera y <b>también se eliminarán de ${esc(f.name)}</b> en todos tus dispositivos al sincronizar.`, ok: 'Eliminar', danger: true }))) return;
        const res = await lpc.call('clutter.remove', [...sl.sel], 'trash');
        UI.toast('Eliminado', fmtBytes(res.freed), 'success'); this.scan(el, f);
      };
    },
  };
})();
