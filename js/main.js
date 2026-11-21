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

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker not registered', err));
  }
})();
