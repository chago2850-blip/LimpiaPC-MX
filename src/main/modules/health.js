// LimpiaPc-MX — Salud del equipo: CPU, memoria, discos, batería, temperatura y red
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const si = require('systeminformation');
const U = require('../core/util');
const store = require('../core/store');

let staticInfo = null;
async function info() {
  if (staticInfo) return staticInfo;
  const [osi, cpu, sys, gfx, mem] = await Promise.all([si.osInfo(), si.cpu(), si.system(), si.graphics().catch(() => ({ controllers: [] })), si.memLayout().catch(() => [])]);
  staticInfo = {
    os: `${osi.distro} ${osi.release}`.trim(), arch: osi.arch, hostname: osi.hostname, kernel: osi.kernel,
    model: [sys.manufacturer, sys.model].filter(Boolean).join(' '),
    cpu: `${cpu.manufacturer} ${cpu.brand}`.trim(), cores: cpu.cores, physicalCores: cpu.physicalCores, speed: cpu.speed,
    gpu: (gfx.controllers || []).map(g => g.model).filter(Boolean).join(', '),
    memModules: mem.length,
  };
  return staticInfo;
}

async function snapshot() {
  const [load, mem, fsz, bat, temp, net, time] = await Promise.all([
    si.currentLoad(), si.mem(), si.fsSize(), si.battery().catch(() => ({})), si.cpuTemperature().catch(() => ({})), si.networkStats().catch(() => []), si.time(),
  ]);
  const disks = fsz.filter(v => v.size > 2e9 && !/^\/(boot|snap|run|dev)|\/System\/Volumes\/(VM|Preboot|Update|xarts|iSCPreboot|Hardware)/.test(v.mount));
  const main = disks.find(d => d.mount === '/' || /^C:/i.test(d.mount) || d.mount === '/System/Volumes/Data') || disks[0] || { size: 1, used: 0 };
  const rx = net.reduce((a, n) => a + (n.rx_sec > 0 ? n.rx_sec : 0), 0);
  const tx = net.reduce((a, n) => a + (n.tx_sec > 0 ? n.tx_sec : 0), 0);
  const memUsed = mem.active ?? (mem.total - mem.available);
  const battery = bat && bat.hasBattery ? {
    percent: bat.percent, charging: bat.isCharging, cycles: bat.cycleCount, timeRemaining: bat.timeRemaining,
    health: bat.maxCapacity && bat.designedCapacity ? Math.min(100, Math.round(bat.maxCapacity / bat.designedCapacity * 100)) : null,
  } : null;
  const snap = {
    at: Date.now(),
    cpu: { load: +load.currentLoad.toFixed(1), cores: load.cpus.map(c => +c.load.toFixed(0)) },
    mem: { total: mem.total, used: memUsed, free: mem.available, swapUsed: mem.swapused, swapTotal: mem.swaptotal, pct: +(memUsed / mem.total * 100).toFixed(1) },
    disk: { mount: main.mount, total: main.size, used: main.used, free: main.size - main.used, pct: +(main.used / main.size * 100).toFixed(1) },
    disks: disks.map(d => ({ mount: d.mount, total: d.size, used: d.used, pct: +(d.used / d.size * 100).toFixed(1) })),
    battery, temp: temp.main || null, uptime: time.uptime,
    net: { rx, tx },
  };
  snap.score = score(snap);
  return snap;
}

function score(s) {
  let sc = 100;
  const reasons = [];
  if (s.disk.pct > 90) { sc -= 25; reasons.push('Disco casi lleno'); } else if (s.disk.pct > 80) { sc -= 10; reasons.push('Poco espacio libre'); }
  if (s.mem.pct > 90) { sc -= 15; reasons.push('Memoria saturada'); } else if (s.mem.pct > 80) { sc -= 6; }
  if (s.cpu.load > 85) { sc -= 10; reasons.push('Procesador muy ocupado'); }
  if (s.temp && s.temp > 90) { sc -= 15; reasons.push('Temperatura alta'); }
  if (s.battery && s.battery.health && s.battery.health < 80) { sc -= 10; reasons.push('Batería desgastada'); }
  if (s.uptime > 14 * 86400) { sc -= 5; reasons.push('Sin reiniciar en más de 2 semanas'); }
  const days = (Date.now() - (store.get('lastSmartCare') || 0)) / 86400000;
  if (days > (store.get('smartCareReminderDays') || 7)) { sc -= 8; reasons.push('Mantenimiento pendiente'); }
  sc = Math.max(0, Math.round(sc));
  return { value: sc, label: sc >= 85 ? 'Excelente' : sc >= 70 ? 'Buena' : sc >= 50 ? 'Regular' : 'Requiere atención', reasons };
}

// --------- Monitor con alertas ---------
let timer = null;
const lastAlert = {};
function alertOnce(key, title, body, level, hours = 6) {
  if (lastAlert[key] && Date.now() - lastAlert[key] < hours * 3600000) return;
  lastAlert[key] = Date.now();
  store.notify(title, body, { level });
}

function startMonitor(onTick) {
  stopMonitor();
  const tick = async () => {
    try {
      const s = await snapshot();
      onTick && onTick(s);
      const a = store.get('alerts');
      if (100 - s.disk.pct < a.diskLowPercent) alertOnce('disk', 'Poco espacio en disco', `Solo queda ${U.fmtBytes(s.disk.free)} libre en ${s.disk.mount}.`, 'warning');
      if (s.mem.pct > a.ramHighPercent) alertOnce('ram', 'Memoria muy ocupada', `La RAM está al ${s.mem.pct}%. Libera memoria o cierra apps pesadas.`, 'warning', 1);
      if (s.temp && s.temp > a.tempHighC) alertOnce('temp', 'Temperatura alta', `El procesador está a ${Math.round(s.temp)} °C.`, 'danger', 1);
      if (s.battery && s.battery.health && s.battery.health < a.batteryHealthLow) alertOnce('bat', 'Salud de batería baja', `La batería conserva el ${s.battery.health}% de su capacidad original.`, 'info', 24 * 7);
      const days = (Date.now() - (store.get('lastSmartCare') || 0)) / 86400000;
      if (store.get('lastSmartCare') && days > (store.get('smartCareReminderDays') || 7)) alertOnce('care', 'Es hora de un Cuidado inteligente', `Han pasado ${Math.floor(days)} días desde el último mantenimiento.`, 'info', 24);
    } catch (e) { /* ignorar */ }
  };
  tick();
  timer = setInterval(tick, 3000);
}
function stopMonitor() { if (timer) clearInterval(timer); timer = null; }

module.exports = { info, snapshot, startMonitor, stopMonitor };
