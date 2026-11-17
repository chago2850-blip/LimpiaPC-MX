// LimpiaPc-MX — modo limpieza de pantalla  ·  SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
(function () {
  const msg = document.getElementById('msg'), hold = document.getElementById('hold'), bar = document.getElementById('bar');
  setTimeout(() => { msg.style.opacity = 0; }, 3500);
  let start = 0, raf = 0;
  const block = e => { e.preventDefault(); e.stopPropagation(); return false; };
  ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove', 'keypress'].forEach(t => window.addEventListener(t, block, { capture: true, passive: false }));
  function loop() {
    const p = Math.min(1, (Date.now() - start) / 3000);
    bar.style.width = (p * 100) + '%';
    if (p >= 1) return lpc.call('screen.stop');
    raf = requestAnimationFrame(loop);
  }
  window.addEventListener('keydown', e => {
    e.preventDefault();
    if (e.key === 'Escape' && !start) { start = Date.now(); hold.style.opacity = 1; msg.style.opacity = 1; loop(); }
  }, true);
  window.addEventListener('keyup', e => {
    e.preventDefault();
    if (e.key === 'Escape') { start = 0; cancelAnimationFrame(raf); bar.style.width = 0; hold.style.opacity = 0; setTimeout(() => { if (!start) msg.style.opacity = 0; }, 1500); }
  }, true);
})();
