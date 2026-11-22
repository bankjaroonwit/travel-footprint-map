'use strict';
/* Startup. */

async function backfillLocations() {
  if (!GEO.provinces.length && !GEO.countries.length) return;
  const fix = [];
  for (const p of S.pins) {
    if (p.country && (p.country !== 'TH' || p.province)) continue;
    const loc = locate(p.lat, p.lng);
    if (!loc.country) continue;
    if (loc.country !== p.country || (!p.province && loc.province)) {
      p.country = loc.country;
      if (!p.province) p.province = loc.province;
      fix.push(p);
    }
  }
  if (fix.length) await DB.putMany('pins', fix);
}

/* iOS Safari ignores user-scalable=no, so stop pinch gestures outside the map ourselves.
   (Gesture events only fire for pinches, so this doesn't slow down normal scrolling. Other browsers
   follow user-scalable=no and touch-action in the CSS.) */
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => {
  if (!e.target.closest || !e.target.closest('#map, .pd-map, #viewer')) e.preventDefault();
}, { passive: false }));

/* Swipe a sheet down to close it (phones and small tablets, where it is a bottom sheet).
   Only from the top of the sheet (grip, title bar, photo header). Those parts have touch-action: none
   in the CSS, so every listener here can be passive and normal scrolling is never held up. */
(function sheetSwipe() {
  const sheet = $('#sheet'), backdrop = $('#sheet-backdrop');
  let y0 = 0, x0 = 0, t0 = 0, st0 = 0, dy = 0, state = '';  // '' | 'wait' | 'drag' | 'scroll'
  const reset = () => {
    sheet.style.transition = ''; sheet.style.transform = '';
    backdrop.style.transition = ''; backdrop.style.opacity = '';
  };
  sheet.addEventListener('touchstart', e => {
    state = '';
    if (e.touches.length !== 1 || matchMedia('(min-width: 900px)').matches) return;
    if (!e.target.closest('.grip, .sheet-head, .pd-top')) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = Date.now(); st0 = sheet.scrollTop; dy = 0; state = 'wait';
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (!state) return;
    const ddy = e.touches[0].clientY - y0, ddx = e.touches[0].clientX - x0;
    if (state === 'wait') {
      if (Math.abs(ddy) < 6 && Math.abs(ddx) < 6) return;
      if (Math.abs(ddx) > Math.abs(ddy)) { state = ''; return; }
      state = ddy > 0 && st0 <= 0 ? 'drag' : 'scroll';
      if (state === 'drag') { sheet.style.transition = 'none'; backdrop.style.transition = 'none'; }
    }
    if (state === 'scroll') { sheet.scrollTop = st0 - ddy; return; }  // the handle itself can't scroll natively
    dy = Math.max(0, ddy);
    sheet.style.transform = `translate(-50%, ${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / (sheet.offsetHeight || 1)));
  }, { passive: true });
  const end = () => {
    const was = state;
    state = '';
    if (was !== 'drag') return;
    const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
    reset();
    if (dy > Math.min(140, sheet.offsetHeight * 0.25) || (fast && dy > 40)) closeSheet();
  };
  sheet.addEventListener('touchend', end, { passive: true });
  sheet.addEventListener('touchcancel', end, { passive: true });
})();

/* Launch animation: stays until the data is loaded, and at least long enough to finish playing. */
function hideSplash() {
  const sp = $('#splash');
  if (!sp || sp.classList.contains('out')) return;
  const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    sp.classList.add('out');
    setTimeout(() => sp.remove(), 600);
  }, Math.max(0, (quick ? 300 : 1650) - performance.now()));
}
setTimeout(hideSplash, 5000);  // never block the app if something goes wrong

(async function boot() {
  applyTheme();
  S.mode = Prefs.get('mode', 'th') === 'world' ? 'world' : 'th';
  S.stats = computeStats();
  initMap();
  try {
    await DB.open();
    S.pins = (await DB.all('pins')).map(normPin).filter(Boolean);
    S.trips = (await DB.all('trips')).map(normTrip).filter(Boolean);
    S.journal = (await DB.all('journal')).map(normJournal).filter(Boolean);
  } catch (e) {
    console.error(e);
    toast('เปิดที่เก็บข้อมูลไม่ได้ ลองปิดโหมดไม่ระบุตัวตน', 4000);
  }
  renderAll();
  hideSplash();
  if (!S.pins.length && !Prefs.get('welcomed', false)) showWelcome();

  await loadGeo();
  buildGeoLayers();
  await backfillLocations();
  renderAll();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) registerSW();
})();

/* Updates: check for a new version on open and whenever the app comes back to the foreground,
   then reload into it (or ask first if the user is in the middle of something). */
function registerSW() {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    const check = () => reg.update().catch(() => {});
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(err => console.warn('Service worker not registered', err));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (sheetOpen()) {
      toast('มีเวอร์ชันใหม่ ปิดหน้าต่างนี้แล้วแอพจะอัปเดตเอง', 4000);
      const wait = setInterval(() => { if (!sheetOpen()) { clearInterval(wait); reloading = true; location.reload(); } }, 1000);
      return;
    }
    reloading = true;
    location.reload();
  });
}
