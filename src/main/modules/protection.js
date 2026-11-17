// LimpiaPc-MX — Protección: análisis de malware, cuarentena, privacidad y monitoreo en tiempo real
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const crypto = require('crypto');
const { app } = require('electron');
const U = require('../core/util');
const store = require('../core/store');
const { path, h, IS_MAC, IS_WIN, IS_LINUX } = U;

// ---------- Firmas heurísticas incorporadas ----------
// Hashes SHA-256 conocidos (incluye el archivo de prueba EICAR para verificar el motor).
const KNOWN_HASHES = new Map([
  ['275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f', 'EICAR-Test-File (archivo de prueba)'],
  ['131f95c51cc819465fa1797f6ccacf9d494aaaff46fa3eac73ae63ffbdfd8267', 'EICAR-Test-File (variante)'],
]);
// Se arma en tiempo de ejecución para que el propio código fuente no dispare antivirus.
const EICAR = Buffer.from('KkgrSCQhRUxJRi1UU0VULVNVUklWSVROQS1EUkFETkFUUy1SQUNJRSR9NylDQzcpXlAoNDVYWlBcNFtQQUAlUCFPNVg=', 'base64').toString('latin1').split('').reverse().join('');

// Nombres de adware/PUP conocidos en agentes de inicio (macOS) y otros sistemas
const BAD_NAME_PATTERNS = [
  /com\.pcv\./i, /mughthesec/i, /searchbaron/i, /search\s?marquis/i, /com\.adsearch/i, /com\.genieo/i,
  /installmac/i, /vsearch/i, /com\.crossrider/i, /conduit/i, /com\.mackeeper/i, /zipcloud/i, /spigot/i,
  /shlayer/i, /bundlore/i, /pirrit/i, /adload/i, /com\.updater\.mcy/i, /\.?mdworker_?share/i,
  /xmrig/i, /coinhive/i, /cpuminer/i, /minerd/i, /kdevtmpfsi/i, /kinsing/i,
];
const DOUBLE_EXT = /\.(pdf|docx?|xlsx?|jpe?g|png|txt|mp3|mp4)\.(exe|scr|bat|cmd|com|pif|vbs|js|jse|wsf|hta|app|command|sh)$/i;
const SCRIPT_EXT = /\.(vbs|vbe|js|jse|wsf|wsh|hta|ps1|scr|pif)$/i;
const SUSPICIOUS_CONTENT = [
  { re: /curl\s+[^|]*\|\s*(ba)?sh/i, name: 'Descarga y ejecución remota (curl | sh)' },
  { re: /wget\s+[^|]*\|\s*(ba)?sh/i, name: 'Descarga y ejecución remota (wget | sh)' },
  { re: /stratum\+tcp:\/\//i, name: 'Minero de criptomonedas (stratum)' },
  { re: /powershell[^\n]{0,60}-enc(odedcommand)?\s+[A-Za-z0-9+/=]{80,}/i, name: 'PowerShell ofuscado' },
  { re: /FromBase64String\([^)]{200,}\)/i, name: 'Carga útil Base64 ofuscada' },
  { re: /eval\(base64_decode\(/i, name: 'Web shell PHP' },
];

function quarantineDir() { return path.join(app.getPath('userData'), 'Cuarentena'); }

function scanRoots(mode) {
  const roots = [];
  const quick = [];
  if (IS_MAC) quick.push(h('Library/LaunchAgents'), '/Library/LaunchAgents', '/Library/LaunchDaemons', h('Downloads'), h('Library/Application Support'), '/Users/Shared', U.os.tmpdir());
  if (IS_LINUX) quick.push(path.join(U.XDG_CONFIG, 'autostart'), '/etc/xdg/autostart', path.join(U.XDG_CONFIG, 'systemd/user'), h('Downloads'), h('Descargas'), '/tmp', '/var/tmp', '/dev/shm');
  if (IS_WIN) quick.push(path.join(U.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup'), path.join(U.PROGRAMDATA, 'Microsoft/Windows/Start Menu/Programs/StartUp'), h('Downloads'), U.os.tmpdir(), U.APPDATA, path.join(U.LOCALAPPDATA, 'Temp'));
  roots.push(...quick);
  if (mode === 'balanced') roots.push(h('Desktop'), h('Escritorio'), h('Documents'), h('Documentos'), IS_MAC ? '/Applications' : IS_WIN ? U.LOCALAPPDATA : '/opt');
  if (mode === 'deep') roots.splice(0, roots.length, U.HOME, ...(IS_MAC ? ['/Applications', '/Library/LaunchAgents', '/Library/LaunchDaemons', '/Users/Shared'] : IS_LINUX ? ['/tmp', '/var/tmp', '/opt', '/etc/xdg/autostart'] : [U.PROGRAMDATA]));
  return [...new Set(roots)];
}

async function sha256(file, max = 64 * 1024 * 1024) {
  const st = await U.fsp.stat(file);
  if (st.size > max) return null;
  return new Promise((res) => {
    const hs = crypto.createHash('sha256');
    U.fs.createReadStream(file).on('data', d => hs.update(d)).on('end', () => res(hs.digest('hex'))).on('error', () => res(null));
  });
}

async function inspectFile(file, st) {
  const name = path.basename(file);
  const findings = [];
  if (BAD_NAME_PATTERNS.some(re => re.test(name))) findings.push('Nombre asociado a adware/malware conocido');
  if (DOUBLE_EXT.test(name)) findings.push('Doble extensión engañosa');
  const inStartup = /LaunchAgents|LaunchDaemons|autostart|Startup|systemd/i.test(file);
  if (inStartup && SCRIPT_EXT.test(name)) findings.push('Script en ubicación de arranque');
  if (/^autorun\.inf$/i.test(name)) findings.push('autorun.inf (propagación por USB)');

  // Agentes de inicio que ejecutan binarios ocultos o en /tmp
  if (inStartup && /\.(plist|desktop|service)$/i.test(name) && st.size < 256 * 1024) {
    try {
      const txt = await U.fsp.readFile(file, 'utf8');
      if (/\/(tmp|var\/tmp|dev\/shm)\/|\/\.[A-Za-z0-9_-]+\/[^/<"\s]+(<|"|\s|$)/.test(txt)) findings.push('Inicia un programa oculto o temporal');
      if (BAD_NAME_PATTERNS.some(re => re.test(txt))) findings.push('Referencia a adware conocido');
    } catch {}
  }

  // Contenido sospechoso en scripts pequeños
  if (st.size < 2 * 1024 * 1024 && /\.(sh|command|ps1|bat|cmd|vbs|js|php|py|plist|desktop|service|txt|com)$/i.test(name) || st.size < 512) {
    try {
      const txt = await U.fsp.readFile(file, 'latin1');
      if (txt.includes(EICAR)) findings.push('Firma EICAR (archivo de prueba antivirus)');
      for (const s of SUSPICIOUS_CONTENT) if (s.re.test(txt)) findings.push(s.name);
    } catch {}
  }

  // Hash de ejecutables pequeños
  if (st.size < 20 * 1024 * 1024 && (/\.(exe|dll|scr|bin|app|dmg|pkg|elf|so|dylib|com)$/i.test(name) || st.size < 4096)) {
    const hash = await sha256(file);
    if (hash && KNOWN_HASHES.has(hash)) findings.push('Firma conocida: ' + KNOWN_HASHES.get(hash));
  }
  return findings;
}

let currentScan = null;

async function scanMalware(mode = 'quick', onProgress = () => {}) {
  if (currentScan) currentScan.abort();
  const ctrl = new AbortController();
  currentScan = ctrl;
  const threats = [];
  let scanned = 0;
  const engine = (await U.which('clamscan')) ? 'ClamAV + heurística' : 'Heurística LimpiaPc';
  const roots = scanRoots(mode).filter(r => U.fs.existsSync(r));
  const maxDepth = mode === 'quick' ? 3 : mode === 'balanced' ? 6 : 32;
  for (const root of roots) {
    if (ctrl.signal.aborted) break;
    await U.walk(root, {
      maxDepth, signal: ctrl.signal,
      skip: (full) => store.isExcluded(full) || /node_modules|\.git[\\/]|Cuarentena|Library[\\/](Caches|Containers|Group Containers|Mail)|AppData[\\/]Local[\\/]Packages/.test(full),
      onFile: async (file, st) => {
        scanned++;
        if (scanned % 200 === 0) onProgress({ step: file, scanned, threats: threats.length });
        const f = await inspectFile(file, st);
        if (f.length) threats.push({ path: file, bytes: st.size, reasons: f });
      },
    });
  }
  // ClamAV (si está instalado) sobre las raíces principales
  const clam = await U.which('clamscan');
  if (clam && !ctrl.signal.aborted) {
    onProgress({ step: 'Analizando con ClamAV…', scanned, threats: threats.length });
    await U.spawnStream(clam, ['-r', '-i', '--no-summary', ...(mode === 'quick' ? ['--max-dir-recursion=3'] : []), ...roots], line => {
      const m = line.match(/^(.*): (.+) FOUND$/);
      if (m && !threats.find(t => t.path === m[1])) threats.push({ path: m[1], bytes: 0, reasons: ['ClamAV: ' + m[2]] });
    }, { signal: ctrl.signal });
  }
  currentScan = null;
  store.addHistory({ type: 'protección', detail: `Análisis ${mode}: ${scanned} archivos, ${threats.length} amenazas` });
  if (threats.length) store.notify('Amenazas encontradas', `Se detectaron ${threats.length} elementos sospechosos.`, { level: 'warning', action: 'protection' });
  return { engine, scanned, threats, aborted: ctrl.signal.aborted };
}

function cancelScan() { if (currentScan) currentScan.abort(); }

async function quarantine(paths) {
  const dir = quarantineDir();
  await U.fsp.mkdir(dir, { recursive: true });
  const indexFile = path.join(dir, 'indice.json');
  let index = [];
  try { index = JSON.parse(await U.fsp.readFile(indexFile, 'utf8')); } catch {}
  let ok = 0, failed = [];
  for (const p of paths) {
    const id = crypto.randomBytes(6).toString('hex');
    const dest = path.join(dir, id + '.cuarentena');
    try {
      try { await U.fsp.rename(p, dest); }
      catch { await U.fsp.cp(p, dest, { recursive: true }); await U.fsp.rm(p, { recursive: true, force: true }); }
      try { await U.fsp.chmod(dest, 0o400); } catch {}
      index.push({ id, original: p, at: Date.now() });
      ok++;
    } catch (e) { failed.push({ path: p, error: e.message }); }
  }
  await U.fsp.writeFile(indexFile, JSON.stringify(index, null, 2));
  return { ok, failed };
}

async function listQuarantine() {
  try { return JSON.parse(await U.fsp.readFile(path.join(quarantineDir(), 'indice.json'), 'utf8')); } catch { return []; }
}

async function quarantineAction(id, action) {
  const dir = quarantineDir();
  const indexFile = path.join(dir, 'indice.json');
  let index = await listQuarantine();
  const it = index.find(x => x.id === id);
  if (!it) return false;
  const file = path.join(dir, id + '.cuarentena');
  if (action === 'restore') {
    await U.fsp.mkdir(path.dirname(it.original), { recursive: true });
    try { await U.fsp.chmod(file, 0o644); } catch {}
    await U.fsp.rename(file, it.original).catch(async () => { await U.fsp.cp(file, it.original, { recursive: true }); await U.fsp.rm(file, { recursive: true, force: true }); });
  } else {
    try { await U.fsp.chmod(file, 0o644); } catch {}
    await U.fsp.rm(file, { recursive: true, force: true });
  }
  index = index.filter(x => x.id !== id);
  await U.fsp.writeFile(indexFile, JSON.stringify(index, null, 2));
  return true;
}

// ---------- Privacidad ----------
function browserProfiles() {
  const B = [];
  const chromium = (name, base) => B.push({ name, kind: 'chromium', base });
  if (IS_MAC) {
    chromium('Google Chrome', h('Library/Application Support/Google/Chrome'));
    chromium('Microsoft Edge', h('Library/Application Support/Microsoft Edge'));
    chromium('Brave', h('Library/Application Support/BraveSoftware/Brave-Browser'));
    chromium('Opera', h('Library/Application Support/com.operasoftware.Opera'));
    chromium('Vivaldi', h('Library/Application Support/Vivaldi'));
    B.push({ name: 'Firefox', kind: 'firefox', base: h('Library/Application Support/Firefox/Profiles') });
    B.push({ name: 'Safari', kind: 'safari', base: h('Library/Safari') });
  } else if (IS_WIN) {
    chromium('Google Chrome', path.join(U.LOCALAPPDATA, 'Google/Chrome/User Data'));
    chromium('Microsoft Edge', path.join(U.LOCALAPPDATA, 'Microsoft/Edge/User Data'));
    chromium('Brave', path.join(U.LOCALAPPDATA, 'BraveSoftware/Brave-Browser/User Data'));
    chromium('Opera', path.join(U.APPDATA, 'Opera Software/Opera Stable'));
    chromium('Vivaldi', path.join(U.LOCALAPPDATA, 'Vivaldi/User Data'));
    B.push({ name: 'Firefox', kind: 'firefox', base: path.join(U.APPDATA, 'Mozilla/Firefox/Profiles') });
  } else {
    chromium('Google Chrome', path.join(U.XDG_CONFIG, 'google-chrome'));
    chromium('Chromium', path.join(U.XDG_CONFIG, 'chromium'));
    chromium('Microsoft Edge', path.join(U.XDG_CONFIG, 'microsoft-edge'));
    chromium('Brave', path.join(U.XDG_CONFIG, 'BraveSoftware/Brave-Browser'));
    chromium('Vivaldi', path.join(U.XDG_CONFIG, 'vivaldi'));
    chromium('Opera', path.join(U.XDG_CONFIG, 'opera'));
    B.push({ name: 'Firefox', kind: 'firefox', base: h('.mozilla/firefox') });
    B.push({ name: 'Firefox (Snap)', kind: 'firefox', base: h('snap/firefox/common/.mozilla/firefox') });
  }
  return B;
}

const PRIVACY_FILES = {
  chromium: {
    history: ['History', 'History-journal', 'Visited Links', 'Top Sites', 'Top Sites-journal', 'Shortcuts', 'Shortcuts-journal'],
    cookies: ['Cookies', 'Cookies-journal', 'Network/Cookies', 'Network/Cookies-journal'],
    autofill: ['Web Data', 'Web Data-journal'],
    sessions: ['Sessions', 'Current Session', 'Current Tabs', 'Last Session', 'Last Tabs'],
    downloads: [],
  },
  firefox: {
    history: ['places.sqlite-wal', 'formhistory.sqlite', 'sessionstore.jsonlz4', 'sessionstore-backups'],
    cookies: ['cookies.sqlite', 'cookies.sqlite-wal'],
    autofill: ['formhistory.sqlite'],
    sessions: ['sessionstore.jsonlz4', 'sessionstore-backups'],
  },
  safari: {
    history: ['History.db', 'History.db-wal', 'History.db-shm', 'LastSession.plist'],
    cookies: [],
    autofill: ['Form Values'],
    sessions: ['LastSession.plist'],
  },
};
const PRIVACY_LABELS = { history: 'Historial de navegación', cookies: 'Cookies', autofill: 'Datos de autocompletado', sessions: 'Sesiones y pestañas recientes' };

async function profileDirs(b) {
  if (!(await U.exists(b.base))) return [];
  if (b.kind === 'safari') return [b.base];
  if (b.kind === 'firefox') return (await U.expand(path.join(b.base, '*'))).filter(p => U.fs.existsSync(path.join(p, 'prefs.js')));
  const dirs = await U.expand(path.join(b.base, '*'));
  return dirs.filter(p => /[\\/](Default|Profile \d+)$/.test(p) || U.fs.existsSync(path.join(p, 'Preferences')) && !/System Profile|Guest Profile/.test(p));
}

async function scanPrivacy() {
  const out = [];
  for (const b of browserProfiles()) {
    const profiles = await profileDirs(b);
    if (!profiles.length) continue;
    const kinds = PRIVACY_FILES[b.kind];
    const entry = { browser: b.name, kind: b.kind, profiles: profiles.length, items: [] };
    for (const k of Object.keys(kinds)) {
      let bytes = 0; const files = [];
      for (const prof of profiles) for (const f of kinds[k]) {
        const full = path.join(prof, f);
        if (await U.exists(full)) { const s = await U.sizeOf(full); bytes += s.bytes; files.push(full); }
      }
      if (files.length) entry.items.push({ id: k, name: PRIVACY_LABELS[k], bytes, files });
    }
    if (entry.items.length) out.push(entry);
  }
  // Elementos recientes del sistema
  const recent = [];
  if (IS_WIN) recent.push(path.join(U.APPDATA, 'Microsoft/Windows/Recent'));
  if (IS_LINUX) recent.push(path.join(U.XDG_DATA, 'recently-used.xbel'));
  if (IS_MAC) recent.push(...(await U.expand(h('Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments/*.sfl*'))));
  const rf = recent.filter(p => U.fs.existsSync(p));
  if (rf.length) {
    let bytes = 0; for (const p of rf) bytes += (await U.sizeOf(p)).bytes;
    out.push({ browser: 'Sistema', kind: 'system', items: [{ id: 'recent', name: 'Documentos y elementos recientes', bytes, files: rf }] });
  }
  return out;
}

async function runningBrowsers() {
  const names = IS_WIN ? ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe']
    : ['Google Chrome', 'chrome', 'Microsoft Edge', 'msedge', 'firefox', 'Brave Browser', 'brave', 'Safari', 'opera', 'vivaldi'];
  const r = IS_WIN ? await U.run('tasklist', ['/fo', 'csv', '/nh']) : await U.run('ps', ['-axco', 'comm']);
  const txt = r.stdout.toLowerCase();
  return names.filter(n => txt.includes(n.toLowerCase()));
}

async function cleanPrivacy(files) {
  let freed = 0, errors = 0;
  for (const f of files) {
    try {
      if (IS_WIN && /[\\/]Recent$/.test(f)) { const r = await U.emptyDir(f); freed += r.freed; continue; }
      freed += await U.removePath(f);
    } catch { errors++; }
  }
  store.addHistory({ type: 'privacidad', freed, detail: `${files.length} elementos de privacidad` });
  return { freed, errors };
}

// ---------- Protección en tiempo real (Descargas y arranque) ----------
const watchers = [];
function startRealtime() {
  stopRealtime();
  const dirs = [h('Downloads'), h('Descargas')];
  if (IS_MAC) dirs.push(h('Library/LaunchAgents'));
  if (IS_LINUX) dirs.push(path.join(U.XDG_CONFIG, 'autostart'));
  if (IS_WIN) dirs.push(path.join(U.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup'));
  const recent = new Map();
  for (const d of dirs) {
    if (!U.fs.existsSync(d)) continue;
    try {
      const w = U.fs.watch(d, async (ev, name) => {
        if (!name || /\.(crdownload|part|download|tmp)$/i.test(name)) return;
        const full = path.join(d, name);
        if (recent.has(full) && Date.now() - recent.get(full) < 5000) return;
        recent.set(full, Date.now());
        setTimeout(async () => {
          try {
            const st = await U.fsp.lstat(full);
            if (!st.isFile()) return;
            const f = await inspectFile(full, st);
            if (f.length) store.notify('Archivo sospechoso detectado', `${name}: ${f[0]}`, { level: 'danger', action: 'protection' });
            else if (/LaunchAgents|autostart|Startup/.test(d)) store.notify('Nuevo elemento de arranque', `${name} se agregó al inicio del sistema.`, { level: 'warning', action: 'performance' });
          } catch {}
        }, 1500);
      });
      watchers.push(w);
    } catch {}
  }
}
function stopRealtime() { while (watchers.length) { try { watchers.pop().close(); } catch {} } }

module.exports = { scanMalware, cancelScan, quarantine, listQuarantine, quarantineAction, scanPrivacy, cleanPrivacy, runningBrowsers, startRealtime, stopRealtime, inspectFile };
