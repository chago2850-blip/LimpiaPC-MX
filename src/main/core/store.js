// LimpiaPc-MX — configuración persistente, historial y centro de notificaciones
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { app, Notification } = require('electron');
const { fs, path } = require('./util');

const DEFAULTS = {
  theme: 'auto',                 // auto | dark | light
  deleteMode: 'trash',           // trash | permanent (archivos personales)
  exclusions: [],                // rutas que nunca se tocan
  largeFileMinMB: 50,
  oldFileDays: 180,
  realtimeProtection: true,
  smartCareReminderDays: 7,
  alerts: { diskLowPercent: 10, ramHighPercent: 90, tempHighC: 90, batteryHealthLow: 80 },
  pinnedTools: ['cleanup', 'protection', 'performance', 'spacelens'],
  workflows: [
    { id: 'wf-rapido', name: 'Mantenimiento rápido', steps: ['clean-safe', 'empty-trash', 'flush-dns'] },
  ],
  startMinimized: false,
  launchAtLogin: false,
  lastSmartCare: 0,
  totalFreed: 0,
  history: [],
  notifications: [],
  disabledStartup: {},
};

let data = null;
let file = null;

function load() {
  if (data) return data;
  file = path.join(app.getPath('userData'), 'configuracion.json');
  try { data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch { data = JSON.parse(JSON.stringify(DEFAULTS)); }
  data.alerts = { ...DEFAULTS.alerts, ...(data.alerts || {}) };
  return data;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) { console.error('No se pudo guardar la configuración', e); }
  }, 200);
}

function get(key) { load(); return key ? data[key] : data; }
function set(key, value) { load(); data[key] = value; save(); return data[key]; }
function patch(obj) { load(); Object.assign(data, obj); save(); return data; }

function isExcluded(p) {
  const ex = get('exclusions') || [];
  return ex.some(e => p === e || p.startsWith(e.endsWith(path.sep) ? e : e + path.sep));
}

let broadcaster = () => {};
function setBroadcaster(fn) { broadcaster = fn; }

function notify(title, body, { level = 'info', system = true, action = null } = {}) {
  load();
  const n = { id: Date.now() + Math.random().toString(36).slice(2, 6), title, body, level, action, at: Date.now(), read: false };
  data.notifications.unshift(n);
  data.notifications = data.notifications.slice(0, 200);
  save();
  broadcaster('notifications:new', n);
  if (system && Notification.isSupported()) {
    try { new Notification({ title: 'LimpiaPc-MX · ' + title, body, silent: level === 'info' }).show(); } catch {}
  }
  return n;
}

function addHistory(entry) {
  load();
  data.history.unshift({ at: Date.now(), ...entry });
  data.history = data.history.slice(0, 500);
  if (entry.freed) data.totalFreed = (data.totalFreed || 0) + entry.freed;
  save();
}

module.exports = { load, get, set, patch, save, isExcluded, notify, addHistory, setBroadcaster, DEFAULTS };
