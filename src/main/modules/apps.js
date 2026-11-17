// LimpiaPc-MX — Aplicaciones: desinstalador completo, restos, actualizador y extensiones
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { shell } = require('electron');
const U = require('../core/util');
const store = require('../core/store');
const { parseDesktop } = require('./performance');
const { path, h, IS_MAC, IS_WIN, IS_LINUX } = U;

const DAY = 86400000;

// ------------------------------- Listado -------------------------------
async function listApps(onProgress = () => {}) {
  if (IS_MAC) return listMac(onProgress);
  if (IS_WIN) return listWin(onProgress);
  return listLinux(onProgress);
}

async function listMac(onProgress) {
  const apps = [];
  const dirs = ['/Applications', h('Applications'), '/Applications/Utilities'];
  const bundles = [];
  for (const d of dirs) {
    let es = []; try { es = await U.fsp.readdir(d); } catch {}
    for (const e of es) if (e.endsWith('.app')) bundles.push(path.join(d, e));
  }
  let i = 0;
  for (const b of bundles) {
    onProgress({ step: path.basename(b), pct: Math.round(i++ / bundles.length * 100) });
    const j = await U.run('plutil', ['-convert', 'json', '-o', '-', path.join(b, 'Contents/Info.plist')]);
    let info = {}; try { info = JSON.parse(j.stdout); } catch {}
    const md = await U.run('mdls', ['-raw', '-name', 'kMDItemLastUsedDate', b]);
    const lastUsed = Date.parse(md.stdout.trim()) || null;
    const { bytes } = await U.sizeOf(b);
    const isSystem = (info.CFBundleIdentifier || '').startsWith('com.apple.') && b.startsWith('/System');
    apps.push({
      id: b, name: info.CFBundleDisplayName || info.CFBundleName || path.basename(b, '.app'),
      version: info.CFBundleShortVersionString || info.CFBundleVersion || '', bundleId: info.CFBundleIdentifier || '',
      path: b, bytes, lastUsed, source: U.fs.existsSync(path.join(b, 'Contents/_MASReceipt')) ? 'App Store' : 'Web', removable: !isSystem,
      icon: null,
    });
  }
  return apps;
}

async function listWin(onProgress) {
  onProgress({ step: 'Leyendo el registro de Windows…', pct: 10 });
  const r = await U.ps(`$k=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');
Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName } |
Select-Object DisplayName,DisplayVersion,Publisher,InstallLocation,InstallDate,EstimatedSize,UninstallString,QuietUninstallString,DisplayIcon,PSChildName | ConvertTo-Json -Compress`, { timeout: 120000 });
  let arr = []; try { arr = JSON.parse(r.stdout || '[]'); if (!Array.isArray(arr)) arr = [arr]; } catch {}
  const seen = new Set();
  const apps = [];
  for (const a of arr) {
    const key = a.DisplayName + '|' + a.DisplayVersion;
    if (seen.has(key)) continue; seen.add(key);
    let lastUsed = null;
    if (a.InstallDate && /^\d{8}$/.test(a.InstallDate)) lastUsed = Date.parse(`${a.InstallDate.slice(0, 4)}-${a.InstallDate.slice(4, 6)}-${a.InstallDate.slice(6, 8)}`);
    apps.push({
      id: a.PSChildName || key, name: a.DisplayName, version: a.DisplayVersion || '', publisher: a.Publisher || '',
      path: a.InstallLocation || '', bytes: (a.EstimatedSize || 0) * 1024, installed: lastUsed, lastUsed: null,
      uninstall: a.QuietUninstallString || a.UninstallString || '', interactiveUninstall: a.UninstallString || '',
      icon: (a.DisplayIcon || '').split(',')[0].replace(/"/g, ''), source: 'Instalador', removable: !!(a.UninstallString || a.QuietUninstallString),
    });
  }
  // Apps de Microsoft Store (sin las del sistema)
  onProgress({ step: 'Leyendo apps de Microsoft Store…', pct: 60 });
  const s = await U.ps('Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.SignatureKind -eq "Store" } | Select-Object Name,PackageFullName,Version,InstallLocation,Publisher | ConvertTo-Json -Compress', { timeout: 120000 });
  try {
    let st = JSON.parse(s.stdout || '[]'); if (!Array.isArray(st)) st = [st];
    for (const a of st) apps.push({ id: 'appx:' + a.PackageFullName, name: a.Name.replace(/^[^.]+\./, '').replace(/([a-z])([A-Z])/g, '$1 $2'), version: a.Version, publisher: '', path: a.InstallLocation, bytes: 0, source: 'Microsoft Store', removable: true, appx: a.PackageFullName });
  } catch {}
  return apps;
}

async function listLinux(onProgress) {
  const dirs = ['/usr/share/applications', '/usr/local/share/applications', path.join(U.XDG_DATA, 'applications'), '/var/lib/flatpak/exports/share/applications', path.join(U.XDG_DATA, 'flatpak/exports/share/applications'), '/var/lib/snapd/desktop/applications'];
  const files = [];
  for (const d of dirs) { let es = []; try { es = await U.fsp.readdir(d); } catch {} for (const e of es) if (e.endsWith('.desktop')) files.push(path.join(d, e)); }
  const hasDpkg = !!(await U.which('dpkg-query'));
  const hasRpm = !hasDpkg && !!(await U.which('rpm'));
  const hasPacman = !hasDpkg && !hasRpm && !!(await U.which('pacman'));
  const apps = [];
  const seen = new Set();
  let i = 0;
  for (const f of files) {
    if (i++ % 10 === 0) onProgress({ step: path.basename(f), pct: Math.round(i / files.length * 100) });
    let d; try { d = parseDesktop(await U.fsp.readFile(f, 'utf8')); } catch { continue; }
    if (d.NoDisplay === 'true' || d.Hidden === 'true' || d.Type !== 'Application') continue;
    const name = d['Name[es]'] || d.Name;
    if (!name || seen.has(name)) continue; seen.add(name);
    const app = { id: f, name, version: '', path: f, exec: d.Exec || '', icon: d.Icon || '', bytes: 0, removable: true, desktopFile: f, comment: d['Comment[es]'] || d.Comment || '' };
    if (f.includes('flatpak')) { app.source = 'Flatpak'; app.pkg = path.basename(f, '.desktop'); app.scope = f.startsWith(U.HOME) ? 'user' : 'system'; }
    else if (f.includes('snapd')) { app.source = 'Snap'; app.pkg = path.basename(f, '.desktop').split('_')[0]; }
    else if (f.startsWith(U.HOME)) { app.source = 'Local'; }
    else {
      app.source = 'Paquete';
      if (hasDpkg) { const r = await U.run('dpkg-query', ['-S', f]); app.pkg = r.ok ? r.stdout.split(':')[0].trim() : ''; }
      else if (hasRpm) { const r = await U.run('rpm', ['-qf', '--qf', '%{NAME}', f]); app.pkg = r.ok ? r.stdout.trim() : ''; }
      else if (hasPacman) { const r = await U.run('pacman', ['-Qoq', f]); app.pkg = r.ok ? r.stdout.trim() : ''; }
      if (!app.pkg) app.removable = false;
    }
    apps.push(app);
  }
  // tamaños y versiones de paquetes en bloque
  if (hasDpkg) {
    const r = await U.run('dpkg-query', ['-W', '-f', '${Package}\t${Version}\t${Installed-Size}\n']);
    const m = new Map(r.stdout.split('\n').map(l => l.split('\t')).map(([p, v, s]) => [p, { v, s: (+s || 0) * 1024 }]));
    for (const a of apps) if (a.pkg && m.has(a.pkg)) { a.version = m.get(a.pkg).v; a.bytes = m.get(a.pkg).s; }
  }
  if (await U.which('flatpak')) {
    const r = await U.run('flatpak', ['list', '--app', '--columns=application,version,size']);
    const m = new Map(r.stdout.split('\n').map(l => l.split('\t')).map(([p, v, s]) => [p, { v, s }]));
    for (const a of apps) if (a.source === 'Flatpak' && m.has(a.pkg)) { a.version = m.get(a.pkg).v || ''; a.bytes = parseHumanSize(m.get(a.pkg).s); }
  }
  if (await U.which('snap')) {
    const r = await U.run('snap', ['list']);
    const m = new Map(r.stdout.split('\n').slice(1).map(l => l.split(/\s+/)).map(p => [p[0], p[1]]));
    for (const a of apps) if (a.source === 'Snap' && m.has(a.pkg)) a.version = m.get(a.pkg);
  }
  // última vez usada (aprox. por acceso al ejecutable)
  for (const a of apps) {
    const bin = (a.exec || '').split(' ')[0].replace(/"/g, '');
    const full = bin.startsWith('/') ? bin : bin ? (await U.which(bin)) : null;
    if (full) { try { a.lastUsed = (await U.fsp.stat(full)).atimeMs; } catch {} }
  }
  return apps;
}

function parseHumanSize(s = '') {
  const m = String(s).replace(',', '.').match(/([\d.]+)\s*([kKMGT]?)B?/);
  if (!m) return 0;
  const mult = { '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[m[2]] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

// ------------------------------- Restos -------------------------------
async function leftovers(appInfo) {
  const found = [];
  const names = new Set();
  const n = (appInfo.name || '').trim();
  if (n) { names.add(n); names.add(n.replace(/\s+/g, '')); names.add(n.toLowerCase()); names.add(n.toLowerCase().replace(/\s+/g, '-')); }
  if (appInfo.bundleId) names.add(appInfo.bundleId);
  if (appInfo.pkg) { names.add(appInfo.pkg); names.add(appInfo.pkg.split('.').pop()); }
  if (appInfo.publisher) names.add(appInfo.publisher);
  const tooGeneric = new Set(['microsoft', 'google', 'apple', 'app', 'apps', 'update', 'common', 'system', 'mozilla', 'corporation', 'inc', 'inc.', 'ltd']);
  const valid = [...names].filter(x => x && x.length > 2 && !tooGeneric.has(x.toLowerCase()));
  let bases = [];
  if (IS_MAC) bases = ['Application Support', 'Caches', 'Preferences', 'Containers', 'Group Containers', 'Logs', 'Saved Application State', 'HTTPStorages', 'WebKit', 'LaunchAgents', 'Cookies', 'Application Scripts'].map(b => h('Library', b));
  if (IS_WIN) bases = [U.APPDATA, U.LOCALAPPDATA, U.PROGRAMDATA, path.join(U.LOCALAPPDATA, 'Programs')];
  if (IS_LINUX) bases = [U.XDG_CONFIG, U.XDG_CACHE, U.XDG_DATA, h('.var/app')];
  for (const base of bases) {
    let es = []; try { es = await U.fsp.readdir(base); } catch { continue; }
    for (const e of es) {
      const el = e.toLowerCase().replace(/\.(plist|savedstate|binarycookies)$/, '');
      const hit = valid.some(v => {
        const vl = v.toLowerCase();
        return el === vl || el === vl.replace(/\s+/g, '') || (appInfo.bundleId && el.startsWith(appInfo.bundleId.toLowerCase())) || (vl.length > 5 && el.includes(vl));
      });
      if (!hit) continue;
      const full = path.join(base, e);
      if (appInfo.path && (full === appInfo.path || appInfo.path.startsWith(full + path.sep))) continue;
      const { bytes } = await U.sizeOf(full);
      found.push({ path: full, bytes });
    }
  }
  return found;
}

// ------------------------------- Desinstalar -------------------------------
async function trashOrDelete(p) {
  if (store.get('deleteMode') === 'trash') { await shell.trashItem(p); return; }
  await U.fsp.rm(p, { recursive: true, force: true });
}

async function uninstall(appInfo, { withLeftovers = true, resetOnly = false } = {}) {
  const left = withLeftovers ? await leftovers(appInfo) : [];
  let freed = 0; const errors = [];
  if (!resetOnly) {
    try {
      if (IS_MAC) {
        try { await shell.trashItem(appInfo.path); }
        catch { const r = await U.runAdmin(`rm -rf "${appInfo.path}"`); if (!r.ok) throw new Error(r.error); }
        freed += appInfo.bytes || 0;
      } else if (IS_WIN) {
        if (appInfo.appx) {
          const r = await U.ps(`Remove-AppxPackage -Package '${appInfo.appx}'`);
          if (!r.ok) throw new Error(r.stderr || r.error);
        } else {
          let cmd = appInfo.uninstall || appInfo.interactiveUninstall;
          if (!cmd) throw new Error('Sin desinstalador registrado');
          if (/msiexec/i.test(cmd)) cmd = cmd.replace(/\/I\{/i, '/X{');
          const r = await U.run('cmd.exe', ['/d', '/s', '/c', '"' + cmd + '"'], { timeout: 1800000, windowsVerbatimArguments: true });
          if (!r.ok && r.code !== 3010) throw new Error(r.stderr || r.error || 'El desinstalador terminó con error');
        }
        freed += appInfo.bytes || 0;
      } else {
        let r;
        if (appInfo.source === 'Flatpak') r = await U.run('flatpak', ['uninstall', '-y', ...(appInfo.scope === 'user' ? ['--user'] : []), appInfo.pkg], { timeout: 600000 });
        else if (appInfo.source === 'Snap') r = await U.runAdmin(`snap remove ${appInfo.pkg}`);
        else if (appInfo.source === 'Local') { await trashOrDelete(appInfo.desktopFile); r = { ok: true }; }
        else {
          const pm = (await U.which('apt-get')) ? `apt-get remove -y ${appInfo.pkg}` : (await U.which('dnf')) ? `dnf remove -y ${appInfo.pkg}` : (await U.which('pacman')) ? `pacman -R --noconfirm ${appInfo.pkg}` : (await U.which('zypper')) ? `zypper -n rm ${appInfo.pkg}` : null;
          if (!pm) throw new Error('Gestor de paquetes no soportado');
          r = await U.runAdmin(pm);
        }
        if (!r.ok) throw new Error(r.stderr || r.error || 'Error al desinstalar');
        freed += appInfo.bytes || 0;
      }
    } catch (e) { errors.push(e.message); }
  }
  for (const l of left) {
    try { await trashOrDelete(l.path); freed += l.bytes; } catch (e) { errors.push(l.path + ': ' + e.message); }
  }
  store.addHistory({ type: resetOnly ? 'restablecer app' : 'desinstalación', freed, detail: appInfo.name });
  return { freed, errors, leftovers: left.length };
}

// ------------------------------- Restos huérfanos -------------------------------
async function orphanLeftovers(apps) {
  const known = new Set();
  for (const a of apps) {
    for (const v of [a.name, a.bundleId, a.pkg, a.publisher]) if (v) { known.add(v.toLowerCase()); known.add(v.toLowerCase().replace(/\s+/g, '')); }
  }
  const out = [];
  if (IS_MAC) {
    const base = h('Library/Application Support');
    let es = []; try { es = await U.fsp.readdir(base); } catch {}
    for (const e of es) {
      const el = e.toLowerCase();
      if (el.startsWith('com.apple') || ['apple', 'addressbook', 'callhistorydb', 'cloudDocs', 'crashreporter', 'icdd', 'knowledge', 'mobilesync', 'networkserviceproxy', 'syncservices', 'limpiapc-mx', 'dock', 'icloud', 'fileprovider', 'accounts', 'animoji', 'avatarcache', 'familycircle', 'homeenergyd', 'videosubscriptionsd', 'com.microsoft'].includes(el)) continue;
      if ([...known].some(k => k.length > 3 && (el.includes(k) || k.includes(el)))) continue;
      const full = path.join(base, e);
      const { bytes } = await U.sizeOf(full);
      if (bytes > 1024 * 1024) out.push({ path: full, bytes, name: e });
    }
  }
  if (IS_WIN) {
    for (const base of [U.APPDATA, U.LOCALAPPDATA]) {
      let es = []; try { es = await U.fsp.readdir(base); } catch {}
      for (const e of es) {
        const el = e.toLowerCase();
        if (['microsoft', 'packages', 'temp', 'programs', 'comms', 'connecteddevicesplatform', 'd3dscache', 'publishers', 'virtualstore', 'crashdumps', 'limpiapc-mx', 'npm', 'npm-cache', 'pip', 'nuget', 'adobe', 'google', 'mozilla', 'intel', 'nvidia', 'amd', 'ati'].includes(el)) continue;
        if ([...known].some(k => k.length > 3 && (el.includes(k) || k.includes(el)))) continue;
        const full = path.join(base, e);
        const { bytes } = await U.sizeOf(full, { maxDepth: 6 });
        if (bytes > 5 * 1024 * 1024) out.push({ path: full, bytes, name: e });
      }
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

// ------------------------------- Actualizador -------------------------------
async function checkUpdates() {
  const ups = [];
  const managers = [];
  if (IS_WIN && await U.which('winget')) {
    managers.push('winget');
    const r = await U.run('winget', ['upgrade', '--include-unknown', '--accept-source-agreements', '--disable-interactivity'], { timeout: 180000 });
    const lines = r.stdout.split(/\r?\n/);
    const hi = lines.findIndex(l => /\bId\b/.test(l) && /\bVers/.test(l));
    if (hi >= 0) {
      const header = lines[hi];
      const cols = [header.search(/\bId\b/), header.search(/\bVers(ion|ión)\b/), header.search(/\bDisponible\b|\bAvailable\b/), header.search(/\bOrigen\b|\bSource\b/)];
      for (const l of lines.slice(hi + 2)) {
        if (!l.trim() || /^\d+ /.test(l) || l.length < cols[2]) continue;
        const name = l.slice(0, cols[0]).trim(), id = l.slice(cols[0], cols[1]).trim(), cur = l.slice(cols[1], cols[2]).trim(), av = l.slice(cols[2], cols[3] > 0 ? cols[3] : undefined).trim();
        if (id && av) ups.push({ manager: 'winget', id, name, current: cur, available: av });
      }
    }
  }
  if (IS_MAC && await U.which('brew')) {
    managers.push('Homebrew');
    const r = await U.run('brew', ['outdated', '--json=v2', '--greedy'], { timeout: 180000 });
    try {
      const j = JSON.parse(r.stdout);
      for (const f of j.formulae || []) ups.push({ manager: 'brew', id: f.name, name: f.name, current: (f.installed_versions || [])[0], available: f.current_version });
      for (const c of j.casks || []) ups.push({ manager: 'brew-cask', id: c.name, name: c.name, current: (c.installed_versions || [])[0], available: c.current_version });
    } catch {}
  }
  if (IS_MAC && await U.which('mas')) {
    managers.push('Mac App Store (mas)');
    const r = await U.run('mas', ['outdated']);
    for (const l of r.stdout.split('\n')) { const m = l.match(/^(\d+)\s+(.+?)\s+\((.+?) -> (.+?)\)/); if (m) ups.push({ manager: 'mas', id: m[1], name: m[2], current: m[3], available: m[4] }); }
  }
  if (IS_MAC) {
    const r = await U.run('softwareupdate', ['-l'], { timeout: 180000 });
    for (const l of r.stdout.split('\n')) { const m = l.match(/^\s*\* Label: (.+)$/); if (m) ups.push({ manager: 'macOS', id: m[1], name: m[1], current: '', available: '' }); }
  }
  if (IS_LINUX) {
    if (await U.which('apt')) {
      managers.push('APT');
      const r = await U.run('apt', ['list', '--upgradable'], { env: { ...process.env, LANG: 'C' } });
      for (const l of r.stdout.split('\n')) { const m = l.match(/^([^/]+)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from: (\S+)\]/); if (m) ups.push({ manager: 'apt', id: m[1], name: m[1], current: m[3], available: m[2] }); }
    } else if (await U.which('dnf')) {
      managers.push('DNF');
      const r = await U.run('dnf', ['-q', 'check-update'], { timeout: 180000 });
      for (const l of r.stdout.split('\n')) { const m = l.match(/^(\S+)\.(\S+)\s+(\S+)\s+\S+$/); if (m) ups.push({ manager: 'dnf', id: m[1], name: m[1], current: '', available: m[3] }); }
    } else if (await U.which('checkupdates')) {
      managers.push('Pacman');
      const r = await U.run('checkupdates');
      for (const l of r.stdout.split('\n')) { const m = l.match(/^(\S+) (\S+) -> (\S+)/); if (m) ups.push({ manager: 'pacman', id: m[1], name: m[1], current: m[2], available: m[3] }); }
    }
    if (await U.which('flatpak')) {
      managers.push('Flatpak');
      const r = await U.run('flatpak', ['remote-ls', '--updates', '--columns=application,version'], { timeout: 180000 });
      for (const l of r.stdout.split('\n')) { const [id, v] = l.split('\t'); if (id && id.includes('.')) ups.push({ manager: 'flatpak', id, name: id.split('.').pop(), current: '', available: v || '' }); }
    }
    if (await U.which('snap')) {
      managers.push('Snap');
      const r = await U.run('snap', ['refresh', '--list']);
      for (const l of r.stdout.split('\n').slice(1)) { const p = l.split(/\s+/); if (p[0]) ups.push({ manager: 'snap', id: p[0], name: p[0], current: '', available: p[1] }); }
    }
  }
  return { managers, updates: ups };
}

async function applyUpdates(list) {
  const results = [];
  const linuxAdmin = [];
  for (const u of list) {
    let r;
    switch (u.manager) {
      case 'winget': r = await U.run('winget', ['upgrade', '--id', u.id, '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], { timeout: 1800000 }); break;
      case 'brew': r = await U.run('brew', ['upgrade', u.id], { timeout: 1800000 }); break;
      case 'brew-cask': r = await U.run('brew', ['upgrade', '--cask', u.id], { timeout: 1800000 }); break;
      case 'mas': r = await U.run('mas', ['upgrade', u.id], { timeout: 1800000 }); break;
      case 'macOS': r = await U.runAdmin(`softwareupdate -i "${u.id}"`); break;
      case 'flatpak': r = await U.run('flatpak', ['update', '-y', u.id], { timeout: 1800000 }); break;
      case 'apt': linuxAdmin.push(`apt-get install -y --only-upgrade ${u.id}`); continue;
      case 'dnf': linuxAdmin.push(`dnf upgrade -y ${u.id}`); continue;
      case 'pacman': linuxAdmin.push(`pacman -S --noconfirm ${u.id}`); continue;
      case 'snap': linuxAdmin.push(`snap refresh ${u.id}`); continue;
      default: r = { ok: false };
    }
    results.push({ id: u.id, ok: r.ok });
  }
  if (linuxAdmin.length) {
    const r = await U.runAdmin(linuxAdmin.join(' && '));
    results.push({ id: 'sistema', ok: r.ok, error: r.error });
  }
  store.addHistory({ type: 'actualizaciones', detail: `${results.filter(r => r.ok).length} actualizadas` });
  return results;
}

// ------------------------------- Extensiones -------------------------------
async function listExtensions() {
  const out = [];
  const chromium = [];
  if (IS_MAC) chromium.push(['Google Chrome', h('Library/Application Support/Google/Chrome')], ['Microsoft Edge', h('Library/Application Support/Microsoft Edge')], ['Brave', h('Library/Application Support/BraveSoftware/Brave-Browser')]);
  if (IS_WIN) chromium.push(['Google Chrome', path.join(U.LOCALAPPDATA, 'Google/Chrome/User Data')], ['Microsoft Edge', path.join(U.LOCALAPPDATA, 'Microsoft/Edge/User Data')], ['Brave', path.join(U.LOCALAPPDATA, 'BraveSoftware/Brave-Browser/User Data')]);
  if (IS_LINUX) chromium.push(['Google Chrome', path.join(U.XDG_CONFIG, 'google-chrome')], ['Chromium', path.join(U.XDG_CONFIG, 'chromium')], ['Microsoft Edge', path.join(U.XDG_CONFIG, 'microsoft-edge')], ['Brave', path.join(U.XDG_CONFIG, 'BraveSoftware/Brave-Browser')]);
  for (const [browser, base] of chromium) {
    for (const extDir of await U.expand(path.join(base, '*', 'Extensions', '*'))) {
      const versions = await U.expand(path.join(extDir, '*', 'manifest.json'));
      if (!versions.length) continue;
      try {
        const m = JSON.parse(await U.fsp.readFile(versions[versions.length - 1], 'utf8'));
        let name = m.name || path.basename(extDir);
        if (name.startsWith('__MSG_')) {
          const loc = await U.expand(path.join(path.dirname(versions[versions.length - 1]), '_locales', '*', 'messages.json'));
          const pref = loc.find(l => /[\\/]es[\\/]/.test(l)) || loc.find(l => /[\\/]en[\\/]/.test(l)) || loc[0];
          if (pref) { try { const msgs = JSON.parse(await U.fsp.readFile(pref, 'utf8')); const k = name.slice(6, -2); const hit = Object.entries(msgs).find(([kk]) => kk.toLowerCase() === k.toLowerCase()); if (hit) name = hit[1].message; } catch {} }
        }
        const profile = path.basename(path.dirname(path.dirname(extDir)));
        out.push({ browser, profile, id: path.basename(extDir), name, version: m.version, path: extDir, permissions: (m.permissions || []).filter(p => typeof p === 'string').slice(0, 8) });
      } catch {}
    }
  }
  const ff = IS_MAC ? h('Library/Application Support/Firefox/Profiles') : IS_WIN ? path.join(U.APPDATA, 'Mozilla/Firefox/Profiles') : h('.mozilla/firefox');
  for (const f of await U.expand(path.join(ff, '*', 'extensions.json'))) {
    try {
      const j = JSON.parse(await U.fsp.readFile(f, 'utf8'));
      for (const a of j.addons || []) if (a.location === 'app-profile') out.push({ browser: 'Firefox', profile: path.basename(path.dirname(f)), id: a.id, name: (a.defaultLocale || {}).name || a.id, version: a.version, path: a.path, permissions: ((a.userPermissions || {}).permissions || []).slice(0, 8), readonly: true });
    } catch {}
  }
  return out;
}

async function removeExtension(ext) {
  if (ext.readonly) return { ok: false, error: 'Elimina las extensiones de Firefox desde el propio navegador (about:addons).' };
  try { await trashOrDelete(ext.path); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { listApps, leftovers, uninstall, orphanLeftovers, checkUpdates, applyUpdates, listExtensions, removeExtension };
