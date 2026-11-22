'use strict';
/* Map, boundary layers, markers, pick mode and trip routes. */

let map, provLayer, countryLayer, clusterLayer, routeLayer;
const TH_VIEW = { center: [13.2, 100.9], zoom: 5.6 };
const WORLD_VIEW = { center: [25, 100], zoom: 2 };
const TOP_PAD = 170;

function initMap() {
  const v = S.mode === 'th' ? TH_VIEW : WORLD_VIEW;
  map = L.map('map', { zoomControl: false, worldCopyJump: true, minZoom: 2, zoomSnap: 0.2 }).setView(v.center, v.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  clusterLayer = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: z => z < 8 ? 26 : 36,
    disableClusteringAtZoom: 13,
    spiderfyOnMaxZoom: true,
    iconCreateFunction: c => {
      const n = c.getChildCount();
      return L.divIcon({ className: 'cluster-wrap', html: `<div class="cluster">${n}</div>`, iconSize: n > 9 ? [26, 26] : [22, 22] });
    },
  }).addTo(map);
  // Zoomed out, pins shrink to small dots so they don't cover the coloured provinces.
  const farClass = () => map.getContainer().classList.toggle('far', map.getZoom() < 8);
  map.on('zoomend', farClass);
  farClass();
  routeLayer = L.layerGroup().addTo(map);
  // A tap while the "pin here?" popup is open only closes it; the next tap offers a new spot.
  let popupWasOpen = false;
  map.on('preclick', () => { popupWasOpen = !!(offerPopup && map.hasLayer(offerPopup)); });
  map.on('click', e => {
    if (popupWasOpen && !S.pick) { popupWasOpen = false; map.closePopup(); return; }
    if (S.pick) {
      const cb = S.pick.cb;
      endPick();
      cb(e.latlng);
    } else {
      offerPin(e.latlng);
    }
  });
  setTimeout(() => $('#hint').classList.add('hide'), 4500);
}

const fc = features => ({ type: 'FeatureCollection', features });

function buildGeoLayers() {
  if (GEO.provinces.length && !provLayer) provLayer = L.geoJSON(fc(GEO.provinces), { style: provStyle, interactive: false });
  if (GEO.countries.length && !countryLayer) countryLayer = L.geoJSON(fc(GEO.countries), { style: countryStyle, interactive: false });
  showModeLayer();
}

function showModeLayer() {
  for (const l of [provLayer, countryLayer]) if (l && map.hasLayer(l)) map.removeLayer(l);
  const l = S.mode === 'th' ? provLayer : countryLayer;
  if (l) { l.addTo(map); l.bringToBack(); }
}

function fillFor(n) {
  return {
    weight: n ? 1 : 0.6,
    color: n ? '#0F6E56' : '#888780',
    opacity: n ? 0.9 : 0.45,
    fillColor: n >= 3 ? '#0F6E56' : '#1D9E75',
    fillOpacity: n ? (n >= 3 ? 0.55 : 0.38) : 0.03,
  };
}
const provStyle = f => fillFor((S.stats && S.stats.provCount[f.properties.pro_th]) || 0);
const countryStyle = f => fillFor((S.stats && f.iso && S.stats.countryCount[f.iso]) || 0);

ACTIONS.mode = el => {
  S.mode = el.dataset.mode;
  Prefs.set('mode', S.mode);
  showModeLayer();
  const v = S.mode === 'th' ? TH_VIEW : WORLD_VIEW;
  map.flyTo(v.center, v.zoom, { duration: 0.8 });
  renderProgress();
};

function pinIcon(p) {
  const c = cat(p.category), wish = p.status === 'wish';
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin${wish ? ' wish' : ''}" style="--c:${c.color}"><i class="ti ${wish ? 'ti-heart' : c.icon}"></i></div><span class="pin-dot${wish ? ' wish' : ''}" style="--c:${c.color}"></span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 38],
  });
}

/* ---------- filtering ---------- */
function filtered() {
  const f = S.filter;
  return S.pins.filter(p => {
    if (f.cats.length && !f.cats.includes(p.category)) return false;
    if (p.status === 'wish') return f.wish && f.year === 'all' && (f.trip === 'all' || p.tripId === f.trip);
    if (f.year !== 'all' && !p.date.startsWith(f.year)) return false;
    if (f.trip !== 'all' && p.tripId !== f.trip) return false;
    return true;
  });
}
const filterCount = () => (S.filter.year !== 'all') + (S.filter.cats.length > 0) + (S.filter.trip !== 'all') + (!S.filter.wish);

/* ---------- render ---------- */
function renderMap() {
  clusterLayer.clearLayers();
  clusterLayer.addLayers(filtered().map(p =>
    L.marker([p.lat, p.lng], { icon: pinIcon(p), title: p.name }).on('click', () => openPinDetail(p.id))));
  if (provLayer) provLayer.setStyle(provStyle);
  if (countryLayer) countryLayer.setStyle(countryStyle);
  if (S.routeTrip && !tripById(S.routeTrip)) clearRoute();
  $('#filter-dot').hidden = !filterCount();
  renderProgress();
}

function renderProgress() {
  const st = S.stats, th = S.mode === 'th';
  const n = th ? st.provinces.size : st.countries.size;
  const total = th ? TOTAL_PROVINCES : TOTAL_COUNTRIES;
  $('#pc-count').textContent = n;
  $('#pc-total').textContent = `/ ${total} ${th ? 'จังหวัด' : 'ประเทศ'}`;
  $('#pc-bar').style.width = Math.min(100, n / total * 100).toFixed(1) + '%';
  const w = wishes().length;
  $('#pc-sub').textContent = th
    ? `${st.places} ที่ · ${st.regions.size}/6 ภาค${w ? ` · อยากไป ${w}` : ''}`
    : `${st.places} ที่ · ${st.continents.size} ทวีป${w ? ` · อยากไป ${w}` : ''}`;
  $$('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
}

/* ---------- add pin ---------- */
let offerPopup = null;
function offerPin(latlng, name = '') {
  const loc = locate(latlng.lat, latlng.lng);
  let where, sub;
  if (loc.province) {
    const n = S.stats.provCount[loc.province] || 0;
    where = 'จ.' + loc.province;
    sub = n ? `ไปแล้ว ${n} ที่ในจังหวัดนี้` : 'ยังไม่เคยไปจังหวัดนี้';
  } else if (loc.country) {
    const n = S.stats.countryCount[loc.country] || 0;
    where = countryName(loc.country);
    sub = n ? `ไปแล้ว ${n} ที่ในประเทศนี้` : 'ยังไม่เคยไปประเทศนี้';
  } else {
    where = 'ตำแหน่งนี้';
    sub = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
  }
  const data = `data-lat="${latlng.lat}" data-lng="${latlng.lng}" data-name="${esc(name)}"`;
  offerPopup = L.popup({ closeButton: true, autoPanPaddingTopLeft: L.point(16, TOP_PAD), autoPanPaddingBottomRight: L.point(70, 40) })
    .setLatLng(latlng)
    .setContent(`
      ${name ? `<div class="pop-title">${esc(name)}</div><div class="muted small">${esc(where)}</div>` : `<div class="pop-title">${esc(where)}</div>`}
      <div class="muted small">${esc(sub)}</div>
      <div class="pop-btns">
        <button class="pop-btn" data-action="new-pin" data-status="visited" ${data}><i class="ti ti-map-pin"></i> ปักหมุดที่ไปมาแล้ว</button>
        <button class="pop-btn ghost" data-action="new-pin" data-status="wish" ${data}><i class="ti ti-heart"></i> เพิ่มในที่อยากไป</button>
      </div>`)
    .openOn(map);
}

ACTIONS['new-pin'] = el => {
  const lat = +el.dataset.lat, lng = +el.dataset.lng;
  openPinForm(newPin(lat, lng, { status: el.dataset.status, name: el.dataset.name || '' }));
};

ACTIONS.locate = () => {
  if (!navigator.geolocation) return toast('เครื่องนี้หาตำแหน่งไม่ได้');
  toast('กำลังหาตำแหน่ง…');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
      map.setView(ll, Math.max(map.getZoom(), 15), { animate: false });
      offerPin(ll);
    },
    () => toast('หาตำแหน่งไม่ได้ ลองแตะบนแผนที่แทน'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

const TH_BOUNDS = [[5.6, 97.3], [20.5, 105.7]];
ACTIONS['home-th'] = () => {
  map.closePopup();
  if (S.mode !== 'th') ACTIONS.mode({ dataset: { mode: 'th' } });
  map.flyToBounds(TH_BOUNDS, { paddingTopLeft: [16, TOP_PAD - 20], paddingBottomRight: [60, 20], duration: 0.8 });
};
ACTIONS['fit-all'] = () => {
  const list = filtered();
  if (!list.length) return toast('ยังไม่มีหมุดให้แสดง');
  if (list.length === 1) return map.setView([list[0].lat, list[0].lng], 12);
  map.fitBounds(list.map(p => [p.lat, p.lng]), { paddingTopLeft: [30, TOP_PAD], paddingBottomRight: [70, 40], maxZoom: 13 });
};

/* ---------- pick mode: next map tap returns a location ---------- */
function startPick(label, cb, onCancel) {
  closeSheet();
  switchView('map');
  map.closePopup();
  S.pick = { cb, onCancel };
  $('#pick-text').textContent = label;
  $('#pick-banner').hidden = false;
}
function endPick() {
  S.pick = null;
  $('#pick-banner').hidden = true;
}
ACTIONS['cancel-pick'] = () => {
  const p = S.pick;
  endPick();
  if (p && p.onCancel) p.onCancel();
};

/* ---------- trip route ---------- */
/* Draws the trip straight away with straight dashed lines, then swaps in the road route once it's known
   (see route.js). Road legs are solid; flight/boat legs stay dashed. */
function showRoute(tripId, opts = {}) {
  const t = tripById(tripId), ps = tripStops(tripId);
  if (!t || !ps.length) return toast('ทริปนี้ยังไม่มีหมุด');
  routeLayer.clearLayers();
  const rt = roundTrip();
  const ll = ps.map(p => [p.lat, p.lng]);
  const lines = L.layerGroup().addTo(routeLayer);
  const dashed = { color: '#D85A30', weight: 3, dashArray: '6 8', opacity: 0.9, interactive: false };
  if (ll.length > 1) L.polyline(rt ? [...ll, ll[0]] : ll, dashed).addTo(lines);
  const setChip = txt => { $('#route-text').textContent = `${t.name} · ${txt}`; };
  const draw = r => {
    if (!r || S.routeTrip !== tripId || roundTrip() !== rt) return;
    lines.clearLayers();
    for (const l of r.legs) {
      if (l.road) {
        L.polyline(l.coords, { color: '#fff', weight: 7, opacity: 0.85, interactive: false }).addTo(lines);
        L.polyline(l.coords, { color: '#D85A30', weight: 4, opacity: 0.95, interactive: false }).addTo(lines);
      } else L.polyline(l.coords, dashed).addTo(lines);
    }
    setChip(roadText(r, rt));
    if (fresh && !opts.keepView) fit();
  };
  let fresh = false;
  const fit = () => {
    map.invalidateSize();
    const parts = lines.getLayers();
    const b = parts.length ? L.featureGroup(parts).getBounds() : L.latLngBounds(ll);
    if (ll.length > 1) map.fitBounds(b, { paddingTopLeft: [40, TOP_PAD + 40], paddingBottomRight: [80, 60], maxZoom: 13 });
    else map.setView(ll[0], 12);
  };
  ps.forEach((p, i) => L.marker([p.lat, p.lng], {
    icon: L.divIcon({ className: 'pin-wrap', html: `<div class="route-num">${i + 1}</div>`, iconSize: [22, 22], iconAnchor: [-6, 46] }),
    interactive: false, zIndexOffset: 1000,
  }).addTo(routeLayer));
  S.routeTrip = tripId;
  $('#route-chip').hidden = false;
  if (ll.length > 1) {
    const hit = cachedRoad(tripId, rt);
    if (hit) draw(hit);
    else { setChip('กำลังคำนวณเส้นทาง…'); fresh = true; roadRoute(tripId, rt).then(draw); }
  } else setChip('1 ที่');
  if (opts.keepView) return;
  closeSheet();
  switchView('map');
  setTimeout(fit, 50);
}
function clearRoute() {
  routeLayer.clearLayers();
  S.routeTrip = null;
  $('#route-chip').hidden = true;
}
ACTIONS['clear-route'] = clearRoute;
