// LimpiaPc-MX — Limpieza: basura del sistema, cachés, registros, papelera, desarrolladores
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const U = require('../core/util');
const store = require('../core/store');
const { path, h, IS_MAC, IS_WIN, IS_LINUX } = U;

const DAY = 86400000;

/**
 * Cada categoría:
 *  id, name, desc, group, safe (incluida en Smart Care), admin
 *  targets: [{ path, mode: 'contents'|'self'|'match', match?: RegExp, olderThanDays? }]
 *  special: 'trash' (papelera del SO), 'command'
 */
function categories() {
  const tmp = U.os.tmpdir();
  const cats = [];
  const add = c => cats.push({ safe: true, admin: false, group: 'Sistema', ...c });

  if (IS_MAC) {
    add({ id: 'user-cache', name: 'Cachés de usuario', desc: 'Archivos temporales que las apps regeneran automáticamente.', targets: [{ path: h('Library/Caches'), mode: 'contents', skipNames: ['Google', 'Firefox', 'com.apple.Safari', 'BraveSoftware', 'Microsoft Edge', 'pip', 'Yarn', 'go-build'] }] });
    add({ id: 'user-logs', name: 'Registros de usuario', desc: 'Bitácoras de actividad de aplicaciones.', targets: [{ path: h('Library/Logs'), mode: 'contents' }] });
    add({ id: 'crash', name: 'Informes de fallos', desc: 'Reportes de diagnóstico de cierres inesperados.', targets: [{ path: h('Library/Logs/DiagnosticReports'), mode: 'contents' }, { path: '/Library/Logs/DiagnosticReports', mode: 'contents' }] });
    add({ id: 'sys-cache', name: 'Cachés del sistema', desc: 'Cachés globales en /Library/Caches.', admin: true, safe: false, targets: [{ path: '/Library/Caches', mode: 'contents' }] });
    add({ id: 'sys-logs', name: 'Registros del sistema', desc: 'Bitácoras en /Library/Logs y /private/var/log (más de 7 días).', admin: true, safe: false, targets: [{ path: '/Library/Logs', mode: 'contents', olderThanDays: 7 }, { path: '/private/var/log', mode: 'match', match: /\.(gz|bz2|\d)$/ }] });
    add({ id: 'saved-state', name: 'Estados de apps guardados', desc: 'Ventanas guardadas de apps (Saved Application State).', targets: [{ path: h('Library/Saved Application State'), mode: 'contents' }] });
    add({ id: 'mail-dl', name: 'Adjuntos de Mail descargados', desc: 'Copias locales de adjuntos ya abiertos en Mail.', group: 'Aplicaciones', safe: false, targets: [{ path: h('Library/Containers/com.apple.mail/Data/Library/Mail Downloads'), mode: 'contents' }] });
    add({ id: 'xcode', name: 'Basura de Xcode', desc: 'DerivedData, archivos de soporte de dispositivos y cachés de simuladores.', group: 'Desarrolladores', targets: [{ path: h('Library/Developer/Xcode/DerivedData'), mode: 'contents' }, { path: h('Library/Developer/Xcode/iOS DeviceSupport'), mode: 'contents', olderThanDays: 90 }, { path: h('Library/Developer/CoreSimulator/Caches'), mode: 'contents' }] });
    add({ id: 'ios-backups', name: 'Respaldos antiguos de iOS', desc: 'Respaldos de iPhone/iPad de más de 180 días.', group: 'Aplicaciones', safe: false, targets: [{ path: h('Library/Application Support/MobileSync/Backup'), mode: 'contents', olderThanDays: 180 }] });
    add({ id: 'trash', name: 'Papelera', desc: 'Archivos que ya enviaste a la Papelera.', group: 'Papelera', special: 'trash', targets: [{ path: h('.Trash'), mode: 'contents' }] });
  }

  if (IS_LINUX) {
    add({ id: 'user-cache', name: 'Caché de usuario', desc: 'Contenido de ~/.cache (miniaturas, navegadores, apps).', targets: [{ path: U.XDG_CACHE, mode: 'contents', skipNames: ['google-chrome', 'chromium', 'mozilla', 'BraveSoftware', 'microsoft-edge', 'pip', 'yarn', 'go-build'] }] });
    add({ id: 'thumbs', name: 'Miniaturas', desc: 'Vistas previas de imágenes y videos.', targets: [{ path: h('.thumbnails'), mode: 'contents' }] });
    add({ id: 'crash', name: 'Informes de fallos', desc: 'Volcados de /var/crash y ~/.local/share/apport.', targets: [{ path: '/var/crash', mode: 'contents' }, { path: path.join(U.XDG_DATA, 'apport'), mode: 'contents' }] });
    add({ id: 'xsession', name: 'Registros de sesión', desc: '~/.xsession-errors y registros antiguos.', targets: [{ path: h('.xsession-errors.old'), mode: 'self' }, { path: path.join(U.XDG_DATA, 'xorg'), mode: 'match', match: /\.old$/ }] });
    add({ id: 'journal', name: 'Diario de systemd', desc: 'Reduce los registros de systemd a 7 días.', admin: true, safe: false, special: 'command', command: 'journalctl --vacuum-time=7d', targets: [{ path: '/var/log/journal', mode: 'contents' }] });
    add({ id: 'pkg-cache', name: 'Caché de paquetes', desc: 'Paquetes descargados por APT/DNF/Pacman/Zypper.', admin: true, safe: false, special: 'command',
      command: 'command -v apt-get >/dev/null && apt-get clean; command -v dnf >/dev/null && dnf clean packages; command -v pacman >/dev/null && pacman -Scc --noconfirm; command -v zypper >/dev/null && zypper clean -a; true',
      targets: [{ path: '/var/cache/apt/archives', mode: 'match', match: /\.deb$/ }, { path: '/var/cache/dnf', mode: 'contents' }, { path: '/var/cache/pacman/pkg', mode: 'contents' }] });
    add({ id: 'old-logs', name: 'Registros rotados', desc: 'Archivos .gz y .1 antiguos en /var/log.', admin: true, safe: false, targets: [{ path: '/var/log', mode: 'match', match: /\.(gz|xz|\d)$/ }] });
    add({ id: 'trash', name: 'Papelera', desc: 'Archivos de ~/.local/share/Trash.', group: 'Papelera', special: 'trash', targets: [{ path: path.join(U.XDG_DATA, 'Trash/files'), mode: 'contents' }, { path: path.join(U.XDG_DATA, 'Trash/info'), mode: 'contents' }] });
  }

  if (IS_WIN) {
    add({ id: 'user-temp', name: 'Archivos temporales', desc: 'Contenido de %TEMP%.', targets: [{ path: tmp, mode: 'contents', olderThanDays: 1 }] });
    add({ id: 'win-temp', name: 'Temporales de Windows', desc: 'C:\\Windows\\Temp.', admin: true, safe: false, targets: [{ path: path.join(U.WINDIR, 'Temp'), mode: 'contents' }] });
    add({ id: 'inet', name: 'Caché de Internet', desc: 'INetCache de Windows.', targets: [{ path: path.join(U.LOCALAPPDATA, 'Microsoft/Windows/INetCache'), mode: 'contents' }] });
    add({ id: 'thumbcache', name: 'Caché de miniaturas', desc: 'Bases thumbcache del Explorador.', targets: [{ path: path.join(U.LOCALAPPDATA, 'Microsoft/Windows/Explorer'), mode: 'match', match: /^(thumbcache|iconcache)_.*\.db$/i }] });
    add({ id: 'crash', name: 'Volcados y reportes de error', desc: 'CrashDumps y Windows Error Reporting.', targets: [{ path: path.join(U.LOCALAPPDATA, 'CrashDumps'), mode: 'contents' }, { path: path.join(U.LOCALAPPDATA, 'Microsoft/Windows/WER'), mode: 'contents' }, { path: path.join(U.PROGRAMDATA, 'Microsoft/Windows/WER'), mode: 'contents' }] });
    add({ id: 'wu', name: 'Caché de Windows Update', desc: 'Descargas de actualizaciones ya instaladas.', admin: true, safe: false, special: 'command',
      command: 'net stop wuauserv & net stop bits & rd /s /q %WINDIR%\\SoftwareDistribution\\Download & mkdir %WINDIR%\\SoftwareDistribution\\Download & net start bits & net start wuauserv',
      targets: [{ path: path.join(U.WINDIR, 'SoftwareDistribution/Download'), mode: 'contents' }] });
    add({ id: 'do', name: 'Optimización de distribución', desc: 'Caché de entrega de actualizaciones.', admin: true, safe: false, targets: [{ path: path.join(U.WINDIR, 'ServiceProfiles/NetworkService/AppData/Local/Microsoft/Windows/DeliveryOptimization/Cache'), mode: 'contents' }] });
    add({ id: 'trash', name: 'Papelera de reciclaje', desc: 'Archivos en la Papelera de reciclaje.', group: 'Papelera', special: 'trash', targets: [] });
  }

  // Navegadores (cachés, no historial — el historial está en Privacidad)
  const browserCaches = [];
  if (IS_MAC) browserCaches.push(
    h('Library/Caches/Google/Chrome/*/Cache'), h('Library/Caches/Google/Chrome/*/Code Cache'),
    h('Library/Caches/Firefox/Profiles/*/cache2'), h('Library/Caches/com.apple.Safari'),
    h('Library/Caches/BraveSoftware/Brave-Browser/*/Cache'), h('Library/Caches/Microsoft Edge/*/Cache'));
  if (IS_LINUX) browserCaches.push(
    path.join(U.XDG_CACHE, 'google-chrome/*/Cache'), path.join(U.XDG_CACHE, 'chromium/*/Cache'),
    path.join(U.XDG_CACHE, 'mozilla/firefox/*/cache2'), path.join(U.XDG_CACHE, 'BraveSoftware/Brave-Browser/*/Cache'),
    path.join(U.XDG_CACHE, 'microsoft-edge/*/Cache'));
  if (IS_WIN) browserCaches.push(
    path.join(U.LOCALAPPDATA, 'Google/Chrome/User Data/*/Cache'), path.join(U.LOCALAPPDATA, 'Google/Chrome/User Data/*/Code Cache'),
    path.join(U.LOCALAPPDATA, 'Microsoft/Edge/User Data/*/Cache'), path.join(U.LOCALAPPDATA, 'Microsoft/Edge/User Data/*/Code Cache'),
    path.join(U.LOCALAPPDATA, 'BraveSoftware/Brave-Browser/User Data/*/Cache'), path.join(U.LOCALAPPDATA, 'Mozilla/Firefox/Profiles/*/cache2'),
    path.join(U.LOCALAPPDATA, 'Opera Software/*/Cache'));
  add({ id: 'browsers', name: 'Cachés de navegadores', desc: 'Chrome, Edge, Firefox, Brave, Safari, Opera.', group: 'Navegadores', glob: true, targets: browserCaches.map(p => ({ path: p, mode: 'contents' })) });

  // Desarrolladores
  const dev = [];
  if (IS_WIN) dev.push(path.join(U.LOCALAPPDATA, 'npm-cache'), path.join(U.LOCALAPPDATA, 'pip/Cache'), path.join(U.LOCALAPPDATA, 'Yarn/Cache'), h('.gradle/caches'), path.join(U.LOCALAPPDATA, 'NuGet/v3-cache'));
  else dev.push(h('.npm/_cacache'), h('.gradle/caches'), h('.cache/pip'), h('Library/Caches/pip'), h('.cache/yarn'), h('Library/Caches/Yarn'), h('.cache/go-build'), h('Library/Caches/go-build'), h('.cargo/registry/cache'));
  add({ id: 'dev', name: 'Cachés de desarrollo', desc: 'npm, pip, Yarn, Gradle, Go, Cargo, NuGet.', group: 'Desarrolladores', safe: false, targets: dev.map(p => ({ path: p, mode: 'contents' })) });

  // Descargas incompletas
  add({ id: 'partial', name: 'Descargas incompletas', desc: 'Archivos .crdownload, .part, .download abandonados.', group: 'Descargas', targets: [{ path: h('Downloads'), mode: 'match', match: /\.(crdownload|part|partial|download|opdownload)$/i }] });

  if (!IS_WIN) add({ id: 'tmp', name: 'Temporales propios', desc: 'Archivos tuyos de más de 3 días en la carpeta temporal.', targets: [{ path: tmp, mode: 'contents', olderThanDays: 3, ownOnly: true }] });

  return cats;
}

async function resolveTargets(cat) {
  const out = [];
  for (const t of cat.targets) {
    const paths = t.path.includes('*') ? await U.expand(t.path) : [t.path];
    for (const p of paths) out.push({ ...t, path: p });
  }
  return out;
}

/** Calcula los elementos a eliminar dentro de un objetivo. */
async function itemsFor(t) {
  const items = [];
  const now = Date.now();
  if (store.isExcluded(t.path)) return items;
  if (t.mode === 'self') {
    if (await U.exists(t.path)) { const { bytes } = await U.sizeOf(t.path); items.push({ path: t.path, bytes }); }
    return items;
  }
  let entries;
  try { entries = await U.fsp.readdir(t.path); } catch { return items; }
  const uid = process.getuid ? process.getuid() : null;
  for (const name of entries) {
    if (t.mode === 'match' && !t.match.test(name)) continue;
    if (t.skipNames && t.skipNames.includes(name)) continue;
    const full = path.join(t.path, name);
    if (store.isExcluded(full)) continue;
    // nunca tocar nuestra propia carpeta
    if (full.toLowerCase().includes('limpiapc')) continue;
    let st; try { st = await U.fsp.lstat(full); } catch { continue; }
    if (t.olderThanDays && now - st.mtimeMs < t.olderThanDays * DAY) continue;
    if (t.ownOnly && uid !== null && st.uid !== uid) continue;
    const { bytes } = st.isDirectory() ? await U.sizeOf(full) : { bytes: U.diskBytes(st) };
    items.push({ path: full, bytes });
  }
  return items;
}

async function windowsRecycleBinSize() {
  const r = await U.ps(`$s=(New-Object -ComObject Shell.Application).Namespace(10); $t=0; $c=0; foreach($i in $s.Items()){ $t+= $i.Size; $c++ }; "$t|$c"`);
  const [b, c] = (r.stdout.trim() || '0|0').split('|').map(Number);
  return { bytes: b || 0, count: c || 0 };
}

async function scan(onProgress = () => {}, { onlySafe = false, ids = null } = {}) {
  const cats = categories().filter(c => (!onlySafe || c.safe) && (!ids || ids.includes(c.id)));
  const results = [];
  let i = 0;
  for (const cat of cats) {
    onProgress({ step: cat.name, pct: Math.round((i++ / cats.length) * 100) });
    let items = [];
    let bytes = 0;
    if (cat.special === 'trash' && U.IS_WIN) {
      const r = await windowsRecycleBinSize();
      bytes = r.bytes; items = r.count ? [{ path: 'Papelera de reciclaje', bytes: r.bytes, virtual: true }] : [];
    } else {
      for (const t of await resolveTargets(cat)) {
        const its = await itemsFor(t);
        items.push(...its);
      }
      bytes = items.reduce((a, b) => a + b.bytes, 0);
    }
    items.sort((a, b) => b.bytes - a.bytes);
    results.push({ id: cat.id, name: cat.name, desc: cat.desc, group: cat.group, admin: cat.admin, safe: cat.safe, bytes, count: items.length, items: items.slice(0, 500) });
  }
  onProgress({ step: 'Listo', pct: 100 });
  return results;
}

/**
 * Limpia las categorías indicadas. selection: { [catId]: true | [paths] }
 */
async function clean(selection, onProgress = () => {}) {
  const cats = categories().filter(c => selection[c.id]);
  let freed = 0, errors = 0;
  const adminCmds = [];
  let i = 0;
  for (const cat of cats) {
    onProgress({ step: 'Limpiando ' + cat.name, pct: Math.round((i++ / cats.length) * 100) });
    const sel = selection[cat.id];
    if (cat.special === 'trash') {
      if (U.IS_WIN) {
        const before = await windowsRecycleBinSize();
        await U.ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue');
        freed += before.bytes; continue;
      }
      if (U.IS_MAC) {
        // Requiere acceso total al disco; si falla, se usa Finder.
        const r = await emptyTargets(cat, sel);
        freed += r.freed;
        if (r.errors) { await U.run('osascript', ['-e', 'tell application "Finder" to empty trash']); }
        continue;
      }
    }
    if (cat.special === 'command' && cat.admin) {
      const items = []; for (const t of await resolveTargets(cat)) items.push(...await itemsFor(t));
      freed += items.reduce((a, b) => a + b.bytes, 0);
      adminCmds.push(cat.command);
      continue;
    }
    if (cat.admin) {
      const items = []; for (const t of await resolveTargets(cat)) items.push(...await itemsFor(t));
      const chosen = Array.isArray(sel) ? items.filter(it => sel.includes(it.path)) : items;
      if (!chosen.length) continue;
      freed += chosen.reduce((a, b) => a + b.bytes, 0);
      if (U.IS_WIN) adminCmds.push(chosen.map(it => `rd /s /q "${it.path}" 2>nul & del /f /q "${it.path}" 2>nul`).join(' & '));
      else adminCmds.push(chosen.map(it => `rm -rf ${JSON.stringify(it.path)}`).join('; '));
      continue;
    }
    const r = await emptyTargets(cat, sel);
    freed += r.freed; errors += r.errors;
  }
  if (adminCmds.length) {
    onProgress({ step: 'Solicitando permisos de administrador…', pct: 95 });
    const res = await U.runAdmin(adminCmds.join(U.IS_WIN ? ' & ' : '; '));
    if (!res.ok) errors++;
  }
  onProgress({ step: 'Listo', pct: 100 });
  store.addHistory({ type: 'limpieza', freed, detail: cats.map(c => c.name).join(', ') });
  return { freed, errors };
}

async function emptyTargets(cat, sel) {
  let freed = 0, errors = 0;
  for (const t of await resolveTargets(cat)) {
    const items = await itemsFor(t);
    for (const it of items) {
      if (Array.isArray(sel) && !sel.includes(it.path)) continue;
      try { await U.fsp.rm(it.path, { recursive: true, force: true, maxRetries: 2 }); freed += it.bytes; }
      catch { errors++; }
    }
  }
  return { freed, errors };
}

module.exports = { categories, scan, clean };
