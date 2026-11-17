// LimpiaPc-MX — Lente de espacio, Limpieza de la nube y Triturador
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const crypto = require('crypto');
const si = require('systeminformation');
const U = require('../core/util');
const store = require('../core/store');
const { path, h, IS_MAC, IS_WIN, IS_LINUX } = U;

// ---------------------------- Lente de espacio ----------------------------
let lensCtrl = null;

/**
 * Construye un árbol de tamaños. Los nodos más profundos que `depth` se agregan.
 * Los hijos pequeños (< 0.4% del padre) se agrupan en "Otros".
 */
async function lens(root, { depth = 4 } = {}, onProgress = () => {}) {
  if (lensCtrl) lensCtrl.abort();
  lensCtrl = new AbortController();
  const signal = lensCtrl.signal;
  let files = 0;
  let lastTick = Date.now();

  async function build(dir, d) {
    const node = { name: path.basename(dir) || dir, path: dir, size: 0, files: 0, children: [] };
    let entries;
    try { entries = await U.fsp.readdir(dir, { withFileTypes: true }); } catch { node.denied = true; return node; }
    let loose = 0, looseCount = 0;
    for (const e of entries) {
      if (signal.aborted) break;
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (IS_LINUX && /^\/(proc|sys|dev|run|snap)$/.test(full)) continue;
      if (IS_MAC && /^\/(System\/Volumes|Volumes|dev|private\/var\/vm)$/.test(full)) continue;
      if (e.isDirectory()) {
        if (d < depth) {
          const child = await build(full, d + 1);
          node.size += child.size; node.files += child.files;
          node.children.push(child);
        } else {
          const s = await U.sizeOf(full, { signal });
          files += s.files;
          node.size += s.bytes; node.files += s.files;
          node.children.push({ name: e.name, path: full, size: s.bytes, files: s.files, dir: true });
        }
      } else if (e.isFile()) {
        try {
          const st = await U.fsp.lstat(full);
          const b = U.diskBytes(st);
          node.size += b; node.files++; files++;
          node.children.push({ name: e.name, path: full, size: b, files: 1, file: true });
        } catch {}
      }
      if (Date.now() - lastTick > 250) { lastTick = Date.now(); onProgress({ step: full, files }); }
    }
    node.children.sort((a, b) => b.size - a.size);
    // compactar hijos diminutos
    const keep = [], small = [];
    for (const c of node.children) (c.size >= node.size * 0.004 && keep.length < 80 ? keep : small).push(c);
    if (small.length) {
      for (const s of small) { loose += s.size; looseCount += s.files; }
      keep.push({ name: `Otros ${small.length} elementos`, path: dir, size: loose, files: looseCount, other: true });
    }
    node.children = keep;
    node.dir = true;
    return node;
  }
  const tree = await build(root, 0);
  return { tree, aborted: signal.aborted };
}
function cancelLens() { if (lensCtrl) lensCtrl.abort(); }

async function volumes() {
  const fsz = await si.fsSize();
  return fsz.filter(v => v.size > 1e9 && !/^\/(boot|snap|run|dev)|\/System\/Volumes\/(VM|Preboot|Update|xarts|iSCPreboot|Hardware)/.test(v.mount))
    .map(v => ({ mount: v.mount, fs: v.fs, type: v.type, size: v.size, used: v.used, available: v.available ?? (v.size - v.used), use: v.use }));
}

// ---------------------------- Nube ----------------------------
async function cloudFolders() {
  const cands = [];
  if (IS_MAC) {
    cands.push(['iCloud Drive', h('Library/Mobile Documents/com~apple~CloudDocs'), 'icloud']);
    for (const p of await U.expand(h('Library/CloudStorage/*'))) {
      const n = path.basename(p);
      const svc = /OneDrive/i.test(n) ? 'onedrive' : /Google/i.test(n) ? 'gdrive' : /Dropbox/i.test(n) ? 'dropbox' : /Box/i.test(n) ? 'box' : 'otro';
      cands.push([n.replace(/-/g, ' · '), p, svc]);
    }
  }
  if (IS_WIN) {
    for (const p of await U.expand(path.join(U.HOME, 'OneDrive*'))) cands.push([path.basename(p), p, 'onedrive']);
    cands.push(['iCloud Drive', h('iCloudDrive'), 'icloud']);
    cands.push(['Google Drive', h('Google Drive'), 'gdrive']);
    for (const L of ['G:\\', 'H:\\']) if (U.fs.existsSync(path.join(L, 'My Drive')) || U.fs.existsSync(path.join(L, 'Mi unidad'))) cands.push(['Google Drive (' + L + ')', L, 'gdrive']);
  }
  if (IS_LINUX) {
    cands.push(['OneDrive', h('OneDrive'), 'onedrive'], ['Google Drive', h('GoogleDrive'), 'gdrive'], ['Google Drive', h('google-drive'), 'gdrive'], ['Nextcloud', h('Nextcloud'), 'nextcloud'], ['MEGA', h('MEGA'), 'mega'], ['pCloud', h('pCloudDrive'), 'pcloud']);
  }
  cands.push(['Dropbox', h('Dropbox'), 'dropbox']);
  const seen = new Set();
  const out = [];
  for (const [name, p, svc] of cands) {
    if (seen.has(p) || !(await U.isDir(p))) continue;
    seen.add(p);
    out.push({ name, path: p, service: svc, canEvict: (IS_MAC && (svc === 'icloud' || p.includes('CloudStorage'))) || (IS_WIN && svc === 'onedrive') });
  }
  return out;
}

async function cloudScan(folder, onProgress = () => {}) {
  const files = [];
  let local = 0, logical = 0, n = 0;
  await U.walk(folder, {
    skip: f => /[\\/]\.(dropbox\.cache|tmp\.drivedownload|Trash)/.test(f),
    onFile: (f, st) => {
      n++; if (n % 300 === 0) onProgress({ step: f, scanned: n });
      const onDisk = U.diskBytes(st);
      local += onDisk; logical += st.size;
      files.push({ path: f, name: path.basename(f), bytes: st.size, local: onDisk, modified: st.mtimeMs, accessed: st.atimeMs });
    },
  });
  files.sort((a, b) => b.local - a.local);
  return { local, logical, count: n, files: files.slice(0, 1500) };
}

/** Libera la copia local manteniéndola en la nube. */
async function cloudEvict(paths) {
  let ok = 0; const errors = [];
  for (const p of paths) {
    let r;
    if (IS_MAC) r = p.includes('Mobile Documents') ? await U.run('brctl', ['evict', p]) : await U.run('fileproviderctl', ['evict', p]);
    else if (IS_WIN) r = await U.run('attrib', ['+U', '-P', p]);
    else r = { ok: false, error: 'No soportado en Linux' };
    if (r.ok) ok++; else errors.push(p + ': ' + (r.stderr || r.error || ''));
  }
  return { ok, errors };
}

// ---------------------------- Triturador ----------------------------
async function shredFile(file, passes) {
  const st = await U.fsp.stat(file);
  const fd = await U.fsp.open(file, 'r+');
  try {
    const chunk = 1024 * 1024;
    for (let p = 0; p < passes; p++) {
      for (let off = 0; off < st.size; off += chunk) {
        const len = Math.min(chunk, st.size - off);
        const buf = p === passes - 1 && passes > 1 ? Buffer.alloc(len, 0) : crypto.randomBytes(len);
        await fd.write(buf, 0, len, off);
      }
      await fd.sync();
    }
    await fd.truncate(0);
  } finally { await fd.close(); }
  // renombrar varias veces para ocultar el nombre original
  let cur = file;
  for (let i = 0; i < 3; i++) {
    const nn = path.join(path.dirname(cur), crypto.randomBytes(8).toString('hex'));
    await U.fsp.rename(cur, nn); cur = nn;
  }
  await U.fsp.rm(cur, { force: true });
  return st.size;
}

async function shred(paths, { passes = 3 } = {}, onProgress = () => {}) {
  let freed = 0; const errors = []; let n = 0;
  for (const p of paths) {
    try {
      const st = await U.fsp.lstat(p);
      if (st.isDirectory()) {
        const files = [];
        await U.walk(p, { onFile: f => { files.push(f); } });
        for (const f of files) { onProgress({ step: f, done: ++n }); try { freed += await shredFile(f, passes); } catch (e) { errors.push(f + ': ' + e.message); } }
        await U.fsp.rm(p, { recursive: true, force: true });
      } else { onProgress({ step: p, done: ++n }); freed += await shredFile(p, passes); }
    } catch (e) { errors.push(p + ': ' + e.message); }
  }
  store.addHistory({ type: 'triturador', freed, detail: `${paths.length} elementos triturados (${passes} pasadas)` });
  return { freed, errors };
}

module.exports = { lens, cancelLens, volumes, cloudFolders, cloudScan, cloudEvict, shred };
