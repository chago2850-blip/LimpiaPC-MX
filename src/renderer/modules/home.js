// LimpiaPc-MX — Panel de salud  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
window.Views = window.Views || {};
(function () {
  const { ICONS, $, esc, fmtBytes, fmtDur, fmtAgo, ring } = UI;
  const hist = { cpu: [], ram: [], rx: [], tx: [] };
  let el;

  function gauge(pct, label, color) {
    return `<div class="gauge">${ring(pct, color || 'url(#g)', 140, 12)}<div class="val"><div>${Math.round(pct)}<small>${label}</small></div></div></div>`;
  }
  function spark(arr, max) {
    const n = 40, a = arr.slice(-n); const m = max || Math.max(1, ...a);
    return `<div class="chart-bars">${Array.from({ length: n }, (_, i) => { const v = a[i - (n - a.length)]; return `<i style="height:${v === undefined ? 0 : Math.max(3, v / m * 100)}%;${v === undefined ? 'opacity:.1' : ''}"></i>`; }).join('')}</div>`;
  }

  Views.home = {
    async render(view) {
      el = view;
      const [info, s, hstr] = await Promise.all([lpc.call('health.info'), App.lastHealth || lpc.call('health.snapshot'), lpc.call('history.list')]);
      el.innerHTML = `
        <h1>Panel de salud</h1><p class="lead">Un vistazo en tiempo real al estado de tu ${esc(info.model || 'computadora')}.</p>
        <div class="card health-hero" id="hh"></div>
        <div class="grid g4" style="margin-top:16px" id="tiles"></div>
        <div class="grid g2" style="margin-top:16px">
          <div class="card"><h2>Tu equipo</h2><div class="kv sel-text">
            <span>Sistema</span><span>${esc(info.os)} (${esc(info.arch)})</span>
            <span>Equipo</span><span>${esc(info.model || info.hostname)}</span>
            <span>Procesador</span><span>${esc(info.cpu)} · ${info.physicalCores} núcleos / ${info.cores} hilos</span>
            <span>Gráficos</span><span>${esc(info.gpu || '—')}</span>
            <span>Núcleo</span><span>${esc(info.kernel)}</span>
          </div><div id="disks" style="margin-top:14px"></div></div>
          <div class="card"><h2>Actividad reciente</h2>
            <div class="row" style="margin-bottom:10px"><div><div class="stat-big">${fmtBytes(hstr.totalFreed)}</div><div class="muted small">liberados en total con LimpiaPc-MX</div></div></div>
            <div class="list">${(hstr.history || []).slice(0, 6).map(x => `<div class="item"><div class="thumb">${ICONS.history}</div><div class="t"><b>${esc(x.type[0].toUpperCase() + x.type.slice(1))}</b><span>${esc(x.detail || '')}</span></div><div class="v small">${fmtAgo(x.at)}</div></div>`).join('') || '<div class="muted small">Aún no hay actividad. ¡Comienza con un Cuidado inteligente!</div>'}</div>
          </div>
        </div>`;
      this.tick(s);
    },
    tick(s) {
      if (!el || App.current !== 'home' || !$('#hh', el)) return;
      hist.cpu.push(s.cpu.load); hist.ram.push(s.mem.pct); hist.rx.push(s.net.rx); hist.tx.push(s.net.tx);
      for (const k in hist) if (hist[k].length > 60) hist[k].shift();
      const sc = s.score;
      const col = sc.value >= 85 ? '#34d399' : sc.value >= 70 ? '#22d3ee' : sc.value >= 50 ? '#fbbf24' : '#fb7185';
      $('#hh', el).innerHTML = `${gauge(sc.value, 'de 100', col)}
        <div><div class="muted small">Estado general</div><h1 style="color:${col}">${esc(sc.label)}</h1>
        <div class="muted">${sc.reasons.length ? sc.reasons.map(esc).join(' · ') : 'Todo marcha bien. Tu equipo está en excelente forma.'}</div></div>
        <button class="btn primary big" data-go="smartcare">${ICONS.smartcare} Cuidado inteligente</button>`;
      const b = s.battery;
      $('#tiles', el).innerHTML = `
        <div class="card" style="--c:#a78bfa"><div class="row"><div class="ico" style="margin:0">${ICONS.cpu}</div><div><div class="muted small">Procesador</div><div class="stat-big">${Math.round(s.cpu.load)}%</div></div></div><div style="margin-top:12px">${spark(hist.cpu, 100)}</div></div>
        <div class="card" style="--c:#22d3ee"><div class="row"><div class="ico" style="margin:0">${ICONS.ram}</div><div><div class="muted small">Memoria</div><div class="stat-big">${fmtBytes(s.mem.used)}</div></div></div><div class="muted small" style="margin-top:8px">de ${fmtBytes(s.mem.total)} · ${Math.round(s.mem.pct)}%</div><div class="progress" style="margin-top:8px"><i style="width:${s.mem.pct}%"></i></div><button class="btn sm ghost" style="margin-top:10px" id="free-ram">Liberar RAM</button></div>
        <div class="card" style="--c:#34d399"><div class="row"><div class="ico" style="margin:0">${ICONS.disk}</div><div><div class="muted small">Disco ${esc(s.disk.mount)}</div><div class="stat-big">${fmtBytes(s.disk.free)}</div></div></div><div class="muted small" style="margin-top:8px">libres de ${fmtBytes(s.disk.total)}</div><div class="progress" style="margin-top:8px"><i style="width:${s.disk.pct}%"></i></div><button class="btn sm ghost" style="margin-top:10px" data-go="spacelens">Ver espacio</button></div>
        <div class="card" style="--c:#fbbf24">${b ? `<div class="row"><div class="ico" style="margin:0">${ICONS.battery}</div><div><div class="muted small">Batería ${b.charging ? '· cargando' : ''}</div><div class="stat-big">${Math.round(b.percent)}%</div></div></div><div class="muted small" style="margin-top:8px">Salud: ${b.health ? b.health + '%' : '—'} · Ciclos: ${b.cycles || '—'}</div>`
          : `<div class="row"><div class="ico" style="margin:0">${ICONS.temp}</div><div><div class="muted small">Temperatura CPU</div><div class="stat-big">${s.temp ? Math.round(s.temp) + ' °C' : '—'}</div></div></div>`}
          <div class="muted small" style="margin-top:8px">Encendido: ${fmtDur(s.uptime)}</div>
          <div class="muted small" style="margin-top:4px">Red ↓ ${fmtBytes(s.net.rx)}/s · ↑ ${fmtBytes(s.net.tx)}/s</div>${b && s.temp ? `<div class="muted small" style="margin-top:4px">CPU: ${Math.round(s.temp)} °C</div>` : ''}</div>`;
      $('#free-ram', el).onclick = async e => { e.target.disabled = true; e.target.textContent = 'Liberando…'; const r = await lpc.call('quick.run', 'free-ram'); UI.toast('Memoria', r && r.ok ? 'Memoria liberada correctamente.' : 'No se pudo liberar la memoria.', r && r.ok ? 'success' : 'warning'); };
      $('#disks', el).innerHTML = s.disks.map(d => `<div style="margin-top:8px"><div class="row small"><span>${esc(d.mount)}</span><span class="spacer"></span><span class="muted">${fmtBytes(d.used)} de ${fmtBytes(d.total)}</span></div><div class="progress" style="margin-top:4px"><i style="width:${d.pct}%"></i></div></div>`).join('');
    },
  };
})();
