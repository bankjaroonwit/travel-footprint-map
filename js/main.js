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

/* iOS Safari ignores user-scalable=no, so stop pinch gestures outside the map ourselves. */
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => {
  if (!e.target.closest || !e.target.closest('#map, .pd-map')) e.preventDefault();
}, { passive: false }));
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1 && !e.target.closest('#map, .pd-map')) e.preventDefault();
}, { passive: false });

/* Swipe a sheet down to close it (phones and small tablets, where it is a bottom sheet).
   Only from the top of the sheet (grip, title bar, photo header) while it is scrolled to the top,
   so touches on the content always scroll normally. */
(function sheetSwipe() {
  const sheet = $('#sheet'), backdrop = $('#sheet-backdrop');
  let y0 = 0, x0 = 0, t0 = 0, dy = 0, state = '';  // '' | 'wait' | 'drag' | 'off'
  const reset = () => {
    sheet.style.transition = ''; sheet.style.transform = '';
    backdrop.style.transition = ''; backdrop.style.opacity = '';
  };
  sheet.addEventListener('touchstart', e => {
    state = 'off';
    if (e.touches.length !== 1 || matchMedia('(min-width: 900px)').matches) return;
    if (e.target.closest('textarea, select, input[type="range"], .pd-map')) return;
    if (sheet.scrollTop > 0) return;
    const y = e.touches[0].clientY;
    const inHandle = e.target.closest('.grip, .sheet-head, .pd-top') || y - sheet.getBoundingClientRect().top < 56;
    if (!inHandle) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = Date.now(); dy = 0; state = 'wait';
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (state === 'off' || state === '') return;
    const ddy = e.touches[0].clientY - y0, ddx = e.touches[0].clientX - x0;
    if (state === 'wait') {
      if (Math.abs(ddy) < 8 && Math.abs(ddx) < 8) return;
      if (ddy <= 0 || Math.abs(ddx) > Math.abs(ddy) || sheet.scrollTop > 0) { state = 'off'; return; }
      state = 'drag';
      sheet.style.transition = 'none'; backdrop.style.transition = 'none';
    }
    e.preventDefault();
    dy = Math.max(0, ddy);
    sheet.style.transform = `translate(-50%, ${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / (sheet.offsetHeight || 1)));
  }, { passive: false });
  const end = () => {
    if (state !== 'drag') { state = ''; return; }
    state = '';
    const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
    if (dy > Math.min(140, sheet.offsetHeight * 0.25) || (fast && dy > 40)) {
      reset();
      closeSheet();
    } else {
      reset();
    }
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
})();

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
