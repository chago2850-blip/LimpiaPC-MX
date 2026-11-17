// LimpiaPc-MX — Mi desorden: archivos grandes y antiguos, duplicados, imágenes similares y descargas
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const crypto = require('crypto');
const { nativeImage, shell } = require('electron');
const U = require('../core/util');
const store = require('../core/store');
const { path, h } = U;

const DAY = 86400000;
const IMG = /\.(jpe?g|png|gif|bmp|webp|tiff?|heic)$/i;
const KINDS = [
  ['Video', /\.(mp4|mkv|mov|avi|wmv|flv|webm|m4v|mpg|mpeg|3gp)$/i],
  ['Audio', /\.(mp3|wav|flac|aac|ogg|m4a|wma|aiff?)$/i],
  ['Imagen', /\.(jpe?g|png|gif|bmp|webp|tiff?|heic|raw|cr2|nef|psd)$/i],
  ['Archivo comprimido', /\.(zip|rar|7z|tar|gz|bz2|xz|tgz|zst)$/i],
  ['Instalador / imagen de disco', /\.(dmg|pkg|iso|img|exe|msi|deb|rpm|appimage|apk)$/i],
  ['Documento', /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|rtf|epub)$/i],
  ['Máquina virtual', /\.(vdi|vmdk|vhdx?|qcow2|ova|ovf)$/i],
];
const kindOf = n => (KINDS.find(([, re]) => re.test(n)) || ['Otro'])[0];

function defaultRoots() {
  return [U.HOME];
}

const SKIP = /[\\/](node_modules|\.git|\.cache|\.npm|\.gradle|\.cargo|\.rustup|Library[\\/](Caches|Containers|Group Containers|Developer|Application Support[\\/]MobileSync)|AppData|\.Trash|Trash|\.local[\\/]share[\\/](Trash|flatpak)|snap|\.var|\$Recycle\.Bin)([\\/]|$)/;
const skipFn = full => SKIP.test(full) || store.isExcluded(full);

let ctrl = null;
function cancel() { if (ctrl) ctrl.abort(); }

async function largeOld({ roots = defaultRoots(), minMB, oldDays } = {}, onProgress = () => {}) {
  ctrl = new AbortController();
  minMB = minMB ?? store.get('largeFileMinMB');
  oldDays = oldDays ?? store.get('oldFileDays');
  const min = minMB * 1024 * 1024;
  const now = Date.now();
  const out = [];
  let n = 0;
  for (const r of roots) {
    await U.walk(r, {
      signal: ctrl.signal, skip: skipFn,
      onFile: (f, st) => {
        if (++n % 500 === 0) onProgress({ step: f, scanned: n });
        const old = now - Math.max(st.atimeMs, st.mtimeMs) > oldDays * DAY;
        if (st.size >= min || (old && st.size >= 10 * 1024 * 1024)) {
          out.push({ path: f, name: path.basename(f), bytes: st.size, modified: st.mtimeMs, accessed: st.atimeMs, kind: kindOf(f), large: st.size >= min, old });
        }
      },
    });
  }
  out.sort((a, b) => b.bytes - a.bytes);
  return { files: out.slice(0, 3000), scanned: n };
}

async function partialHash(file, size) {
  const fd = await U.fsp.open(file, 'r');
  try {
    const len = Math.min(size, 64 * 1024);
    const buf = Buffer.alloc(len * (size > len * 2 ? 2 : 1));
    await fd.read(buf, 0, len, 0);
    if (size > len * 2) await fd.read(buf, len, len, size - len);
    return crypto.createHash('sha1').update(buf).digest('hex');
  } finally { await fd.close(); }
}
function fullHash(file) {
  return new Promise(res => {
    const hs = crypto.createHash('sha1');
    U.fs.createReadStream(file).on('data', d => hs.update(d)).on('end', () => res(hs.digest('hex'))).on('error', () => res(null));
  });
}

async function duplicates({ roots = defaultRoots(), minKB = 100 } = {}, onProgress = () => {}) {
  ctrl = new AbortController();
  const bySize = new Map();
  let n = 0;
  for (const r of roots) {
    await U.walk(r, {
      signal: ctrl.signal, skip: skipFn,
      onFile: (f, st) => {
        if (++n % 500 === 0) onProgress({ step: 'Indexando: ' + f, scanned: n });
        if (st.size < minKB * 1024) return;
        if (!bySize.has(st.size)) bySize.set(st.size, []);
        bySize.get(st.size).push({ path: f, bytes: st.size, modified: st.mtimeMs });
      },
    });
  }
  const groups = [];
  const candidates = [...bySize.values()].filter(g => g.length > 1);
  let i = 0;
  for (const g of candidates) {
    if (ctrl.signal.aborted) break;
    if (++i % 20 === 0) onProgress({ step: `Comparando contenido (${i}/${candidates.length})`, scanned: n });
    const byPartial = new Map();
    for (const f of g) { try { const k = await partialHash(f.path, f.bytes); (byPartial.get(k) || byPartial.set(k, []).get(k)).push(f); } catch {} }
    for (const pg of byPartial.values()) {
      if (pg.length < 2) continue;
      const byFull = new Map();
      for (const f of pg) { const k = await fullHash(f.path); if (k) (byFull.get(k) || byFull.set(k, []).get(k)).push(f); }
      for (const [hash, fg] of byFull) if (fg.length > 1) {
        fg.sort((a, b) => a.modified - b.modified);
        groups.push({ hash, bytes: fg[0].bytes, wasted: fg[0].bytes * (fg.length - 1), files: fg.map(f => ({ ...f, name: path.basename(f.path), kind: kindOf(f.path) })) });
      }
    }
  }
  groups.sort((a, b) => b.wasted - a.wasted);
  return { groups, scanned: n };
}

// dHash perceptual de 64 bits usando nativeImage (sin dependencias nativas)
function dhash(file) {
  try {
    let img = nativeImage.createFromPath(file);
    if (img.isEmpty()) return null;
    img = img.resize({ width: 9, height: 8, quality: 'good' });
    const bmp = img.toBitmap(); // BGRA
    const sz = img.getSize();
    if (sz.width !== 9 || sz.height !== 8) return null;
    const g = [];
    for (let i = 0; i < 72; i++) g.push(bmp[i * 4] * 0.114 + bmp[i * 4 + 1] * 0.587 + bmp[i * 4 + 2] * 0.299);
    let bits = 0n;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (g[y * 9 + x] > g[y * 9 + x + 1] ? 1n : 0n);
    return bits;
  } catch { return null; }
}
function hamming(a, b) { let x = a ^ b, c = 0; while (x) { x &= x - 1n; c++; } return c; }

async function similarImages({ roots = [h('Pictures'), h('Imágenes'), h('Desktop'), h('Escritorio'), h('Downloads'), h('Descargas')], threshold = 6 } = {}, onProgress = () => {}) {
  ctrl = new AbortController();
  const imgs = [];
  for (const r of roots) {
    if (!U.fs.existsSync(r)) continue;
    await U.walk(r, { signal: ctrl.signal, skip: f => skipFn(f) || /Photos Library\.photoslibrary/.test(f), onFile: (f, st) => { if (IMG.test(f) && st.size > 20 * 1024 && !/\.heic$/i.test(f)) imgs.push({ path: f, bytes: st.size, modified: st.mtimeMs }); } });
  }
  const hashed = [];
  for (let i = 0; i < imgs.length; i++) {
    if (ctrl.signal.aborted) break;
    if (i % 25 === 0) { onProgress({ step: `Analizando imágenes (${i}/${imgs.length})`, scanned: i }); await new Promise(r => setImmediate(r)); }
    const d = dhash(imgs[i].path);
    if (d !== null) hashed.push({ ...imgs[i], d });
  }
  const used = new Set();
  const groups = [];
  for (let i = 0; i < hashed.length; i++) {
    if (used.has(i)) continue;
    const g = [hashed[i]];
    for (let j = i + 1; j < hashed.length; j++) if (!used.has(j) && hamming(hashed[i].d, hashed[j].d) <= threshold) { g.push(hashed[j]); used.add(j); }
    if (g.length > 1) {
      used.add(i);
      g.sort((a, b) => b.bytes - a.bytes); // conserva la de mayor calidad primero
      groups.push({ files: g.map(({ d, ...f }) => ({ ...f, name: path.basename(f.path) })), wasted: g.slice(1).reduce((a, b) => a + b.bytes, 0) });
    }
  }
  groups.sort((a, b) => b.wasted - a.wasted);
  return { groups, scanned: hashed.length };
}

async function downloads({ olderThanDays = 30 } = {}) {
  const dirs = [h('Downloads'), h('Descargas')].filter(d => U.fs.existsSync(d));
  const out = [];
  const now = Date.now();
  for (const d of dirs) {
    let es = []; try { es = await U.fsp.readdir(d); } catch {}
    for (const e of es) {
      if (e.startsWith('.')) continue;
      const full = path.join(d, e);
      try {
        const st = await U.fsp.lstat(full);
        const { bytes } = st.isDirectory() ? await U.sizeOf(full) : { bytes: st.size };
        out.push({ path: full, name: e, bytes, modified: st.mtimeMs, old: now - st.mtimeMs > olderThanDays * DAY, kind: st.isDirectory() ? 'Carpeta' : kindOf(e) });
      } catch {}
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}

async function removeFiles(paths, mode) {
  mode = mode || store.get('deleteMode');
  let freed = 0; const errors = [];
  for (const p of paths) {
    try {
      const { bytes } = await U.sizeOf(p);
      if (mode === 'trash') await shell.trashItem(p); else await U.fsp.rm(p, { recursive: true, force: true });
      freed += bytes;
    } catch (e) { errors.push(p + ': ' + e.message); }
  }
  store.addHistory({ type: 'archivos', freed, detail: `${paths.length - errors.length} elementos ${mode === 'trash' ? 'a la papelera' : 'eliminados'}` });
  return { freed, errors };
}

module.exports = { largeOld, duplicates, similarImages, downloads, removeFiles, cancel, kindOf };
