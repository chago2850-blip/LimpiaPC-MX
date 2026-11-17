// LimpiaPc-MX — Rendimiento  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, $$, esc, fmtBytes } = UI;
  let tab = 'tasks', procTimer = null;

  Views.performance = {
    leave() { clearInterval(procTimer); },
    render(el) {
      clearInterval(procTimer);
      el.innerHTML = `<h1>Rendimiento</h1><p class="lead">Acelera tu equipo con tareas de mantenimiento, controla qué se abre al iniciar y cierra los procesos que acaparan recursos.</p>
        <div class="tabs">${[['tasks', 'Tareas de mantenimiento'], ['startup', 'Elementos de inicio'], ['procs', 'Consumo pesado']].map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div id="pt"></div>`;
      $('.tabs', el).onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; this.render(el); };
      this[tab]($('#pt', el));
    },

    async tasks(el) {
      const tasks = await lpc.call('performance.tasks');
      el.innerHTML = `<div class="card"><div class="list">${tasks.map(t => `<label class="item"><input type="checkbox" data-id="${t.id}" ${t.recommended ? 'checked' : ''}><div class="t"><b>${esc(t.name)} ${t.recommended ? '<span class="pill ok">Recomendada</span>' : ''}</b><span>${esc(t.desc)}</span></div><div class="v" id="st-${t.id}">${t.admin ? '<span class="pill warn">Admin</span>' : ''}</div></label>`).join('')}</div></div>
        <div class="card" id="out" style="margin-top:14px;display:none"><h3>Resultado</h3><pre class="out" id="log"></pre></div>
        <div class="bottombar"><span class="muted">Las tareas marcadas como Admin te pedirán tu contraseña.</span><span class="spacer"></span><button class="btn primary big" id="run">${ICONS.play} Ejecutar</button></div>`;
      $('#run', el).onclick = async e => {
        const ids = $$('input[data-id]:checked', el).map(c => c.dataset.id);
        if (!ids.length) return;
        e.target.disabled = true; $('#out', el).style.display = '';
        const log = $('#log', el); log.textContent = '';
        for (const id of ids) {
          const st = $('#st-' + id, el); st.innerHTML = '<span class="pill info pulse">Ejecutando…</span>';
          const r = await lpc.call('performance.runTask', id);
          st.innerHTML = r.ok ? '<span class="pill ok">Hecho</span>' : '<span class="pill bad">Falló</span>';
          log.textContent += `▸ ${tasks.find(t => t.id === id).name}: ${r.ok ? 'correcto' : 'error'}\n${(r.output || r.error || '').trim().slice(0, 1500)}\n\n`;
        }
        e.target.disabled = false;
        UI.toast('Mantenimiento', 'Tareas completadas.', 'success');
      };
    },

    async startup(el) {
      el.innerHTML = '<div class="progress indet"><i></i></div>';
      const items = await lpc.call('performance.startup');
      if (!items.length) { el.innerHTML = `<div class="empty">${ICONS.rocket}<h3>No hay elementos de inicio</h3></div>`; return; }
      const groups = {};
      items.forEach((it, i) => { it._i = i; (groups[it.kind] = groups[it.kind] || []).push(it); });
      el.innerHTML = `<div class="muted small" style="margin-bottom:10px">${items.filter(i => i.enabled).length} de ${items.length} elementos se ejecutan al iniciar.</div>` + Object.entries(groups).map(([k, arr]) => `<div class="card" style="margin-bottom:14px"><h3>${esc(k)}</h3><div class="list">${arr.map(it => `
        <div class="item"><div class="thumb">${ICONS.rocket}</div><div class="t"><b>${esc(it.name)} <span class="pill">${esc(it.scope)}</span></b><span title="${esc(it.command)}">${esc(it.command || '')}</span></div>
        <div class="v">${it.canRemove ? `<button class="btn sm ghost icon" data-rm="${it._i}" title="Eliminar">${ICONS.trash}</button>` : ''}${it.canToggle ? `<input type="checkbox" class="switch" data-tg="${it._i}" ${it.enabled ? 'checked' : ''}>` : `<span class="pill ${it.enabled ? 'ok' : ''}">${it.enabled ? 'Activo' : 'Inactivo'}</span>`}</div></div>`).join('')}</div></div>`).join('');
      el.onchange = async e => {
        const i = e.target.dataset.tg; if (i === undefined) return;
        const ok = await lpc.call('performance.toggleStartup', items[i], e.target.checked);
        if (!ok) { e.target.checked = !e.target.checked; UI.toast('No se pudo cambiar', 'Puede requerir permisos de administrador.', 'warning'); }
        else UI.toast(items[i].name, e.target.checked ? 'Se iniciará con el sistema.' : 'Ya no se iniciará con el sistema.', 'success');
      };
      el.onclick = async e => {
        const b = e.target.closest('[data-rm]'); if (!b) return;
        const it = items[b.dataset.rm];
        if (!(await UI.modal({ title: 'Eliminar elemento de inicio', body: `¿Quitar <b>${esc(it.name)}</b> del arranque? No se desinstala la aplicación.`, ok: 'Quitar', danger: true }))) return;
        const ok = await lpc.call('performance.removeStartup', it);
        UI.toast(ok ? 'Eliminado' : 'No se pudo eliminar', it.name, ok ? 'success' : 'warning');
        this.startup(el);
      };
    },

    async procs(el) {
      const draw = async () => {
        if (!document.body.contains(el)) return clearInterval(procTimer);
        const p = await lpc.call('performance.processes');
        const row = (x, metric) => `<div class="item"><div class="thumb">${ICONS.cpu}</div><div class="t"><b>${esc(x.name)}</b><span>PID ${x.pid} · ${esc(x.user || '')}</span></div><div class="v"><b style="color:var(--text)">${metric}</b><button class="btn sm ghost" data-kill="${x.pid}" data-name="${esc(x.name)}">Cerrar</button></div></div>`;
        el.innerHTML = `<div class="grid g2"><div class="card"><h3>Mayor uso de memoria</h3><div class="list">${p.byMem.map(x => row(x, fmtBytes(x.mem))).join('')}</div></div>
          <div class="card"><h3>Mayor uso de procesador</h3><div class="list">${p.byCpu.map(x => row(x, x.cpu + '%')).join('')}</div></div></div>
          <div class="muted small" style="margin-top:10px">${p.total} procesos en ejecución · se actualiza cada 4 segundos.</div>`;
      };
      el.onclick = async e => {
        const b = e.target.closest('[data-kill]'); if (!b) return;
        if (!(await UI.modal({ title: 'Cerrar proceso', body: `¿Forzar el cierre de <b>${esc(b.dataset.name)}</b>? Podrías perder trabajo no guardado.`, ok: 'Cerrar', danger: true }))) return;
        const ok = await lpc.call('performance.kill', +b.dataset.kill);
        UI.toast(ok ? 'Proceso cerrado' : 'No se pudo cerrar', b.dataset.name, ok ? 'success' : 'warning'); draw();
      };
      await draw();
      procTimer = setInterval(draw, 4000);
    },
  };
})();
