// LimpiaPc-MX — utilidades del sistema de archivos y procesos
// Copyright (C) 2026 Santiago Miguel
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');

const PLATFORM = process.platform; // 'darwin' | 'win32' | 'linux'
const HOME = os.homedir();
const IS_MAC = PLATFORM === 'darwin';
const IS_WIN = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

const env = (k, def = '') => process.env[k] || def;
const LOCALAPPDATA = env('LOCALAPPDATA', path.join(HOME, 'AppData', 'Local'));
const APPDATA = env('APPDATA', path.join(HOME, 'AppData', 'Roaming'));
const PROGRAMDATA = env('ProgramData', 'C:\\ProgramData');
const WINDIR = env('WINDIR', 'C:\\Windows');
const XDG_CACHE = env('XDG_CACHE_HOME', path.join(HOME, '.cache'));
const XDG_CONFIG = env('XDG_CONFIG_HOME', path.join(HOME, '.config'));
const XDG_DATA = env('XDG_DATA_HOME', path.join(HOME, '.local', 'share'));

function h(...p) { return path.join(HOME, ...p); }

async function exists(p) {
  try { await fsp.lstat(p); return true; } catch { return false; }
}

async function isDir(p) {
  try { return (await fsp.stat(p)).isDirectory(); } catch { return false; }
}

/** Tamaño ocupado en disco (bloques reales si el SO los reporta). */
function diskBytes(st) {
  if (st.blocks !== undefined && st.blocks !== null && !IS_WIN) return st.blocks * 512;
  return st.size;
}

/** Expande rutas con comodines simples (* en cualquier segmento). */
async function expand(pattern) {
  const norm = path.normalize(pattern);
  if (!norm.includes('*')) return (await exists(norm)) ? [norm] : [];
  const parsed = path.parse(norm);
  const parts = norm.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = [parsed.root || '/'];
  for (const part of parts) {
    const next = [];
    if (part.includes('*')) {
      const re = new RegExp('^' + part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', IS_WIN ? 'i' : '');
      for (const base of current) {
        let entries = [];
        try { entries = await fsp.readdir(base); } catch { continue; }
        for (const e of entries) if (re.test(e)) next.push(path.join(base, e));
      }
    } else {
      for (const base of current) {
        const p = path.join(base, part);
        if (await exists(p)) next.push(p);
      }
    }
    current = next;
    if (!current.length) break;
  }
  return current;
}

/**
 * Recorre un árbol de directorios de forma iterativa.
 * onFile(fullPath, stat) se llama por cada archivo regular.
 * Devuelve { bytes, files }.
 */
async function walk(root, { onFile, onDir, maxDepth = 64, signal, skip, followHidden = true, limit = Infinity } = {}) {
  let bytes = 0, files = 0;
  const stack = [{ p: root, d: 0 }];
  let rootStat;
  try { rootStat = await fsp.lstat(root); } catch { return { bytes, files }; }
  if (rootStat.isFile()) {
    if (onFile) await onFile(root, rootStat);
    return { bytes: diskBytes(rootStat), files: 1 };
  }
  while (stack.length) {
    if (signal && signal.aborted) break;
    if (files >= limit) break;
    const { p, d } = stack.pop();
    let entries;
    try { entries = await fsp.readdir(p, { withFileTypes: true }); } catch { continue; }
    if (onDir) await onDir(p, d);
    for (const ent of entries) {
      if (!followHidden && ent.name.startsWith('.')) continue;
      const full = path.join(p, ent.name);
      if (skip && skip(full, ent)) continue;
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        if (d < maxDepth) stack.push({ p: full, d: d + 1 });
      } else if (ent.isFile()) {
        let st;
        try { st = await fsp.lstat(full); } catch { continue; }
        bytes += diskBytes(st); files++;
        if (onFile) await onFile(full, st);
      }
    }
    // cede el bucle de eventos para mantener la app fluida
    if (files % 400 === 0) await new Promise(r => setImmediate(r));
  }
  return { bytes, files };
}

async function sizeOf(p, opts = {}) {
  return walk(p, opts);
}

/** Elimina el contenido de un directorio sin borrar el directorio. */
async function emptyDir(dir, { olderThanMs = 0 } = {}) {
  let freed = 0, errors = 0;
  let entries;
  try { entries = await fsp.readdir(dir); } catch { return { freed, errors: 1 }; }
  const now = Date.now();
  for (const name of entries) {
    const full = path.join(dir, name);
    try {
      const st = await fsp.lstat(full);
      if (olderThanMs && now - st.mtimeMs < olderThanMs) continue;
      const { bytes } = await sizeOf(full);
      await fsp.rm(full, { recursive: true, force: true, maxRetries: 2 });
      freed += bytes;
    } catch { errors++; }
  }
  return { freed, errors };
}

async function removePath(p) {
  const { bytes } = await sizeOf(p);
  await fsp.rm(p, { recursive: true, force: true, maxRetries: 2 });
  return bytes;
}

/** Ejecuta un comando y devuelve stdout (no lanza: devuelve {ok, stdout, stderr}). */
function run(cmd, args = [], opts = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: opts.timeout || 120000, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err ? err.message : null });
    });
  });
}

function runShell(command, opts = {}) {
  if (IS_WIN) return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], opts);
  return run('/bin/sh', ['-c', command], opts);
}

function ps(command, opts = {}) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ' + command], opts);
}

async function which(bin) {
  const r = IS_WIN ? await run('where', [bin]) : await run('/bin/sh', ['-c', `command -v ${bin}`]);
  return r.ok && r.stdout.trim() ? r.stdout.trim().split(/\r?\n/)[0] : null;
}

/** Ejecuta con privilegios de administrador (UAC / pkexec / osascript). */
function runAdmin(command) {
  return new Promise(resolve => {
    let sudo;
    try { sudo = require('@vscode/sudo-prompt'); } catch (e) { return resolve({ ok: false, error: 'sudo-prompt no disponible' }); }
    sudo.exec(command, { name: 'LimpiaPc MX' }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err ? err.message : null });
    });
  });
}

function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}

function spawnStream(cmd, args, onLine, opts = {}) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { windowsHide: true, ...opts });
    let buf = '';
    const feed = d => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); }
    };
    child.stdout && child.stdout.on('data', feed);
    child.stderr && child.stderr.on('data', feed);
    child.on('error', e => resolve({ ok: false, error: e.message }));
    child.on('close', code => { if (buf) onLine(buf); resolve({ ok: code === 0, code }); });
    if (opts.signal) opts.signal.addEventListener('abort', () => { try { child.kill(); } catch {} });
  });
}

module.exports = {
  fs, fsp, path, os, PLATFORM, HOME, IS_MAC, IS_WIN, IS_LINUX,
  LOCALAPPDATA, APPDATA, PROGRAMDATA, WINDIR, XDG_CACHE, XDG_CONFIG, XDG_DATA,
  h, exists, isDir, expand, walk, sizeOf, emptyDir, removePath, run, runShell, ps, which, runAdmin,
  fmtBytes, diskBytes, spawnStream,
};
