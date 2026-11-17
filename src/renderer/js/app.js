// LimpiaPc-MX — enrutador y estado global de la interfaz  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
(async function () {
  const { ICONS, $, esc } = UI;
  const NAV = [
    { sec: 'General' },
    { id: 'home', name: 'Panel de salud', icon: 'home' },
    { id: 'smartcare', name: 'Cuidado inteligente', icon: 'smartcare' },
    { sec: 'Módulos' },
    { id: 'cleanup', name: 'Limpieza', icon: 'cleanup' },
    { id: 'protection', name: 'Protección', icon: 'protection' },
    { id: 'performance', name: 'Rendimiento', icon: 'performance' },
    { id: 'apps', name: 'Aplicaciones', icon: 'apps' },
    { id: 'clutter', name: 'Mi desorden', icon: 'clutter' },
    { sec: 'Herramientas' },
    { id: 'spacelens', name: 'Lente de espacio', icon: 'spacelens' },
    { id: 'cloud', name: 'Limpieza de la nube', icon: 'cloud' },
    { id: 'tools', name: 'Mis herramientas', icon: 'tools' },
    { id: 'shredder', name: 'Triturador', icon: 'shredder' },
    { sec: 'LimpiaPc-MX' },
    { id: 'notifications', name: 'Notificaciones', icon: 'bell' },
    { id: 'history', name: 'Historial', icon: 'history' },
    { id: 'settings', name: 'Configuración', icon: 'settings' },
    { id: 'about', name: 'Acerca de', icon: 'info' },
  ];
  const colorVar = id => ({ home: 'home', smartcare: 'smartcare', cleanup: 'cleanup', protection: 'protection', performance: 'performance', apps: 'apps', clutter: 'clutter', spacelens: 'spacelens', cloud: 'cloud', tools: 'tools', shredder: 'shredder' }[id]);

  const info = await lpc.call('app.info');
  window.__home = info.home;
  window.__info = info;
  document.body.classList.add('platform-' + info.platform);
  let settings = await lpc.call('settings.get');
  window.App = { settings, info, current: null, views: window.Views || {}, cache: {} };

  function applyTheme() {
    const t = App.settings.theme;
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  App.applyTheme = applyTheme;
  App.setSetting = async (k, v) => { App.settings[k] = v; await lpc.call('settings.set', k, v); if (k === 'theme') applyTheme(); };

  const nav = $('#nav');
  nav.innerHTML = NAV.map(n => n.sec ? `<div class="sec">${n.sec}</div>` : `<a data-id="${n.id}" style="${colorVar(n.id) ? `--c:var(--m-${colorVar(n.id)})` : ''}">${ICONS[n.icon]}<span>${esc(n.name)}</span>${n.id === 'notifications' ? '<span class="badge" id="nb" hidden></span>' : ''}</a>`).join('');
  nav.addEventListener('click', e => { const a = e.target.closest('a[data-id]'); if (a) go(a.dataset.id); });

  $('#tb-screen').innerHTML = ICONS.monitor;
  $('#tb-screen').onclick = async () => {
    if (await UI.modal({ title: 'Modo limpieza de pantalla', body: 'La pantalla se pondrá en negro y se bloquearán el teclado, el ratón y el panel táctil para que puedas limpiarla con tranquilidad.<br><br>Para salir, <b>mantén presionada la tecla Esc durante 3 segundos</b> (o Ctrl/⌘ + Mayús + Esc).', ok: 'Comenzar' })) lpc.call('screen.clean');
  };
  $('#tb-bell').innerHTML = ICONS.bell;
  $('#tb-bell').onclick = () => go('notifications');

  const view = $('#view');
  async function go(id, opts) {
    if (!App.views[id]) id = 'home';
    if (App.current && App.views[App.current] && App.views[App.current].leave) App.views[App.current].leave();
    App.current = id;
    for (const a of nav.querySelectorAll('a')) a.classList.toggle('active', a.dataset.id === id);
    view.innerHTML = ''; view.scrollTop = 0;
    view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
    try { await App.views[id].render(view, opts); }
    catch (e) { console.error(e); view.innerHTML = `<div class="empty">${ICONS.warn}<h2>Ocurrió un error</h2><p class="muted sel-text">${esc(e.message)}</p></div>`; }
  }
  App.go = go;
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });

  // Indicadores de la barra lateral
  App.lastHealth = null;
  lpc.on('health:tick', s => {
    App.lastHealth = s;
    $('#sf-disk').textContent = Math.round(s.disk.pct) + '%'; $('#sf-disk-bar').style.width = s.disk.pct + '%';
    $('#sf-ram').textContent = Math.round(s.mem.pct) + '%'; $('#sf-ram-bar').style.width = s.mem.pct + '%';
    if (App.views[App.current] && App.views[App.current].tick) App.views[App.current].tick(s);
  });

  async function refreshBadge() {
    const list = await lpc.call('notifications.list');
    const n = list.filter(x => !x.read).length;
    const b = $('#nb'); if (b) { b.hidden = !n; b.textContent = n; }
  }
  App.refreshBadge = refreshBadge;
  lpc.on('notifications:new', n => { refreshBadge(); UI.toast(n.title, n.body, n.level === 'danger' ? 'danger' : n.level); if (App.current === 'notifications') go('notifications'); });
  lpc.on('navigate', id => go(id));
  refreshBadge();

  go(location.hash.slice(1) || 'home');
})();
