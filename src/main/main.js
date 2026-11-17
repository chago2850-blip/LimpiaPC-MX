// LimpiaPc-MX — proceso principal
// Copyright (C) 2026 Santiago Miguel <chago2850@gmail.com>
//
// Este programa es software libre: puedes redistribuirlo y/o modificarlo
// bajo los términos de la Licencia Pública General GNU publicada por la
// Free Software Foundation, ya sea la versión 3 de la Licencia o
// (a tu elección) cualquier versión posterior.
//
// Se distribuye con la esperanza de que sea útil, pero SIN NINGUNA GARANTÍA.
// Consulta la Licencia Pública General GNU para más detalles.
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog, screen, nativeTheme, globalShortcut } = require('electron');
const path = require('path');
const U = require('./core/util');
const store = require('./core/store');
const cleanup = require('./modules/cleanup');
const protection = require('./modules/protection');
const performance = require('./modules/performance');
const apps = require('./modules/apps');
const clutter = require('./modules/clutter');
const storage = require('./modules/storage');
const health = require('./modules/health');
const smartcare = require('./modules/smartcare');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const RENDERER = path.join(__dirname, '..', 'renderer');

let win = null, mini = null, tray = null, screenCleanWins = [];
let quitting = false;

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => showMain());
if (process.platform === 'win32') app.setAppUserModelId('mx.limpiapc.app');
app.setName('LimpiaPc-MX');

function broadcast(channel, payload) {
  for (const w of [win, mini]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}
store.setBroadcaster(broadcast);

function createMain() {
  const startHidden = process.argv.includes('--oculto');
  win = new BrowserWindow({
    width: 1240, height: 800, minWidth: 980, minHeight: 640,
    title: 'LimpiaPc-MX', icon: path.join(ASSETS, 'icons', '512x512.png'),
    backgroundColor: '#120d2e', show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadFile(path.join(RENDERER, 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden && !store.get('startMinimized')) win.show(); });
  // Capturas automáticas para documentación: LPC_CAPTURE=carpeta
  if (process.env.LPC_CAPTURE) win.webContents.once('did-finish-load', async () => {
    const dir = process.env.LPC_CAPTURE; U.fs.mkdirSync(dir, { recursive: true });
    const views = (process.env.LPC_VIEWS || 'home;smartcare;cleanup;protection;performance;apps;clutter;spacelens;cloud;tools;shredder;settings;about').split(';');
    await new Promise(r => setTimeout(r, 2500));
    if (process.env.LPC_THEME) await win.webContents.executeJavaScript(`App.setSetting('theme','${process.env.LPC_THEME}')`);
    for (const entry of views) {
      const [v, js] = entry.split('|');
      await win.webContents.executeJavaScript(`App.go('${v}')`);
      if (js) { await new Promise(r => setTimeout(r, 800)); await win.webContents.executeJavaScript(js); }
      await new Promise(r => setTimeout(r, +(process.env.LPC_WAIT || 2200)));
      const img = await win.webContents.capturePage();
      U.fs.writeFileSync(path.join(dir, v + (js ? '-2' : '') + '.png'), img.toPNG());
    }
    quitting = true; app.quit();
  });
  win.on('close', e => {
    if (!quitting && tray) { e.preventDefault(); win.hide(); if (process.platform === 'darwin') app.dock && app.dock.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function showMain(view) {
  if (!win || win.isDestroyed()) createMain();
  if (process.platform === 'darwin' && app.dock) app.dock.show();
  win.show(); win.focus();
  if (view) win.webContents.send('navigate', view);
}

// ------------- Mini ventana de la barra de menús / bandeja -------------
function createMini() {
  mini = new BrowserWindow({
    width: 360, height: 540, show: false, frame: false, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, transparent: process.platform === 'darwin', backgroundColor: process.platform === 'darwin' ? '#00000000' : '#17123a',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  mini.loadFile(path.join(RENDERER, 'mini.html'));
  mini.on('blur', () => { if (mini && !mini.webContents.isDevToolsOpened()) mini.hide(); });
}

function toggleMini() {
  if (!mini || mini.isDestroyed()) createMini();
  if (mini.isVisible()) return mini.hide();
  const b = tray.getBounds();
  const disp = screen.getDisplayNearestPoint({ x: b.x || 0, y: b.y || 0 }).workArea;
  const [w, hgt] = mini.getSize();
  let x = Math.round((b.x || disp.x + disp.width) + (b.width || 0) / 2 - w / 2);
  let y = process.platform === 'darwin' ? Math.round(b.y + b.height + 4) : Math.round((b.y || disp.y + disp.height) - hgt - 8);
  x = Math.max(disp.x + 4, Math.min(x, disp.x + disp.width - w - 4));
  y = Math.max(disp.y + 4, Math.min(y, disp.y + disp.height - hgt - 4));
  mini.setPosition(x, y, false);
  mini.show(); mini.focus();
}

function createTray() {
  let img = nativeImage.createFromPath(path.join(ASSETS, process.platform === 'darwin' ? 'tray.png' : 'tray@2x.png'));
  if (process.platform === 'darwin') img = img.resize({ width: 18, height: 18 });
  else if (process.platform === 'win32') img = img.resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('LimpiaPc-MX');
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir LimpiaPc-MX', click: () => showMain() },
    { label: 'Panel rápido', click: () => toggleMini() },
    { type: 'separator' },
    { label: 'Cuidado inteligente', click: () => showMain('smartcare') },
    { label: 'Liberar memoria RAM', click: () => smartcare.runQuick('free-ram').then(r => store.notify('Memoria', r.ok ? 'Memoria liberada.' : 'No se pudo liberar la memoria.', { level: r.ok ? 'success' : 'warning' })) },
    { label: 'Vaciar papelera', click: () => smartcare.runQuick('empty-trash').then(r => store.notify('Papelera', `Se liberaron ${U.fmtBytes(r.freed || 0)}.`, { level: 'success' })) },
    { label: 'Modo limpieza de pantalla', click: () => startScreenCleaning() },
    { type: 'separator' },
    { label: 'Salir', click: () => { quitting = true; app.quit(); } },
  ]);
  if (process.platform === 'linux') tray.setContextMenu(menu);
  else {
    tray.on('click', () => toggleMini());
    tray.on('right-click', () => tray.popUpContextMenu(menu));
  }
}

// ------------- Modo limpieza de pantalla -------------
function startScreenCleaning() {
  stopScreenCleaning();
  for (const d of screen.getAllDisplays()) {
    const w = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      frame: false, fullscreen: true, kiosk: true, alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#000000',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.loadFile(path.join(RENDERER, 'screenclean.html'));
    screenCleanWins.push(w);
  }
}
function stopScreenCleaning() {
  for (const w of screenCleanWins) if (!w.isDestroyed()) w.destroy();
  screenCleanWins = [];
}

// ------------- IPC -------------
// Llamadas: invoke('call', 'modulo.metodo', token, ...args). El progreso se emite en `progress:${token}`.
const API = {
  'app.info': async () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch, home: U.HOME, electron: process.versions.electron, userData: app.getPath('userData') }),
  'settings.get': async () => store.get(),
  'settings.set': async (k, v) => {
    const r = store.set(k, v);
    if (k === 'realtimeProtection') v ? protection.startRealtime() : protection.stopRealtime();
    if (k === 'launchAtLogin') setLaunchAtLogin(v);
    if (k === 'theme') nativeTheme.themeSource = v === 'auto' ? 'system' : v;
    return r;
  },
  'notifications.list': async () => store.get('notifications'),
  'notifications.markRead': async () => { store.set('notifications', store.get('notifications').map(n => ({ ...n, read: true }))); return true; },
  'notifications.clear': async () => store.set('notifications', []),
  'history.list': async () => ({ history: store.get('history'), totalFreed: store.get('totalFreed') }),

  'health.info': () => health.info(),
  'health.snapshot': () => health.snapshot(),

  'smartcare.scan': (p) => smartcare.scan(p),
  'smartcare.run': (p, plan) => smartcare.run(plan, p),
  'quick.list': async () => smartcare.quickActions(),
  'quick.run': (p, id) => smartcare.runQuick(id),
  'workflow.run': (p, id) => smartcare.runWorkflow(id, p),

  'cleanup.categories': async () => cleanup.categories().map(({ targets, ...c }) => c),
  'cleanup.scan': (p, opts) => cleanup.scan(p, opts),
  'cleanup.clean': (p, sel) => cleanup.clean(sel, p),

  'protection.scan': (p, mode) => protection.scanMalware(mode, p),
  'protection.cancel': async () => protection.cancelScan(),
  'protection.quarantine': (p, paths) => protection.quarantine(paths),
  'protection.quarantineList': () => protection.listQuarantine(),
  'protection.quarantineAction': (p, id, a) => protection.quarantineAction(id, a),
  'protection.privacyScan': () => protection.scanPrivacy(),
  'protection.privacyClean': (p, files) => protection.cleanPrivacy(files),
  'protection.runningBrowsers': () => protection.runningBrowsers(),

  'performance.startup': () => performance.listStartup(),
  'performance.toggleStartup': (p, item, en) => performance.toggleStartup(item, en),
  'performance.removeStartup': (p, item) => performance.removeStartup(item),
  'performance.tasks': async () => (await performance.tasksWithStatus()).map(({ cmd, ps, ...t }) => t),
  'performance.runTask': (p, id) => performance.runTask(id),
  'performance.processes': () => performance.heavyProcesses(),
  'performance.kill': async (p, pid) => performance.killProcess(pid),

  'apps.list': (p) => apps.listApps(p),
  'apps.leftovers': (p, a) => apps.leftovers(a),
  'apps.uninstall': (p, a, o) => apps.uninstall(a, o),
  'apps.orphans': (p, list) => apps.orphanLeftovers(list),
  'apps.updates': () => apps.checkUpdates(),
  'apps.applyUpdates': (p, list) => apps.applyUpdates(list),
  'apps.extensions': () => apps.listExtensions(),
  'apps.removeExtension': (p, e) => apps.removeExtension(e),

  'clutter.largeOld': (p, o) => clutter.largeOld(o, p),
  'clutter.duplicates': (p, o) => clutter.duplicates(o, p),
  'clutter.similar': (p, o) => clutter.similarImages(o, p),
  'clutter.downloads': (p, o) => clutter.downloads(o),
  'clutter.remove': (p, paths, mode) => clutter.removeFiles(paths, mode),
  'clutter.cancel': async () => clutter.cancel(),

  'storage.lens': (p, root, o) => storage.lens(root, o, p),
  'storage.cancelLens': async () => storage.cancelLens(),
  'storage.volumes': () => storage.volumes(),
  'storage.cloudFolders': () => storage.cloudFolders(),
  'storage.cloudScan': (p, f) => storage.cloudScan(f, p),
  'storage.cloudEvict': (p, paths) => storage.cloudEvict(paths),
  'storage.shred': (p, paths, o) => storage.shred(paths, o, p),

  'shell.reveal': async (p, f) => shell.showItemInFolder(f),
  'shell.open': async (p, f) => shell.openPath(f),
  'shell.external': async (p, url) => /^https?:\/\//.test(url) && shell.openExternal(url),
  'dialog.pick': async (p, opts = {}) => {
    const r = await dialog.showOpenDialog(win, { properties: opts.files ? ['openFile', 'openDirectory', 'multiSelections'] : ['openDirectory'], title: opts.title || 'Selecciona' });
    return r.canceled ? null : r.filePaths;
  },
  'screen.clean': async () => startScreenCleaning(),
  'screen.stop': async () => stopScreenCleaning(),
  'window.showMain': async (p, view) => { if (mini) mini.hide(); showMain(view); },
  'window.hideMini': async () => mini && mini.hide(),
  'app.quit': async () => { quitting = true; app.quit(); },
};

const NO_PROGRESS = new Set(['settings.get', 'settings.set', 'app.info', 'health.info', 'health.snapshot', 'notifications.list', 'notifications.markRead', 'notifications.clear', 'history.list', 'cleanup.categories', 'quick.list', 'performance.tasks', 'protection.cancel', 'clutter.cancel', 'storage.cancelLens', 'storage.volumes', 'storage.cloudFolders', 'protection.quarantineList', 'protection.privacyScan', 'protection.runningBrowsers', 'performance.startup', 'performance.processes', 'apps.updates', 'apps.extensions']);

ipcMain.handle('call', async (event, name, token, ...args) => {
  const fn = API[name];
  if (!fn) throw new Error('Función desconocida: ' + name);
  const progress = d => { try { event.sender.send('progress:' + token, d); } catch {} };
  return NO_PROGRESS.has(name) ? fn(...args) : fn(progress, ...args);
});

function setLaunchAtLogin(v) {
  try { app.setLoginItemSettings({ openAtLogin: !!v, openAsHidden: true, args: ['--oculto'] }); } catch {}
  if (process.platform === 'linux') {
    const f = path.join(U.XDG_CONFIG, 'autostart', 'limpiapc-mx.desktop');
    try {
      if (v) {
        U.fs.mkdirSync(path.dirname(f), { recursive: true });
        const exec = process.env.APPIMAGE || process.execPath;
        U.fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=LimpiaPc-MX\nExec="${exec}" --oculto\nIcon=limpiapc-mx\nX-GNOME-Autostart-enabled=true\n`);
      } else U.fs.rmSync(f, { force: true });
    } catch {}
  }
}

// En Linux con AppImage no se instala lanzador: lo registramos para que el
// escritorio muestre el logo (y no un engrane) en el dock y el menú.
function integrateLinuxDesktop() {
  if (process.platform !== 'linux' || !process.env.APPIMAGE) return;
  try {
    const share = U.XDG_DATA;
    for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) {
      const src = path.join(ASSETS, 'icons', `${s}x${s}.png`);
      const dst = path.join(share, 'icons', 'hicolor', `${s}x${s}`, 'apps', 'limpiapc-mx.png');
      if (U.fs.existsSync(src)) { U.fs.mkdirSync(path.dirname(dst), { recursive: true }); U.fs.copyFileSync(src, dst); }
    }
    const desk = path.join(share, 'applications', 'limpiapc-mx.desktop');
    U.fs.mkdirSync(path.dirname(desk), { recursive: true });
    U.fs.writeFileSync(desk, `[Desktop Entry]\nName=LimpiaPc-MX\nComment=Limpia, protege y acelera tu computadora\nExec="${process.env.APPIMAGE}" %U\nIcon=limpiapc-mx\nType=Application\nTerminal=false\nCategories=System;Utility;\nStartupWMClass=limpiapc-mx\n`);
    U.run('update-desktop-database', [path.dirname(desk)]);
    U.run('gtk-update-icon-cache', ['-f', '-t', path.join(share, 'icons', 'hicolor')]);
  } catch (e) { console.error('Integración de escritorio:', e.message); }
}

app.whenReady().then(() => {
  store.load();
  integrateLinuxDesktop();
  const th = store.get('theme');
  nativeTheme.themeSource = th === 'auto' ? 'system' : th;
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
    { label: 'LimpiaPc-MX', submenu: [{ role: 'about', label: 'Acerca de LimpiaPc-MX' }, { type: 'separator' }, { role: 'hide', label: 'Ocultar' }, { role: 'quit', label: 'Salir' }] },
    { label: 'Edición', submenu: [{ role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }] },
    { label: 'Ventana', submenu: [{ role: 'minimize', label: 'Minimizar' }, { role: 'close', label: 'Cerrar' }] },
  ]) : null);
  app.setAboutPanelOptions && app.setAboutPanelOptions({ applicationName: 'LimpiaPc-MX', applicationVersion: app.getVersion(), copyright: '© 2026 Santiago Miguel · GPL-3.0-or-later', authors: ['Santiago Miguel'] });
  createMain();
  try { createTray(); } catch (e) { console.error('Bandeja no disponible:', e.message); }
  health.startMonitor(s => broadcast('health:tick', s));
  if (store.get('realtimeProtection')) protection.startRealtime();
  if (!store.get('lastSmartCare')) store.notify('¡Bienvenido a LimpiaPc-MX!', 'Ejecuta tu primer Cuidado inteligente para dejar tu equipo como nuevo.', { level: 'info', system: false, action: 'smartcare' });
  // Salida de emergencia del modo limpieza de pantalla
  globalShortcut.register('CommandOrControl+Shift+Escape', () => stopScreenCleaning());
});

app.on('activate', () => showMain());
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (!tray) app.quit(); });
