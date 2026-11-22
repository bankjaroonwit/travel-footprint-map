'use strict';
/* Shared state, helpers, storage and the click dispatcher. Loaded first. */

const APP_VERSION = '2.5';

const CATS = {
  beach:     { label: 'ทะเล',             icon: 'ti-beach',               color: '#378ADD' },
  island:    { label: 'เกาะ',             icon: 'ti-sailboat',            color: '#1B8FB5' },
  mountain:  { label: 'ภูเขา',            icon: 'ti-mountain',            color: '#1D9E75' },
  waterfall: { label: 'น้ำตก',            icon: 'ti-droplet',             color: '#2A9DC0' },
  nature:    { label: 'ธรรมชาติ/อุทยาน',  icon: 'ti-trees',               color: '#639922' },
  camping:   { label: 'แคมป์ปิ้ง',         icon: 'ti-tent',                color: '#4E7A27' },
  viewpoint: { label: 'จุดชมวิว',          icon: 'ti-binoculars',          color: '#0E8C8C' },
  temple:    { label: 'วัด/ประวัติศาสตร์', icon: 'ti-building-castle',     color: '#D85A30' },
  museum:    { label: 'พิพิธภัณฑ์/ศิลปะ', icon: 'ti-palette',             color: '#A34A7A' },
  city:      { label: 'เมือง',            icon: 'ti-building-skyscraper', color: '#7F77DD' },
  food:      { label: 'ร้านอาหาร',        icon: 'ti-tools-kitchen-2',     color: '#BA7517' },
  cafe:      { label: 'คาเฟ่',            icon: 'ti-coffee',              color: '#8B5E3C' },
  market:    { label: 'ตลาด',             icon: 'ti-basket',              color: '#C2410C' },
  shopping:  { label: 'ช้อปปิ้ง',          icon: 'ti-shopping-bag',        color: '#D4537E' },
  nightlife: { label: 'บาร์/ไนท์ไลฟ์',    icon: 'ti-glass-cocktail',      color: '#6D3FB8' },
  themepark: { label: 'สวนสนุก/สวนสัตว์', icon: 'ti-balloon',             color: '#D99A0B' },
  stay:      { label: 'ที่พัก',            icon: 'ti-bed',                 color: '#5B6B8C' },
};

const S = {
  pins: [],
  trips: [],
  journal: [],
  jQuery: '',
  mode: 'th',
  view: 'map',
  filter: { year: 'all', cats: [], trip: 'all', wish: true },
  tl: 'places',
  tlQuery: '',
  pick: null,
  routeTrip: null,
  stats: null,
};

/* Click handlers are registered by name; elements carry data-action="name". */
const ACTIONS = {};

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const toD = iso => new Date(iso + 'T00:00:00');
const fmtDate = iso => isDate(iso) ? toD(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtMonth = iso => toD(iso).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
function fmtRange(a, b) {
  if (!isDate(a)) return '';
  if (!isDate(b) || a === b) return fmtDate(a);
  const da = toD(a), db = toD(b);
  if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()) return `${da.getDate()}–${fmtDate(b)}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}
const stars = n => '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));
const cat = key => CATS[key] || CATS.city;
const fmtKm = km => Math.round(km).toLocaleString('th-TH');

const byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt;
const visited = () => S.pins.filter(p => p.status !== 'wish');
const wishes = () => S.pins.filter(p => p.status === 'wish');
const pinById = id => S.pins.find(p => p.id === id);
const tripById = id => S.trips.find(t => t.id === id);
const tripPins = id => visited().filter(p => p.tripId === id).sort(byDate);
function tripRange(t) {
  const ps = tripPins(t.id);
  const start = t.start || (ps[0] && ps[0].date) || '';
  const end = t.end || (ps.length && ps[ps.length - 1].date) || start;
  return { start, end };
}

function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- storage ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('footprint', 3);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const name of ['pins', 'trips', 'journal']) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  run(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode);
      const out = fn(tx.objectStore(store));
      tx.oncomplete = () => res(out && out.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  all(store) { return this.run(store, 'readonly', s => s.getAll()); },
  put(store, obj) { return this.run(store, 'readwrite', s => s.put(obj)); },
  putMany(store, list) { return this.run(store, 'readwrite', s => { list.forEach(o => s.put(o)); }); },
  del(store, id) { return this.run(store, 'readwrite', s => s.delete(id)); },
  clear(store) { return this.run(store, 'readwrite', s => s.clear()); },
};

/* Per-device conveniences only (theme, map mode). */
const Prefs = {
  get(k, d) { try { const v = localStorage.getItem('fp.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fp.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

function normPin(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = +p.lat, lng = +p.lng;
  if (!isFinite(lat) || !isFinite(lng) || !p.name) return null;
  const status = p.status === 'wish' ? 'wish' : 'visited';
  return {
    id: String(p.id || uid()),
    name: String(p.name).slice(0, 120),
    lat, lng, status,
    date: status === 'wish' ? '' : (isDate(p.date) ? p.date : today()),
    province: String(p.province || ''),
    country: /^[A-Z]{2}$/.test(p.country) ? p.country : '',
    category: CATS[p.category] ? p.category : 'city',
    rating: Math.max(0, Math.min(5, Math.round(+p.rating || 0))),
    note: String(p.note || ''),
    photos: Array.isArray(p.photos) ? p.photos.filter(s => typeof s === 'string' && s.startsWith('data:image/')) : [],
    tripId: status === 'wish' ? '' : String(p.tripId || ''),
    fromWish: !!p.fromWish,
    demo: !!p.demo,
    createdAt: +p.createdAt || Date.now(),
    updatedAt: +p.updatedAt || Date.now(),
  };
}

function normTrip(t) {
  if (!t || typeof t !== 'object') return null;
  let start = isDate(t.start) ? t.start : '', end = isDate(t.end) ? t.end : '';
  if (start && end && end < start) [start, end] = [end, start];
  return {
    id: String(t.id || uid()),
    name: String(t.name || 'ทริปไม่มีชื่อ').slice(0, 80),
    start, end,
    note: String(t.note || ''),
    demo: !!t.demo,
    createdAt: +t.createdAt || Date.now(),
  };
}

function upsert(list, obj) {
  const i = list.findIndex(x => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
}

async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* ignore */ }
}

/* ---------- bottom sheet ---------- */
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').classList.add('open');
  $('#sheet-backdrop').classList.add('open');
  $('#sheet').scrollTop = 0;
}
function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#sheet-backdrop').classList.remove('open');
}
const sheetOpen = () => $('#sheet').classList.contains('open');
const sheetHead = title => `
  <div class="sheet-head">
    <h1>${title}</h1>
    <button class="icon-btn" data-action="close-sheet" aria-label="ปิด"><i class="ti ti-x"></i></button>
  </div>`;

/* ---------- dispatcher ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el, e);
});
