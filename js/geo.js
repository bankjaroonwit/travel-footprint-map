'use strict';
/* Province and country boundaries, point lookup, distance, and photo EXIF reading. */

const PROVINCES_URL = 'https://cdn.jsdelivr.net/gh/chingchai/OpenGISData-Thailand@master/provinces.geojson';
const COUNTRIES_URL = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';
const TOTAL_PROVINCES = 77;
const TOTAL_COUNTRIES = 195;

const REGIONS = {
  North: 'ภาคเหนือ', Northeast: 'ภาคอีสาน', Central: 'ภาคกลาง',
  East: 'ภาคตะวันออก', West: 'ภาคตะวันตก', South: 'ภาคใต้',
};
const CONTINENTS = {
  'Asia': 'เอเชีย', 'Europe': 'ยุโรป', 'Africa': 'แอฟริกา', 'North America': 'อเมริกาเหนือ',
  'South America': 'อเมริกาใต้', 'Oceania': 'โอเชียเนีย', 'Antarctica': 'แอนตาร์กติกา',
};

const GEO = {
  provinces: [],
  countries: [],
  provinceRegion: {},   // pro_th -> region key
  provinceNames: [],
  isoContinent: {},     // ISO2 -> continent key
  countryList: [],      // [{iso, name}] sorted by Thai name
};

let _regionNames = null;
try { _regionNames = new Intl.DisplayNames(['th'], { type: 'region' }); } catch { /* old browser */ }
function countryName(iso) {
  if (!iso) return '';
  try { return (_regionNames && _regionNames.of(iso)) || iso; } catch { return iso; }
}

function polysOf(g) {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}
function prepare(f) {
  f.polys = polysOf(f.geometry);
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const poly of f.polys) for (const [x, y] of poly[0]) {
    if (x < a) a = x; if (x > c) c = x;
    if (y < b) b = y; if (y > d) d = y;
  }
  f.bbox = [a, b, c, d];
}
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(pt, poly) {
  if (!inRing(pt, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(pt, poly[k])) return false;
  return true;
}
function hit(features, lat, lng) {
  for (const f of features) {
    const [a, b, c, d] = f.bbox;
    if (lng < a || lng > c || lat < b || lat > d) continue;
    if (f.polys.some(p => inPolygon([lng, lat], p))) return f;
  }
  return null;
}

/* Returns { country: ISO2 or '', province: Thai name or '' } */
function locate(lat, lng) {
  const pv = hit(GEO.provinces, lat, lng);
  if (pv) return { country: 'TH', province: pv.properties.pro_th };
  const c = hit(GEO.countries, lat, lng);
  if (c) return { country: c.iso || '', province: '' };
  // Coarse world outlines miss small islands and coasts: take the smallest country box nearby.
  let best = null, area = Infinity;
  for (const f of GEO.countries) {
    if (!f.iso) continue;
    const [a, b, c2, d] = f.bbox;
    if (lng >= a - 0.6 && lng <= c2 + 0.6 && lat >= b - 0.6 && lat <= d + 0.6) {
      const ar = (c2 - a) * (d - b);
      if (ar < area) { area = ar; best = f; }
    }
  }
  return { country: best ? best.iso : '', province: '' };
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function loadGeo() {
  const [pr, co] = await Promise.allSettled([fetchJSON(PROVINCES_URL), fetchJSON(COUNTRIES_URL)]);
  if (pr.status === 'fulfilled') {
    GEO.provinces = pr.value.features.filter(f => f.geometry);
    GEO.provinces.forEach(f => {
      prepare(f);
      GEO.provinceRegion[f.properties.pro_th] = f.properties.reg_royin;
    });
    GEO.provinceNames = GEO.provinces.map(f => f.properties.pro_th).sort((a, b) => a.localeCompare(b, 'th'));
  }
  if (co.status === 'fulfilled') {
    GEO.countries = co.value.features.filter(f => f.geometry);
    GEO.countries.forEach(f => {
      prepare(f);
      const code = f.properties.ISO_A2_EH;
      f.iso = /^[A-Z]{2}$/.test(code) ? code : '';
      if (f.iso) GEO.isoContinent[f.iso] = f.properties.CONTINENT;
    });
    const seen = new Set();
    GEO.countryList = GEO.countries.filter(f => f.iso && !seen.has(f.iso) && seen.add(f.iso))
      .map(f => ({ iso: f.iso, name: countryName(f.iso) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }
  if (pr.status === 'rejected' && co.status === 'rejected') toast('โหลดขอบเขตแผนที่ไม่ได้ ใช้งานต่อได้แต่จะไม่ระบายสี', 4000);
  else if (pr.status === 'rejected') toast('โหลดขอบเขตจังหวัดไม่ได้', 3500);
}

function haversine(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function pathKm(list) {
  let km = 0;
  for (let i = 1; i < list.length; i++) km += haversine(list[i - 1], list[i]);
  return km;
}

/* ---------- EXIF (JPEG): GPS position and date taken ---------- */
async function readExif(file) {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off < v.byteLength - 10) {
      const marker = v.getUint16(off);
      if ((marker & 0xFF00) !== 0xFF00) break;
      const size = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
      off += 2 + size;
    }
  } catch { /* not readable */ }
  return null;
}

function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = o => v.getUint16(start + o, le);
  const u32 = o => v.getUint32(start + o, le);
  const ifd = o => {
    const n = u16(o), tags = {};
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      tags[u16(e)] = { count: u32(e + 4), at: e + 8 };
    }
    return tags;
  };
  const rational = o => { const d = u32(o + 4); return d ? u32(o) / d : NaN; };
  const out = {};
  const ifd0 = ifd(u32(4));

  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].at));
    const ref = t => t ? String.fromCharCode(v.getUint8(start + t.at)) : '';
    const dms = t => { if (!t) return NaN; const o = u32(t.at); return rational(o) + rational(o + 8) / 60 + rational(o + 16) / 3600; };
    let lat = dms(g[2]), lng = dms(g[4]);
    if (isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0)) {
      if (ref(g[1]) === 'S') lat = -lat;
      if (ref(g[3]) === 'W') lng = -lng;
      out.lat = lat; out.lng = lng;
    }
  }
  if (ifd0[0x8769]) {
    const ex = ifd(u32(ifd0[0x8769].at));
    const t = ex[0x9003] || ex[0x9004];
    if (t) {
      const o = u32(t.at);
      let s = '';
      for (let i = 0; i < 10; i++) s += String.fromCharCode(v.getUint8(start + o + i));
      const m = s.match(/^(\d{4}):(\d{2}):(\d{2})/);
      if (m && m[1] !== '0000') out.date = `${m[1]}-${m[2]}-${m[3]}`;
    }
  }
  return out;
}

/* Downscale to JPEG. Re-encoding also drops EXIF, so GPS isn't kept inside stored photos. */
async function compressImage(file, max = 1280, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
