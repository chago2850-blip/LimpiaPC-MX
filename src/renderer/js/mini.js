// LimpiaPc-MX — panel rápido de la bandeja  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
(function () {
  const { $, esc, fmtBytes } = UI;
  lpc.on('health:tick', s => {
    $('#cpu').textContent = Math.round(s.cpu.load) + '%'; $('#cpub').style.width = s.cpu.load + '%';
    $('#ram').textContent = Math.round(s.mem.pct) + '%'; $('#ramb').style.width = s.mem.pct + '%';
    $('#disk').textContent = fmtBytes(s.disk.free); $('#diskb').style.width = s.disk.pct + '%';
    $('#net').textContent = `↓ ${fmtBytes(s.net.rx)}/s  ↑ ${fmtBytes(s.net.tx)}/s`;
    $('#extra').textContent = s.battery ? `Batería ${Math.round(s.battery.percent)}%${s.battery.charging ? ' · cargando' : ''}` : (s.temp ? `CPU ${Math.round(s.temp)} °C` : '');
    $('#score').textContent = `Salud ${s.score.value}`;
  });
  async function procs() {
    if (document.hidden) return;
    const p = await lpc.call('performance.processes');
    $('#procs').innerHTML = p.byMem.slice(0, 6).map(x => `<div class="p"><span>${esc(x.name)}</span><span>${fmtBytes(x.mem)}</span></div>`).join('');
  }
  procs(); setInterval(procs, 5000);
  document.addEventListener('visibilitychange', procs);
  $('#ram-free').onclick = async e => { e.target.textContent = 'Liberando…'; const r = await lpc.call('quick.run', 'free-ram'); e.target.textContent = r && r.ok ? '¡Listo!' : 'No se pudo'; setTimeout(() => e.target.textContent = 'Liberar RAM', 2500); };
  $('#trash').onclick = async e => { e.target.textContent = 'Vaciando…'; const r = await lpc.call('quick.run', 'empty-trash'); e.target.textContent = fmtBytes(r.freed || 0) + ' libres'; setTimeout(() => e.target.textContent = 'Vaciar papelera', 2500); };
  $('#screen').onclick = () => { lpc.call('window.hideMini'); lpc.call('screen.clean'); };
  $('#open').onclick = () => lpc.call('window.showMain');
})();
