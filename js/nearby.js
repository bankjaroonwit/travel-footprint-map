'use strict';
/* "What was this place?": names of places near a pin's coordinates, from OpenStreetMap data.
   Photon gives nearby attractions, temples, cafés, beaches… (Overpass as a backup); Nominatim
   reverse gives the area name. Tapping a suggestion fills the pin's name. */

const NEAR_CACHE = new Map();

function guessCategory(t) {
  const am = t.amenity, to = t.tourism, le = t.leisure, na = t.natural, sh = t.shop;
  if (t.place === 'island' || t.place === 'islet' || na === 'island') return 'island';
  if (na === 'beach' || na === 'bay' || le === 'beach_resort') return 'beach';
  if (t.waterway === 'waterfall') return 'waterfall';
  if (na === 'peak' || na === 'volcano' || na === 'ridge') return 'mountain';
  if (to === 'viewpoint') return 'viewpoint';
  if (to === 'camp_site' || to === 'caravan_site') return 'camping';
  if (am === 'place_of_worship' || t.historic) return 'temple';
  if (to === 'museum' || to === 'gallery' || to === 'artwork' || am === 'arts_centre') return 'museum';
  if (to === 'theme_park' || to === 'zoo' || to === 'aquarium' || le === 'water_park') return 'themepark';
  if (am === 'cafe' || sh === 'coffee' || sh === 'bakery') return 'cafe';
  if (am === 'restaurant' || am === 'food_court' || am === 'fast_food') return 'food';
  if (am === 'marketplace') return 'market';
  if (am === 'bar' || am === 'pub' || am === 'nightclub') return 'nightlife';
  if (sh) return 'shopping';
  if (['hotel', 'resort', 'guest_house', 'hostel', 'motel'].includes(to)) return 'stay';
  if (na || le === 'park' || le === 'garden' || le === 'nature_reserve' || t.boundary === 'national_park') return 'nature';
  return '';
}
function kindLabel(t) {
  if (t.amenity === 'place_of_worship') return 'ศาสนสถาน';
  if (t.amenity === 'cafe') return 'คาเฟ่';
  if (t.amenity === 'restaurant') return 'ร้านอาหาร';
  if (t.amenity === 'marketplace') return 'ตลาด';
  if (t.amenity === 'bar' || t.amenity === 'pub' || t.amenity === 'nightclub') return 'บาร์';
  if (t.shop === 'mall' || t.shop === 'department_store') return 'ห้าง';
  if (t.tourism === 'theme_park' || t.tourism === 'zoo' || t.tourism === 'aquarium') return 'สวนสนุก/สวนสัตว์';
  if (t.tourism === 'camp_site') return 'ลานกางเต็นท์';
  if (t.tourism === 'museum') return 'พิพิธภัณฑ์';
  if (t.tourism === 'viewpoint') return 'จุดชมวิว';
  if (t.tourism === 'hotel' || t.tourism === 'resort' || t.tourism === 'guest_house') return 'ที่พัก';
  if (t.tourism) return 'สถานที่ท่องเที่ยว';
  if (t.historic) return 'โบราณสถาน';
  if (t.natural === 'beach') return 'ชายหาด';
  if (t.place === 'island' || t.natural === 'island') return 'เกาะ';
  if (t.natural === 'peak') return 'ยอดเขา';
  if (t.waterway === 'waterfall') return 'น้ำตก';
  if (t.leisure === 'park' || t.leisure === 'garden') return 'สวน';
  if (t.boundary === 'national_park' || t.leisure === 'nature_reserve') return 'อุทยาน';
  if (t.natural) return 'ธรรมชาติ';
  return 'สถานที่';
}
// Higher = more likely to be "the place I went to".
function placeScore(t) {
  if (t.tourism === 'attraction' || t.tourism === 'viewpoint' || t.tourism === 'museum') return 5;
  if (t.historic || t.amenity === 'place_of_worship' || t.natural === 'beach' || t.natural === 'peak' || t.waterway === 'waterfall') return 5;
  if (t.boundary === 'national_park' || t.leisure === 'nature_reserve' || t.leisure === 'park' || t.place === 'island' || t.tourism === 'theme_park' || t.tourism === 'zoo' || t.shop === 'mall') return 4;
  if (t.amenity === 'cafe' || t.amenity === 'restaurant' || t.amenity === 'marketplace' || t.tourism === 'camp_site') return 3;
  if (t.tourism) return 2;
  return 1;
}

function overpassQuery(lat, lng, r) {
  const a = `(around:${r},${lat.toFixed(6)},${lng.toFixed(6)})["name"]`;
  return `[out:json][timeout:12];(
    nwr${a}["tourism"~"attraction|viewpoint|museum|theme_park|zoo|aquarium|gallery|artwork|camp_site|hotel|resort|guest_house|hostel"];
    nwr${a}["historic"];
    nwr${a}["amenity"~"place_of_worship|restaurant|cafe|marketplace|food_court|bar|pub|arts_centre"];
    nwr${a}["natural"~"beach|peak|bay|cave_entrance|volcano|spring"];
    nwr${a}["waterway"="waterfall"];
    nwr${a}["leisure"~"park|garden|nature_reserve|beach_resort"];
    nwr${a}["boundary"="national_park"];
  );out center tags 60;`;
}

const SKIP_KEYS = new Set(['highway', 'railway', 'building', 'landuse', 'power', 'barrier', 'office', 'emergency', 'public_transport', 'man_made']);

// Photon (komoot): fast reverse lookup that returns many nearby named places.
async function photonNearby(lat, lng, radiusKm, limit) {
  const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=${limit}&radius=${radiusKm}&lang=default`);
  if (!r.ok) throw new Error('photon ' + r.status);
  return ((await r.json()).features || []).map(f => {
    const pr = f.properties || {};
    if (!pr.name || SKIP_KEYS.has(pr.osm_key)) return null;
    if (pr.osm_key === 'place' && !/island|islet/.test(pr.osm_value)) return null;
    return { name: pr.name, tags: { [pr.osm_key]: pr.osm_value, ...(pr.osm_value === 'island' ? { natural: 'island' } : {}) },
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
  }).filter(Boolean);
}
// Overpass: richer, but often busy, so only used as a backup with a short time limit.
async function overpassNearby(lat, lng, r) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(overpassQuery(lat, lng, r)), signal: ctl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error('overpass ' + res.status);
    return ((await res.json()).elements || []).map(e => {
      const t = e.tags || {}, ll = e.center || e;
      return { name: t['name:th'] || t.name, tags: t, lat: ll.lat, lng: ll.lon };
    });
  } finally { clearTimeout(timer); }
}

async function fetchNearby(lat, lng) {
  const key = lat.toFixed(4) + ',' + lng.toFixed(4);
  if (NEAR_CACHE.has(key)) return NEAR_CACHE.get(key);
  const reverse = fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=th,en&lat=${lat}&lon=${lng}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  const notable = list => list.some(x => placeScore(x.tags) >= 4);

  let found = [];
  try { found = await photonNearby(lat, lng, 0.5, 25); } catch { /* try the others */ }
  if (!notable(found)) { try { found = found.concat(await photonNearby(lat, lng, 3, 40)); } catch { /* ignore */ } }
  if (!found.length) { try { found = await overpassNearby(lat, lng, 400); } catch { /* ignore */ } }

  const seen = new Set(), list = [];
  for (const x of found) {
    if (!x.name || x.lat == null || seen.has(x.name)) continue;
    seen.add(x.name);
    const dist = haversine({ lat, lng }, { lat: x.lat, lng: x.lng }) * 1000;
    list.push({ name: x.name, kind: kindLabel(x.tags), cat: guessCategory(x.tags), dist, score: placeScore(x.tags) - dist / 400 });
  }
  list.sort((a, b) => b.score - a.score);

  const rev = await reverse;
  let area = '';
  if (rev) {
    const ad = rev.address || {};
    if (rev.name && !seen.has(rev.name) && !list.length) list.push({ name: rev.name, kind: 'ตำแหน่งนี้', cat: '', dist: 0, score: 0 });
    area = [ad.island || ad.suburb || ad.village || ad.town || ad.city_district || ad.quarter, ad.city || ad.county || ad.state_district]
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  }
  const out = { list: list.slice(0, 8), area };
  if (list.length || area) NEAR_CACHE.set(key, out);
  return out;
}

const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10 || 10} ม.` : `${(m / 1000).toFixed(1)} กม.`;

async function loadNear(auto) {
  const box = $('#f-near');
  if (!box || !draft) return;
  const id = draft.id, lat = draft.lat, lng = draft.lng;
  box.hidden = false;
  box.innerHTML = '<div class="near-head"><i class="ti ti-loader-2 spin"></i> กำลังหาว่าตรงนี้คือที่ไหน…</div>';
  let r;
  try { r = await fetchNearby(lat, lng); } catch { r = null; }
  if (!draft || draft.id !== id || !$('#f-near')) return;
  if (!r || (!r.list.length && !r.area)) {
    box.innerHTML = '<div class="near-head muted">หาชื่อสถานที่แถวนี้ไม่เจอ ลองพิมพ์ชื่อเอง</div>';
    return;
  }
  box.innerHTML = `
    <div class="near-head"><i class="ti ti-map-search"></i> แถวนี้มี${r.area ? ` · <span class="muted">${esc(r.area)}</span>` : ''}</div>
    <div class="near-list">${r.list.map((x, i) => `
      <button type="button" class="near-item" data-action="f-near-pick" data-i="${i}">
        <b>${esc(x.name)}</b><span>${esc(x.kind)}${x.dist ? ' · ' + fmtDist(x.dist) : ''}</span>
      </button>`).join('')}
      ${r.area && !r.list.length ? `<button type="button" class="near-item" data-action="f-near-pick" data-area="1"><b>${esc(r.area)}</b><span>ย่านนี้</span></button>` : ''}
    </div>`;
  box._data = r;
  // From a photo with no name yet: fill in the best guess straight away.
  const top = r.list[0];
  const name = $('#f-name');
  if (auto && top && name && !name.value.trim() && top.score >= 3) {
    applyNear(top);
    toast(`น่าจะเป็น "${top.name}" แตะชื่ออื่นด้านล่างเพื่อเปลี่ยน`, 3500);
  }
}

function applyNear(x) {
  const name = $('#f-name');
  if (name) { name.value = x.name; name.dispatchEvent(new Event('input', { bubbles: true })); }
  if (draft) draft.name = x.name;
  $('#f-name-err') && ($('#f-name-err').hidden = true);
  $$('.near-item').forEach(b => b.classList.toggle('on', b.querySelector('b').textContent === x.name));
  if (x.cat && draft) {
    draft.category = x.cat;
    $$('[data-action="f-cat"]').forEach(b => b.classList.toggle('on', b.dataset.v === x.cat));
  }
}

ACTIONS['f-near-pick'] = el => {
  const r = $('#f-near')._data;
  if (!r) return;
  applyNear(el.dataset.area ? { name: r.area, cat: '' } : r.list[+el.dataset.i]);
};
ACTIONS['f-near-load'] = () => loadNear(false);
