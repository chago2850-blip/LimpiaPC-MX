// LimpiaPc-MX — Cuidado inteligente (escaneo integral) y acciones rápidas / flujos de trabajo
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const U = require('../core/util');
const store = require('../core/store');
const cleanup = require('./cleanup');
const protection = require('./protection');
const performance = require('./performance');
const apps = require('./apps');
const clutter = require('./clutter');

async function scan(onProgress = () => {}) {
  const res = {};
  onProgress({ phase: 'cleanup', step: 'Buscando basura del sistema…', pct: 5 });
  res.cleanup = await cleanup.scan(p => onProgress({ phase: 'cleanup', step: p.step, pct: 5 + p.pct * 0.3 }), { onlySafe: true });
  onProgress({ phase: 'protection', step: 'Buscando amenazas…', pct: 38 });
  res.protection = await protection.scanMalware('quick', p => onProgress({ phase: 'protection', step: p.step, pct: 50 }));
  onProgress({ phase: 'performance', step: 'Revisando rendimiento…', pct: 65 });
  const tasks = (await performance.tasksWithStatus()).filter(t => t.recommended && t.available);
  const startup = await performance.listStartup().catch(() => []);
  res.performance = { tasks, startupCount: startup.filter(s => s.enabled).length };
  onProgress({ phase: 'apps', step: 'Buscando actualizaciones…', pct: 75 });
  res.apps = await apps.checkUpdates().catch(() => ({ updates: [], managers: [] }));
  onProgress({ phase: 'clutter', step: 'Revisando tu desorden…', pct: 88 });
  const dl = await clutter.downloads({ olderThanDays: 30 });
  res.clutter = { downloadsOld: dl.filter(d => d.old), bytes: dl.filter(d => d.old).reduce((a, b) => a + b.bytes, 0) };
  onProgress({ phase: 'done', step: 'Listo', pct: 100 });
  res.junkBytes = res.cleanup.reduce((a, c) => a + c.bytes, 0);
  return res;
}

async function run(plan, onProgress = () => {}) {
  const out = { freed: 0, quarantined: 0, tasks: [] };
  if (plan.cleanup && plan.cleanup.length) {
    const sel = {}; for (const id of plan.cleanup) sel[id] = true;
    const r = await cleanup.clean(sel, p => onProgress({ phase: 'cleanup', step: p.step, pct: p.pct * 0.5 }));
    out.freed += r.freed;
  }
  if (plan.threats && plan.threats.length) {
    onProgress({ phase: 'protection', step: 'Moviendo amenazas a cuarentena…', pct: 55 });
    const r = await protection.quarantine(plan.threats); out.quarantined = r.ok;
  }
  if (plan.tasks && plan.tasks.length) {
    const all = (await performance.tasksWithStatus()).filter(t => plan.tasks.includes(t.id) && t.available);
    const admin = all.filter(t => t.admin && t.cmd);
    for (const t of all.filter(t => !t.admin)) {
      onProgress({ phase: 'performance', step: t.name, pct: 70 });
      const r = await performance.runTask(t.id); out.tasks.push({ id: t.id, ok: r.ok });
    }
    if (admin.length) {
      onProgress({ phase: 'performance', step: 'Tareas con permisos de administrador…', pct: 85 });
      const r = await U.runAdmin(admin.map(t => t.cmd).join(U.IS_WIN ? ' & ' : '; '));
      admin.forEach(t => out.tasks.push({ id: t.id, ok: r.ok }));
    }
  }
  store.set('lastSmartCare', Date.now());
  store.addHistory({ type: 'cuidado inteligente', detail: `Liberado ${U.fmtBytes(out.freed)}, ${out.quarantined} amenazas, ${out.tasks.length} tareas` });
  store.notify('Cuidado inteligente completado', `Se liberaron ${U.fmtBytes(out.freed)} y se ejecutaron ${out.tasks.length} tareas de mantenimiento.`, { level: 'success', system: false });
  onProgress({ phase: 'done', step: 'Listo', pct: 100 });
  return out;
}

// ---------------- Acciones rápidas (bandeja y flujos de trabajo) ----------------
const QUICK = {
  'clean-safe': { name: 'Limpiar basura segura', desc: 'Borra cachés, registros, informes de fallos y temporales que el sistema regenera solo. No toca tus archivos ni la papelera.', fn: async () => { const s = await cleanup.scan(() => {}, { onlySafe: true }); const sel = {}; s.filter(c => c.id !== 'trash').forEach(c => { if (c.bytes) sel[c.id] = true; }); return cleanup.clean(sel); } },
  'empty-trash': { name: 'Vaciar papelera', desc: 'Elimina definitivamente todo lo que está en la papelera de reciclaje.', fn: () => cleanup.clean({ trash: true }) },
  'browser-cache': { name: 'Limpiar cachés de navegadores', desc: 'Borra la caché de Chrome, Edge, Firefox, Brave, Safari y Opera. No borra historial, contraseñas ni sesiones.', fn: () => cleanup.clean({ browsers: true }) },
  'dev-cache': { name: 'Limpiar cachés de desarrollo', desc: 'Vacía las cachés de npm, pip, Yarn, Gradle, Go, Cargo y NuGet. Se vuelven a descargar cuando se necesitan.', fn: () => cleanup.clean({ dev: true }) },
  'quick-scan': { name: 'Análisis rápido de malware', desc: 'Revisa elementos de inicio, Descargas y temporales en busca de malware y adware.', fn: () => protection.scanMalware('quick') },
};
async function quickActions() {
  const list = Object.entries(QUICK).map(([id, q]) => ({ id, name: q.name, desc: q.desc, available: true }));
  for (const t of await performance.tasksWithStatus()) list.push({ id: t.id, name: t.name, desc: t.desc, admin: t.admin, available: t.available, unavailableReason: t.unavailableReason });
  return list;
}
async function runQuick(id) {
  if (QUICK[id]) return QUICK[id].fn();
  return performance.runTask(id);
}
async function runWorkflow(wfId, onProgress = () => {}) {
  const wf = (store.get('workflows') || []).find(w => w.id === wfId);
  if (!wf) return { ok: false };
  const results = [];
  let i = 0;
  for (const step of wf.steps) {
    onProgress({ step, pct: Math.round(i++ / wf.steps.length * 100) });
    try { const r = await runQuick(step); results.push({ step, ok: r && r.ok !== false, freed: r && r.freed }); }
    catch (e) { results.push({ step, ok: false, error: e.message }); }
  }
  const freed = results.reduce((a, r) => a + (r.freed || 0), 0);
  store.notify('Flujo completado', `${wf.name}: ${results.filter(r => r.ok).length}/${results.length} pasos correctos${freed ? ', ' + U.fmtBytes(freed) + ' liberados' : ''}.`, { level: 'success', system: false });
  return { ok: true, results, freed };
}

module.exports = { scan, run, quickActions, runQuick, runWorkflow };
