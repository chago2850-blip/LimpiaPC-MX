// LimpiaPc-MX — utilidades de interfaz  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICONS = {
  home: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  smartcare: I('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/><path d="M5 2l.6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z"/>'),
  cleanup: I('<path d="M20 3l-8 8"/><path d="M12.6 10.4c-2.2-1-4.6-.3-5.8 1.6L4 17.5c2.6 1.9 6.1 3.3 9.6 3.5l2.2-5.6c.9-1.9.1-4-1.6-5z"/><path d="M8.2 15.6L6.6 19M11.2 16.8l-1 3.4"/>'),
  protection: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  performance: I('<path d="M12 14l4-4"/><path d="M3.3 16a9 9 0 1 1 17.4 0"/><circle cx="12" cy="14" r="1.5"/>'),
  apps: I('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
  clutter: I('<path d="M4 7h16"/><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M9 3h6v4H9z"/><path d="M10 11v6M14 11v6"/>'),
  spacelens: I('<circle cx="9" cy="9" r="6"/><circle cx="17" cy="15" r="4"/><circle cx="7.5" cy="18.5" r="2.5"/>'),
  cloud: I('<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>'),
  tools: I('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'),
  shredder: I('<rect x="4" y="3" width="16" height="9" rx="2"/><path d="M3 12h18"/><path d="M7 15v6M10.5 15v4M14 15v6M17.5 15v3"/>'),
  bell: I('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  history: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
  settings: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  info: I('<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>'),
  check: I('<path d="M5 12l5 5L20 7"/>', 'stroke-width="2.6"'),
  x: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  trash: I('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>'),
  folder: I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  file: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  eye: I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  cpu: I('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
  ram: I('<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11v2M10 11v2M14 11v2M18 11v2M6 17v3M18 17v3"/>'),
  disk: I('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  battery: I('<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 10v4M10 10v4"/>'),
  temp: I('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'),
  net: I('<path d="M7 17V7l-3 3M17 7v10l3-3"/>'),
  play: I('<path d="M7 4l13 8-13 8z"/>'),
  refresh: I('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  pin: I('<path d="M12 17v5"/><path d="M5 17h14l-2-4V5H7v8z"/>'),
  update: I('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  puzzle: I('<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3h7"/>'),
  monitor: I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  copy: I('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  image: I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>'),
  download: I('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>'),
  stop: I('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  warn: I('<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 18h.01"/>'),
  heart: I('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>'),
  rocket: I('<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.1 2.1 0 0 0-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-4A13 13 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>'),
  sparkle: I('<path d="M12 2c.8 5 2.9 7.2 8 8-5.1.8-7.2 3-8 8-.8-5-2.9-7.2-8-8 5.1-.8 7.2-3 8-8z"/>'),
  github: I('<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-6.9a5.4 5.4 0 0 0-1.5-3.7 5 5 0 0 0-.1-3.7s-1.2-.4-3.9 1.4a13.3 13.3 0 0 0-7 0C6.3 1.8 5.1 2.2 5.1 2.2a5 5 0 0 0-.1 3.7A5.4 5.4 0 0 0 3.5 9.6c0 5.4 3.3 6.5 6.4 6.9a3.4 3.4 0 0 0-.9 2.6V23"/>'),
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtBytes(b) {
  if (!b || b < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return (b / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0).replace('.', ',') + ' ' + u[i];
}
function fmtDate(ms) { if (!ms) return '—'; return new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtAgo(ms) {
  if (!ms) return 'nunca';
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return 'hace un momento'; if (d < 3600) return `hace ${Math.floor(d / 60)} min`; if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  const days = Math.floor(d / 86400); if (days < 30) return `hace ${days} día${days > 1 ? 's' : ''}`;
  const m = Math.floor(days / 30); if (m < 12) return `hace ${m} mes${m > 1 ? 'es' : ''}`; return `hace ${Math.floor(m / 12)} año(s)`;
}
function fmtDur(s) { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`; }
function shortPath(p) { const home = window.__home || ''; return home && p.startsWith(home) ? '~' + p.slice(home.length) : p; }

function html(strings, ...vals) { return strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), ''); }
function h(htmlStr) { const t = document.createElement('template'); t.innerHTML = htmlStr.trim(); return t.content.firstElementChild; }

function toast(title, body = '', level = 'info', ms = 4200) {
  let box = $('.toasts'); if (!box) { box = h('<div class="toasts"></div>'); document.body.appendChild(box); }
  const t = h(`<div class="toast ${level}"><b>${esc(title)}</b><span>${esc(body)}</span></div>`);
  box.appendChild(t); setTimeout(() => { t.style.opacity = 0; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, ms);
}

function modal({ title, body = '', ok = 'Aceptar', cancel = 'Cancelar', danger = false, wide = false }) {
  return new Promise(res => {
    const m = h(`<div class="modal-bg"><div class="modal" ${wide ? 'style="width:min(820px,94vw)"' : ''}><h2>${esc(title)}</h2><div class="muted" style="line-height:1.55">${body}</div><div class="actions">${cancel ? `<button class="btn ghost" data-r="0">${esc(cancel)}</button>` : ''}<button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div></div></div>`);
    m.addEventListener('click', e => { const r = e.target.dataset.r; if (r !== undefined || e.target === m) { m.remove(); res(r === '1'); } });
    document.body.appendChild(m);
  });
}

function ring(pct, color = 'url(#g)', size = 220, stroke = 14) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 ${size} ${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.08)" stroke-width="${stroke}" fill="none"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, pct / 100)))}" style="transition:stroke-dashoffset .5s"/></svg>`;
}

function hero(el, { key, title, desc, feats = [], action = 'Analizar', onStart, extra = '' }) {
  el.innerHTML = `<div class="hero" style="--c:var(--m-${key})">
    <div><h1>${esc(title)}</h1><p class="lead">${esc(desc)}</p>
      <div class="feat">${feats.map(f => `<div>${ICONS.check}<div><b>${esc(f[0])}</b>${esc(f[1])}</div></div>`).join('')}</div>
      <div class="row">${action ? `<button class="btn primary big" id="hero-go">${esc(action)}</button>` : ''}${extra}</div></div>
    <div class="art"><div class="orb">${ICONS[key] || ICONS.sparkle}</div></div></div>`;
  const b = $('#hero-go', el); if (b && onStart) b.onclick = onStart;
}

function scanning(el, { key, title, onCancel }) {
  el.innerHTML = `<div class="scanning" style="--c:var(--m-${key})"><div>
    <div class="ring">${ring(0)}<div class="pct"><div><span id="sc-pct">0</span>%<small id="sc-sub">${esc(title)}</small></div></div></div>
    <h2 class="pulse">${esc(title)}</h2><div class="scan-step" id="sc-step">Preparando…</div>
    ${onCancel ? '<button class="btn ghost" id="sc-cancel">Detener</button>' : ''}</div></div>`;
  if (onCancel) $('#sc-cancel', el).onclick = onCancel;
  let fake = 0, timer = null;
  const api = {
    update(d = {}) {
      if (d.pct !== undefined) { setPct(d.pct); } else if (!timer) { timer = setInterval(() => { fake = Math.min(95, fake + (95 - fake) * 0.03); setPct(fake); }, 300); }
      if (d.step) { const s = $('#sc-step', el); if (s) s.textContent = '‎' + shortPath(String(d.step)); }
      if (d.scanned !== undefined) { const s = $('#sc-sub', el); if (s) s.textContent = `${d.scanned.toLocaleString('es-MX')} archivos`; }
    },
    stop() { clearInterval(timer); },
  };
  function setPct(p) { const r = $('.ring', el); if (!r) return; r.querySelector('svg').outerHTML = ring(p); $('#sc-pct', el).textContent = Math.round(p); }
  api.update({});
  return api;
}

function doneView(el, { title, sub, back, extra = '' }) {
  el.innerHTML = `<div class="done"><div class="check">${ICONS.check}</div><h1>${esc(title)}</h1><p class="lead" style="margin:6px auto 24px">${esc(sub)}</p><div class="row" style="justify-content:center">${extra}<button class="btn primary" id="done-back">Listo</button></div></div>`;
  $('#done-back', el).onclick = back;
}

function fileIcon(kind) {
  return { Video: ICONS.play, Imagen: ICONS.image, Carpeta: ICONS.folder, 'Instalador / imagen de disco': ICONS.download }[kind] || ICONS.file;
}

/** Tabla/lista seleccionable reutilizable. */
function selectableList(container, items, { render, key = i => i.path, onChange = () => {}, preselect = () => false, size = i => i.bytes || 0 }) {
  const sel = new Set(items.filter(preselect).map(key));
  container.innerHTML = `<div class="list">${items.map((it, idx) => `<label class="item"><input type="checkbox" data-i="${idx}" ${sel.has(key(it)) ? 'checked' : ''}>${render(it)}</label>`).join('') || '<div class="empty">Nada por aquí ✨</div>'}</div>`;
  container.addEventListener('change', e => {
    const i = e.target.dataset.i; if (i === undefined) return;
    const k = key(items[i]); e.target.checked ? sel.add(k) : sel.delete(k);
    onChange(sel, total());
  });
  const total = () => items.filter(it => sel.has(key(it))).reduce((a, b) => a + size(b), 0);
  onChange(sel, total());
  return { sel, total, setAll(v) { items.forEach(it => v ? sel.add(key(it)) : sel.delete(key(it))); $$('input[type=checkbox]', container).forEach(c => c.checked = v); onChange(sel, total()); } };
}

window.UI = { ICONS, $, $$, esc, fmtBytes, fmtDate, fmtAgo, fmtDur, shortPath, html, h, toast, modal, ring, hero, scanning, doneView, fileIcon, selectableList };
