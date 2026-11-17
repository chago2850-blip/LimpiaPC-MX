// LimpiaPc-MX — prueba automática de los módulos principales (se ejecuta con Electron)
// Uso: npx electron scripts/selftest.js
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.whenReady().then(async () => {
  const M = p => require(path.join(__dirname, '..', 'src', 'main', p));
  const U = M('core/util'), store = M('core/store');
  store.load();
  const results = [];
  const t = async (name, fn) => {
    const t0 = Date.now();
    try { const r = await fn(); results.push(['OK ', name, Date.now() - t0 + 'ms', r]); }
    catch (e) { results.push(['ERR', name, Date.now() - t0 + 'ms', e.stack]); }
  };
  // Preparar datos de prueba
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-test-'));
  const big = Buffer.alloc(300 * 1024, 7);
  fs.writeFileSync(path.join(tmp, 'a.bin'), big); fs.writeFileSync(path.join(tmp, 'copia de a.bin'), big);
  const eicar = Buffer.from('KkgrSCQhRUxJRi1UU0VULVNVUklWSVROQS1EUkFETkFUUy1SQUNJRSR9NylDQzcpXlAoNDVYWlBcNFtQQUAlUCFPNVg=', 'base64').toString('latin1').split('').reverse().join('');
  fs.writeFileSync(path.join(tmp, 'factura.pdf.exe'), 'MZ fake');
  fs.writeFileSync(path.join(tmp, 'eicar.com'), eicar);

  await t('salud', async () => { const h = M('modules/health'); const s = await h.snapshot(); const i = await h.info(); return `${i.os} · CPU ${s.cpu.load}% · RAM ${s.mem.pct}% · disco ${s.disk.pct}% · salud ${s.score.value}`; });
  await t('limpieza.scan', async () => { const r = await M('modules/cleanup').scan(); return r.map(c => `${c.id}:${U.fmtBytes(c.bytes)}`).join(', '); });
  await t('protección.inspect', async () => { const p = M('modules/protection'); const out = []; for (const f of fs.readdirSync(tmp)) { const full = path.join(tmp, f); const r = await p.inspectFile(full, fs.statSync(full)); if (r.length) out.push(f + ' → ' + r.join('; ')); } if (out.length < 2) throw new Error('No detectó las muestras: ' + out); return out.join(' | '); });
  await t('protección.privacidad', async () => (await M('modules/protection').scanPrivacy()).map(b => b.browser).join(', ') || 'sin navegadores');
  await t('rendimiento.inicio', async () => (await M('modules/performance').listStartup()).length + ' elementos');
  await t('rendimiento.tareas', async () => M('modules/performance').tasks().map(x => x.id).join(','));
  await t('rendimiento.procesos', async () => (await M('modules/performance').heavyProcesses()).byMem.slice(0, 3).map(p => p.name).join(', '));
  await t('apps.list', async () => { const a = await M('modules/apps').listApps(); return a.length + ' apps · ej: ' + a.slice(0, 3).map(x => x.name + ' [' + x.source + ']').join(', '); });
  await t('apps.updates', async () => { const r = await M('modules/apps').checkUpdates(); return r.managers.join(',') + ' · ' + r.updates.length + ' actualizaciones'; });
  await t('apps.extensions', async () => (await M('modules/apps').listExtensions()).length + ' extensiones');
  await t('desorden.duplicados', async () => { const r = await M('modules/clutter').duplicates({ roots: [tmp], minKB: 100 }); if (!r.groups.length) throw new Error('sin duplicados'); return r.groups.length + ' grupo(s), ' + U.fmtBytes(r.groups[0].wasted); });
  await t('desorden.grandes', async () => { const r = await M('modules/clutter').largeOld({ roots: [tmp], minMB: 0.2, oldDays: 365 }); return r.files.length + ' archivos'; });
  await t('lente', async () => { const r = await M('modules/storage').lens(tmp, { depth: 2 }); return r.tree.name + ' ' + U.fmtBytes(r.tree.size) + ' · ' + r.tree.children.length + ' hijos'; });
  await t('nube', async () => (await M('modules/storage').cloudFolders()).map(f => f.name).join(', ') || 'ninguna');
  await t('triturador', async () => { const f = path.join(tmp, 'secreto.txt'); fs.writeFileSync(f, 'contraseña: 1234'.repeat(500)); const r = await M('modules/storage').shred([f], { passes: 3 }); if (fs.existsSync(f)) throw new Error('sigue existiendo'); return U.fmtBytes(r.freed); });
  await t('cuarentena', async () => { const p = M('modules/protection'); const r = await p.quarantine([path.join(tmp, 'eicar.com')]); const l = await p.listQuarantine(); await p.quarantineAction(l[l.length - 1].id, 'delete'); return r.ok + ' movidos, luego eliminados'; });
  await t('cuidado-inteligente.acciones', async () => M('modules/smartcare').quickActions().length + ' acciones');

  fs.rmSync(tmp, { recursive: true, force: true });
  let fails = 0;
  for (const [s, n, ms, r] of results) { if (s === 'ERR') fails++; console.log(`${s} ${n.padEnd(28)} ${ms.padStart(7)}  ${String(r).slice(0, 300)}`); }
  console.log(fails ? `\n${fails} pruebas fallaron` : '\nTodas las pruebas pasaron ✔');
  app.exit(fails ? 1 : 0);
});
