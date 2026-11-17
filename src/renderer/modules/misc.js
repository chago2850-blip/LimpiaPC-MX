// LimpiaPc-MX — Notificaciones, Historial, Configuración y Acerca de  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, $$, esc, fmtBytes, fmtAgo, fmtDate, shortPath } = UI;
  const LV = { info: ['#22d3ee', 'info'], success: ['#34d399', 'check'], warning: ['#fbbf24', 'warn'], danger: ['#fb7185', 'protection'] };

  Views.notifications = {
    async render(el) {
      const list = await lpc.call('notifications.list');
      await lpc.call('notifications.markRead'); App.refreshBadge();
      el.innerHTML = `<div class="row"><div><h1>Centro de notificaciones</h1><p class="lead">Avisos de salud, amenazas, recordatorios de mantenimiento y resultados de tus tareas, todo en un solo lugar.</p></div><span class="spacer"></span>${list.length ? '<button class="btn ghost" id="clr">Borrar todo</button>' : ''}</div>
        <div class="card">${list.length ? list.map(n => { const [c, ic] = LV[n.level] || LV.info; return `<div class="notif"><div class="dot" style="background:${c}22;color:${c}">${ICONS[ic]}</div><div><b>${esc(n.title)}</b><div class="muted small">${esc(n.body)}</div></div><div class="row"><span class="dim small">${fmtAgo(n.at)}</span>${n.action ? `<button class="btn sm ghost" data-go="${esc(n.action)}">Abrir</button>` : ''}</div></div>`; }).join('') : `<div class="empty">${ICONS.bell}<h3>Sin notificaciones</h3></div>`}</div>`;
      const c = $('#clr', el); if (c) c.onclick = async () => { await lpc.call('notifications.clear'); this.render(el); App.refreshBadge(); };
    },
  };

  Views.history = {
    async render(el) {
      const { history, totalFreed } = await lpc.call('history.list');
      el.innerHTML = `<h1>Historial</h1><p class="lead">Todo lo que LimpiaPc-MX ha hecho por tu equipo.</p>
        <div class="grid g3" style="margin-bottom:16px"><div class="card"><div class="muted small">Espacio liberado en total</div><div class="stat-big">${fmtBytes(totalFreed)}</div></div><div class="card"><div class="muted small">Operaciones</div><div class="stat-big">${history.length}</div></div><div class="card"><div class="muted small">Último cuidado inteligente</div><div class="stat-big" style="font-size:20px">${App.settings.lastSmartCare ? fmtAgo(App.settings.lastSmartCare) : 'Nunca'}</div></div></div>
        <div class="card"><div class="list">${history.map(x => `<div class="item"><div class="thumb">${ICONS.history}</div><div class="t"><b>${esc(x.type[0].toUpperCase() + x.type.slice(1))}</b><span>${esc(x.detail || '')}</span></div><div class="v">${x.freed ? fmtBytes(x.freed) + ' · ' : ''}${fmtDate(x.at)}</div></div>`).join('') || '<div class="empty">Sin actividad todavía</div>'}</div></div>`;
    },
  };

  Views.settings = {
    async render(el) {
      const s = App.settings = await lpc.call('settings.get');
      const sw = (k, v) => `<input type="checkbox" class="switch" data-s="${k}" ${v ? 'checked' : ''}>`;
      const row = (t, d, ctl) => `<div class="item" style="grid-template-columns:1fr auto"><div class="t"><b>${t}</b><span style="white-space:normal">${d}</span></div><div class="v">${ctl}</div></div>`;
      el.innerHTML = `<h1>Configuración</h1><p class="lead">Ajusta LimpiaPc-MX a tu manera.</p>
        <div class="grid g2">
        <div class="card"><h2>General</h2><div class="list">
          ${row('Tema', 'Claro, oscuro o según el sistema.', `<select data-sel="theme"><option value="auto">Automático</option><option value="dark">Oscuro</option><option value="light">Claro</option></select>`)}
          ${row('Iniciar con el sistema', 'Abre LimpiaPc-MX en segundo plano al encender (monitor y alertas).', sw('launchAtLogin', s.launchAtLogin))}
          ${row('Iniciar minimizado', 'Mantener la ventana oculta en la bandeja / barra de menús.', sw('startMinimized', s.startMinimized))}
          ${row('Al eliminar archivos personales', 'Los archivos de Mi desorden, apps y extensiones.', `<select data-sel="deleteMode"><option value="trash">Mover a la papelera</option><option value="permanent">Eliminar permanentemente</option></select>`)}
          ${row('Recordatorio de Cuidado inteligente', 'Cada cuántos días te lo recordamos.', `<input type="number" min="1" max="60" data-num="smartCareReminderDays" value="${s.smartCareReminderDays}" style="width:80px">`)}
        </div></div>
        <div class="card"><h2>Protección y alertas</h2><div class="list">
          ${row('Protección en tiempo real', 'Vigila Descargas y elementos de inicio.', sw('realtimeProtection', s.realtimeProtection))}
          ${row('Alerta de disco lleno', 'Avisar cuando quede menos de este % libre.', `<input type="number" min="1" max="50" data-alert="diskLowPercent" value="${s.alerts.diskLowPercent}" style="width:80px">`)}
          ${row('Alerta de RAM', 'Avisar cuando la memoria supere este %.', `<input type="number" min="50" max="100" data-alert="ramHighPercent" value="${s.alerts.ramHighPercent}" style="width:80px">`)}
          ${row('Alerta de temperatura (°C)', 'Avisar si el procesador supera esta temperatura.', `<input type="number" min="50" max="110" data-alert="tempHighC" value="${s.alerts.tempHighC}" style="width:80px">`)}
        </div></div>
        <div class="card"><h2>Mi desorden</h2><div class="list">
          ${row('Tamaño mínimo de "archivo grande" (MB)', '', `<input type="number" min="5" data-num="largeFileMinMB" value="${s.largeFileMinMB}" style="width:90px">`)}
          ${row('Días para considerar un archivo "antiguo"', '', `<input type="number" min="7" data-num="oldFileDays" value="${s.oldFileDays}" style="width:90px">`)}
        </div></div>
        <div class="card"><div class="row"><h2 style="margin:0">Lista de exclusiones</h2><span class="spacer"></span><button class="btn sm ghost" id="addex">${ICONS.plus} Agregar</button></div><div class="muted small" style="margin:6px 0 10px">LimpiaPc-MX nunca tocará estas carpetas.</div>
          <div class="list" id="exl">${(s.exclusions || []).map((x, i) => `<div class="item"><div class="thumb">${ICONS.lock}</div><div class="t"><span>${esc(shortPath(x))}</span></div><div class="v"><button class="btn sm ghost icon" data-rmex="${i}">${ICONS.x}</button></div></div>`).join('') || '<div class="muted small">Sin exclusiones.</div>'}</div></div>
        </div>`;
      $$('[data-sel]', el).forEach(x => { x.value = s[x.dataset.sel]; x.onchange = () => App.setSetting(x.dataset.sel, x.value); });
      $$('[data-s]', el).forEach(x => x.onchange = () => App.setSetting(x.dataset.s, x.checked));
      $$('[data-num]', el).forEach(x => x.onchange = () => App.setSetting(x.dataset.num, +x.value));
      $$('[data-alert]', el).forEach(x => x.onchange = () => App.setSetting('alerts', { ...App.settings.alerts, [x.dataset.alert]: +x.value }));
      $('#addex', el).onclick = async () => { const r = await lpc.call('dialog.pick', { title: 'Carpeta a excluir' }); if (r) { await App.setSetting('exclusions', [...new Set([...(s.exclusions || []), ...r])]); this.render(el); } };
      $('#exl', el).onclick = async e => { const b = e.target.closest('[data-rmex]'); if (b) { const ex = [...s.exclusions]; ex.splice(+b.dataset.rmex, 1); await App.setSetting('exclusions', ex); this.render(el); } };
    },
  };

  Views.about = {
    render(el) {
      const i = window.__info;
      el.innerHTML = `<div style="text-align:center;padding-top:30px"><img src="../../assets/logo-512.png" style="width:150px;filter:drop-shadow(0 20px 40px rgba(139,92,246,.5))">
        <h1 style="margin-top:14px">LimpiaPc-MX</h1><div class="muted">Versión ${esc(i.version)} · ${esc({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[i.platform])} ${esc(i.arch)} · Electron ${esc(i.electron)}</div>
        <p class="lead" style="margin:18px auto">Suite integral y <b>libre</b> de mantenimiento para tu computadora. Limpia, protege, acelera y ordena tu equipo en macOS, Windows y Linux.</p>
        <div class="card" style="max-width:620px;margin:0 auto;text-align:left"><div class="kv sel-text">
          <span>Desarrollador</span><span>Santiago Miguel</span>
          <span>Contacto</span><span>chago2850@gmail.com · 744 354 8848</span>
          <span>Licencia</span><span>GNU GPL versión 3 o posterior (GPL-3.0-or-later)</span>
          <span>Código fuente</span><span>github.com/chago2850-blip/LimpiaPc-MX</span>
        </div><p class="muted small" style="margin-top:14px;line-height:1.55">Este programa es software libre: puedes redistribuirlo y/o modificarlo bajo los términos de la Licencia Pública General GNU publicada por la Free Software Foundation, versión 3 o (a tu elección) cualquier versión posterior. Se distribuye con la esperanza de que sea útil, pero SIN NINGUNA GARANTÍA.</p>
        <div class="row" style="justify-content:center;margin-top:8px"><button class="btn ghost" id="gh">${ICONS.github} Ver en GitHub</button><button class="btn ghost" id="lic">Leer la licencia</button></div></div></div>`;
      $('#gh', el).onclick = () => lpc.call('shell.external', 'https://github.com/chago2850-blip/LimpiaPc-MX');
      $('#lic', el).onclick = () => lpc.call('shell.external', 'https://www.gnu.org/licenses/gpl-3.0.html');
    },
  };
})();
