'use strict';
/* Screens: timeline, detail sheets, passport/stats, photo viewer, settings, share card, demo data. */

function renderAll() {
  S.stats = computeStats();
  renderMap();
  renderTimeline();
  renderJournal();
  renderPassport();
}

function switchView(name) {
  S.view = name;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  if (name === 'map') setTimeout(() => map.invalidateSize(), 0);
}
ACTIONS.view = el => switchView(el.dataset.view);

const placeLabel = p => p.province || countryName(p.country) || '';

/* ---------- timeline ---------- */
function thumbHtml(p) {
  const c = cat(p.category);
  if (p.photos[0]) return `<img src="${p.photos[0]}" alt="" loading="lazy">`;
  if (p.status === 'wish') return `<div class="ico wish" style="--c:${c.color}"><i class="ti ${c.icon}"></i></div>`;
  return `<div class="ico" style="background:${c.color}"><i class="ti ${c.icon}"></i></div>`;
}

function placeItem(p, lead = '') {
  const t = p.tripId && tripById(p.tripId);
  const sub = [placeLabel(p), p.status === 'wish' ? 'อยากไป' : fmtDate(p.date)].filter(Boolean).join(' · ');
  return `
    <button class="item" data-action="open-pin" data-id="${p.id}">
      ${lead}${thumbHtml(p)}
      <div>
        <div class="t">${esc(p.name)}</div>
        <div class="s">${esc(sub)}${t && !lead ? ` · <i class="ti ti-route"></i> ${esc(t.name)}` : ''}</div>
        ${p.status !== 'wish' && p.rating ? `<div class="rating">${stars(p.rating)}</div>` : ''}
      </div>
    </button>`;
}

function renderTimeline() {
  const segs = [['places', 'สถานที่', visited().length], ['trips', 'ทริป', S.trips.length], ['wish', 'อยากไป', wishes().length]];
  $('#tl-seg').innerHTML = `<div class="seg wide">${segs.map(([k, l, n]) =>
    `<button data-action="tl-tab" data-v="${k}" class="${S.tl === k ? 'on' : ''}">${l} <span class="cnt">${n}</span></button>`).join('')}</div>`;
  const el = $('#timeline');

  if (S.tl === 'places') {
    const focused = document.activeElement && document.activeElement.id === 'tl-q';
    el.innerHTML = `
      <div class="search-box"><i class="ti ti-search"></i><input id="tl-q" class="input" placeholder="ค้นหาชื่อ จังหวัด หรือบันทึก" value="${esc(S.tlQuery)}" autocomplete="off"></div>
      ${filterCount() ? `<div class="filter-note"><i class="ti ti-filter"></i> ใช้ตัวกรองอยู่ · <button class="link" data-action="flt-clear">ล้าง</button></div>` : ''}
      <div id="tl-list"></div>`;
    if (focused) $('#tl-q').focus();
    renderPlacesList();
  } else if (S.tl === 'trips') {
    const trips = [...S.trips].sort((a, b) => (tripRange(b).start || '9').localeCompare(tripRange(a).start || '9'));
    el.innerHTML = `<button class="btn block" data-action="new-trip"><i class="ti ti-plus"></i> สร้างทริป</button>` +
      (trips.length ? trips.map(tripCard).join('')
        : `<div class="empty"><i class="ti ti-route"></i>ยังไม่มีทริป<br>รวมหลายที่ที่ไปในครั้งเดียวกันเป็นทริป แล้วดูเส้นทางบนแผนที่ได้</div>`);
  } else {
    const list = wishes().sort((a, b) => b.createdAt - a.createdAt);
    el.innerHTML = list.length
      ? `<p class="muted small" style="margin-top:0">ไปถึงแล้วเมื่อไหร่ เปิดหมุดแล้วกด "ไปมาแล้ว" ได้เลย</p>${list.map(p => placeItem(p)).join('')}`
      : `<div class="empty"><i class="ti ti-heart"></i>ยังไม่มีที่อยากไป<br>แตะบนแผนที่ แล้วเลือก "เพิ่มในที่อยากไป"</div>`;
  }
}
ACTIONS['tl-tab'] = el => { S.tl = el.dataset.v; renderTimeline(); };

function renderPlacesList() {
  const box = $('#tl-list');
  if (!box) return;
  if (!visited().length) {
    box.innerHTML = `<div class="empty"><i class="ti ti-map-pin"></i>ยังไม่มีหมุดเลย<br>ไปที่แผนที่ แล้วแตะตรงที่เคยไปได้เลย
      <br><button class="btn" data-action="view" data-view="map"><i class="ti ti-map-2"></i> ไปที่แผนที่</button></div>`;
    return;
  }
  const q = S.tlQuery.trim().toLowerCase();
  const list = filtered().filter(p => p.status !== 'wish')
    .filter(p => !q || [p.name, p.province, countryName(p.country), p.note].join(' ').toLowerCase().includes(q))
    .sort((a, b) => byDate(b, a));
  if (!list.length) { box.innerHTML = '<div class="empty"><i class="ti ti-search"></i>ไม่เจอหมุดที่ตรงกัน</div>'; return; }
  let html = '', last = '';
  for (const p of list) {
    const m = p.date.slice(0, 7);
    if (m !== last) { html += `<div class="month">${fmtMonth(p.date)}</div>`; last = m; }
    html += placeItem(p);
  }
  box.innerHTML = html;
}

function tripStats(t) {
  const ps = tripPins(t.id);
  return {
    ps,
    provinces: new Set(ps.map(p => p.province).filter(Boolean)).size,
    countries: new Set(ps.map(p => p.country).filter(Boolean)).size,
    km: pathKm(ps),
    cover: (ps.find(p => p.photos.length) || {}).photos?.[0] || '',
  };
}
function tripCard(t) {
  const st = tripStats(t), r = tripRange(t);
  const where = st.countries > 1 ? `${st.countries} ประเทศ` : `${st.provinces} จังหวัด`;
  return `
    <button class="trip-card" data-action="open-trip" data-id="${t.id}">
      <div class="cover">${st.cover ? `<img src="${st.cover}" alt="" loading="lazy">` : '<i class="ti ti-route"></i>'}</div>
      <div class="body">
        <div class="t">${esc(t.name)}</div>
        <div class="s">${esc(fmtRange(r.start, r.end) || 'ยังไม่มีวันที่')}</div>
        <div class="s">${st.ps.length} ที่ · ${where} · ${fmtKm(st.km)} กม.</div>
      </div>
    </button>`;
}

/* ---------- pin detail ---------- */
const flag = iso => !/Windows/.test(navigator.userAgent) && iso && /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map(c => 0x1F1A5 + c.charCodeAt(0))) : '';
function agoText(iso) {
  if (!isDate(iso)) return '';
  const days = Math.round((toD(today()) - toD(iso)) / 864e5);
  if (days < 0) return 'อีก ' + (-days) + ' วัน';
  if (days === 0) return 'วันนี้';
  if (days < 30) return days + ' วันที่แล้ว';
  if (days < 365) return Math.floor(days / 30) + ' เดือนที่แล้ว';
  return Math.floor(days / 365) + ' ปีที่แล้ว';
}
let detailMap = null;
function openPinDetail(id) {
  const p = pinById(id);
  if (!p) return;
  const c = cat(p.category), wish = p.status === 'wish';
  const t = p.tripId && tripById(p.tripId);
  const nav = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  const country = countryName(p.country);
  const where = [p.province ? 'จ.' + p.province : '', country].filter(Boolean).join(' · ');
  const nearby = !wish && p.province ? visited().filter(x => x.id !== p.id && x.province === p.province).length : 0;
  const entries = S.journal.filter(j => j.pinIds.includes(p.id));
  const photos = p.photos;

  const hero = photos.length
    ? `<button class="pd-hero" data-action="view-photo" data-id="${p.id}" data-i="0" style="background-image:url('${photos[0]}')" aria-label="ดูรูป"></button>`
    : `<div class="pd-hero empty" style="--c:${c.color}"><i class="ti ${wish ? 'ti-heart' : c.icon}"></i></div>`;

  openSheet(`
    <div class="pd">
      <div class="pd-top">
        ${hero}
        <div class="pd-shade"></div>
        <button class="pd-close" data-action="close-sheet" aria-label="ปิด"><i class="ti ti-x"></i></button>
        ${photos.length > 1 ? `<span class="pd-count"><i class="ti ti-photo"></i> ${photos.length}</span>` : ''}
        <div class="pd-title">
          <span class="pd-cat" style="--c:${c.color}"><i class="ti ${c.icon}"></i>${c.label}</span>
          <h1>${esc(p.name)}</h1>
          ${where ? `<div class="pd-where">${flag(p.country)} ${esc(where)}</div>` : ''}
        </div>
      </div>
      ${photos.length > 1 ? `<div class="pd-thumbs">${photos.map((src, i) =>
        `<img src="${src}" alt="" data-action="view-photo" data-id="${p.id}" data-i="${i}">`).join('')}</div>` : ''}

      <div class="pd-facts">
        ${wish
          ? `<div class="fact"><i class="ti ti-heart"></i><div><b>อยากไป</b><span>รายการที่อยากไป</span></div></div>`
          : `<div class="fact"><i class="ti ti-calendar"></i><div><b>${fmtDate(p.date) || 'ไม่ระบุวัน'}</b><span>${agoText(p.date)}</span></div></div>`}
        ${!wish ? `<div class="fact"><i class="ti ti-star"></i><div><b class="pd-stars">${p.rating ? stars(p.rating) : '–'}</b><span>${p.rating ? `ให้ ${p.rating} จาก 5` : 'ยังไม่ให้คะแนน'}</span></div></div>` : ''}
        ${t ? `<button class="fact link-fact" data-action="open-trip" data-id="${t.id}"><i class="ti ti-route"></i><div><b>${esc(t.name)}</b><span>ทริป</span></div><i class="ti ti-chevron-right go"></i></button>` : ''}
        ${nearby ? `<div class="fact"><i class="ti ti-map-pins"></i><div><b>อีก ${nearby} ที่</b><span>ในจังหวัดเดียวกัน</span></div></div>` : ''}
      </div>

      ${wish ? `<button class="btn primary block" data-action="mark-visited" data-id="${p.id}"><i class="ti ti-check"></i> ไปมาแล้ว</button>` : ''}

      <div class="pd-sec">
        <h3><i class="ti ti-quote"></i> บันทึก</h3>
        ${p.note ? `<div class="pd-note">${esc(p.note)}</div>`
          : `<button class="pd-note empty" data-action="edit-pin" data-id="${p.id}">ยังไม่มีบันทึก แตะเพื่อเขียน</button>`}
      </div>

      <div class="pd-sec">
        <h3><i class="ti ti-map-2"></i> ตำแหน่ง</h3>
        <div class="pd-map" id="pd-map"></div>
        <div class="pd-mapbar">
          <span class="muted small">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</span>
          <span class="pd-maplinks">
            ${!wish ? `<button class="link" data-action="show-pin" data-id="${p.id}">ดูในแผนที่</button>` : ''}
            <a class="link" href="${nav}" target="_blank" rel="noopener"><i class="ti ti-navigation"></i> นำทาง</a>
          </span>
        </div>
      </div>

      ${!wish ? `<div class="pd-sec"><h3><i class="ti ti-notebook"></i> ไดอารี่${entries.length ? ` <span class="muted small">${entries.length}</span>` : ''}</h3>
        ${journalLinks(entries, `data-pin="${p.id}"`)}</div>` : ''}

      <div class="row pd-actions">
        <button class="btn" data-action="edit-pin" data-id="${p.id}"><i class="ti ti-edit"></i> แก้ไข</button>
        <button class="btn danger" data-action="delete-pin" data-id="${p.id}"><i class="ti ti-trash"></i> ลบ</button>
      </div>
    </div>`);

  if (detailMap) { detailMap.remove(); detailMap = null; }
  setTimeout(() => {
    const el = $('#pd-map');
    if (!el) return;
    detailMap = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false }).setView([p.lat, p.lng], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(detailMap);
    L.marker([p.lat, p.lng], { icon: pinIcon(p), interactive: false }).addTo(detailMap);
  }, 60);
}
ACTIONS['open-pin'] = el => openPinDetail(el.dataset.id);
ACTIONS['edit-pin'] = el => openPinForm(pinById(el.dataset.id));
ACTIONS['mark-visited'] = el => {
  const p = pinById(el.dataset.id);
  openPinForm({ ...JSON.parse(JSON.stringify(p)), status: 'visited', date: today(), fromWish: true });
};
ACTIONS['show-pin'] = el => {
  const p = pinById(el.dataset.id);
  closeSheet();
  switchView('map');
  setTimeout(() => map.setView([p.lat, p.lng], Math.max(map.getZoom(), 13)), 30);
};
ACTIONS['delete-pin'] = async el => {
  const p = pinById(el.dataset.id);
  if (!p || !confirm(`ลบ "${p.name}" ใช่ไหม? ลบแล้วกู้คืนไม่ได้`)) return;
  await DB.del('pins', p.id);
  S.pins = S.pins.filter(x => x.id !== p.id);
  closeSheet();
  renderAll();
  toast('ลบแล้ว');
};

/* ---------- trip detail ---------- */
function openTripDetail(id) {
  const t = tripById(id);
  if (!t) return;
  const st = tripStats(t), r = tripRange(t);
  openSheet(`
    ${sheetHead(esc(t.name))}
    ${st.cover ? `<div class="gallery"><img src="${st.cover}" alt=""></div>` : ''}
    <div class="muted">${esc(fmtRange(r.start, r.end) || 'ยังไม่มีวันที่')}</div>
    <div class="trip-stats">
      <div><b>${st.ps.length}</b><span>สถานที่</span></div>
      <div><b>${st.countries > 1 ? st.countries : st.provinces}</b><span>${st.countries > 1 ? 'ประเทศ' : 'จังหวัด'}</span></div>
      <div><b>${fmtKm(st.km)}</b><span>กม. โดยประมาณ</span></div>
    </div>
    ${t.note ? `<div class="note">${esc(t.note)}</div>` : ''}
    ${st.ps.length > 0 ? `<button class="btn primary block" data-action="show-route" data-id="${t.id}"><i class="ti ti-route"></i> ดูเส้นทางบนแผนที่</button>` : ''}
    ${st.ps.length ? st.ps.map((p, i) => placeItem(p, `<span class="num">${i + 1}</span>`)).join('')
      : '<p class="muted small">ยังไม่มีหมุดในทริปนี้ ตอนปักหมุดให้เลือกทริปนี้ในช่อง "ทริป"</p>'}
    <h3>ไดอารี่ของทริปนี้</h3>
    ${journalLinks(S.journal.filter(j => j.tripId === t.id), `data-trip="${t.id}"`)}
    <div class="row" style="margin-top:8px">
      <button class="btn danger" data-action="delete-trip" data-id="${t.id}"><i class="ti ti-trash"></i> ลบทริป</button>
      <button class="btn" data-action="edit-trip" data-id="${t.id}"><i class="ti ti-edit"></i> แก้ไข</button>
    </div>`);
}
ACTIONS['open-trip'] = el => openTripDetail(el.dataset.id);

/* Journal entries linked to a pin or trip, plus a button to write a new one. */
function journalLinks(entries, presetAttr) {
  const rows = entries.sort(byJournalDate).map(j => `
    <button class="list-row" data-action="open-journal" data-id="${j.id}"><i class="ti ti-notebook"></i>
      <div><div class="t">${esc(j.title || 'ไม่มีหัวข้อ')}</div><div class="s">${fmtDate(j.date)}${j.body ? ' · ' + esc(excerpt(j.body, 50)) : ''}</div></div>
    </button>`).join('');
  return `<div class="linked">${rows}
    <button class="btn block" data-action="new-journal" ${presetAttr} style="margin-top:8px"><i class="ti ti-pencil"></i> เขียนไดอารี่${entries.length ? 'เพิ่ม' : ''}</button></div>`;
}
ACTIONS['show-route'] = el => showRoute(el.dataset.id);

/* ---------- photo viewer ---------- */
const VW = { photos: [], i: 0 };
function showViewer() {
  $('#viewer-img').src = VW.photos[VW.i];
  $('#viewer-count').textContent = VW.photos.length > 1 ? `${VW.i + 1} / ${VW.photos.length}` : '';
  $('#viewer-prev').hidden = $('#viewer-next').hidden = VW.photos.length < 2;
}
function stepViewer(d) {
  VW.i = (VW.i + d + VW.photos.length) % VW.photos.length;
  showViewer();
}
ACTIONS['view-photo'] = el => {
  const src = el.dataset.kind === 'journal' ? journalById(el.dataset.id) : pinById(el.dataset.id);
  if (!src) return;
  VW.photos = src.photos;
  VW.i = +el.dataset.i;
  $('#viewer').hidden = false;
  showViewer();
};
ACTIONS['viewer-close'] = () => { $('#viewer').hidden = true; };
ACTIONS['viewer-prev'] = () => stepViewer(-1);
ACTIONS['viewer-next'] = () => stepViewer(1);
(() => {
  let x0 = null;
  const v = $('#viewer');
  v.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  v.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50 && VW.photos.length > 1) stepViewer(dx < 0 ? 1 : -1);
  });
  v.addEventListener('click', e => { if (e.target === v) v.hidden = true; });
})();
document.addEventListener('keydown', e => {
  if (!$('#viewer').hidden) {
    if (e.key === 'Escape') $('#viewer').hidden = true;
    if (e.key === 'ArrowLeft') stepViewer(-1);
    if (e.key === 'ArrowRight') stepViewer(1);
  } else if (e.key === 'Escape') {
    if (S.pick) ACTIONS['cancel-pick']();
    else if (sheetOpen()) ACTIONS['close-sheet']();
  }
});

/* ---------- stats + badges ---------- */
function computeStats() {
  const v = visited();
  const provCount = {}, countryCount = {}, byYear = {}, byCat = {};
  for (const p of v) {
    if (p.province) provCount[p.province] = (provCount[p.province] || 0) + 1;
    if (p.country) countryCount[p.country] = (countryCount[p.country] || 0) + 1;
    const y = p.date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
    byCat[p.category] = (byCat[p.category] || 0) + 1;
  }
  const provinces = new Set(Object.keys(provCount));
  const countries = new Set(Object.keys(countryCount));
  const rated = v.filter(p => p.rating);
  return {
    places: v.length,
    provCount, countryCount, byYear, byCat,
    provinces, countries,
    regions: new Set([...provinces].map(n => GEO.provinceRegion[n]).filter(Boolean)),
    continents: new Set([...countries].map(c => GEO.isoContinent[c]).filter(Boolean)),
    km: pathKm([...v].sort(byDate)),
    thisYear: byYear[String(new Date().getFullYear())] || 0,
    avgRating: rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : 0,
  };
}

function computeBadges() {
  const s = S.stats || computeStats();
  const n = k => s.byCat[k] || 0;
  const regTotal = r => Object.values(GEO.provinceRegion).filter(x => x === r).length;
  const regDone = r => [...s.provinces].filter(p => GEO.provinceRegion[p] === r).length;
  return [
    ['first',  'ก้าวแรก',           'ti-shoe',            '#1D9E75', s.places, 1, 'ที่'],
    ['p10',    'นักสำรวจ',           'ti-compass',         '#0F6E56', s.provinces.size, 10, 'จังหวัด'],
    ['p39',    'ครึ่งประเทศ',         'ti-map',             '#185FA5', s.provinces.size, 39, 'จังหวัด'],
    ['p77',    'ครบ 77 จังหวัด',      'ti-crown',           '#BA7517', s.provinces.size, 77, 'จังหวัด'],
    ['reg6',   'ครบทุกภาค',          'ti-map-2',           '#534AB7', s.regions.size, 6, 'ภาค'],
    ['north',  'ครบภาคเหนือ',         'ti-trees',           '#0F6E56', regDone('North'), regTotal('North') || 9, 'จังหวัด'],
    ['south',  'ครบภาคใต้',           'ti-sailboat',        '#378ADD', regDone('South'), regTotal('South') || 14, 'จังหวัด'],
    ['abroad', 'ก้าวสู่โลกกว้าง',       'ti-plane',           '#993556', [...s.countries].filter(c => c !== 'TH').length, 1, 'ประเทศ'],
    ['c10',    'พลเมืองโลก',          'ti-world',           '#534AB7', s.countries.size, 10, 'ประเทศ'],
    ['cont3',  'สามทวีป',            'ti-globe',           '#D85A30', s.continents.size, 3, 'ทวีป'],
    ['beach',  'นักล่าทะเล',          'ti-beach',           '#378ADD', n('beach') + n('island'), 10, 'ที่'],
    ['mtn',    'สายดอย',             'ti-mountain',        '#1D9E75', n('mountain') + n('viewpoint'), 5, 'ที่'],
    ['temple', 'สายบุญ',             'ti-building-castle', '#D85A30', n('temple'), 10, 'ที่'],
    ['food',   'สายกิน',             'ti-coffee',          '#BA7517', n('food') + n('cafe') + n('market'), 10, 'ที่'],
    ['camp',   'สายแคมป์',            'ti-tent',            '#639922', n('nature') + n('camping') + n('waterfall'), 5, 'ที่'],
    ['trip5',  'นักจัดทริป',          'ti-route',           '#993C1D', S.trips.length, 5, 'ทริป'],
    ['dream',  'ฝันเป็นจริง',          'ti-heart',           '#D4537E', visited().filter(p => p.fromWish).length, 1, 'ที่'],
    ['j1',     'นักบันทึก',           'ti-notebook',        '#185FA5', S.journal.length, 1, 'บันทึก'],
    ['j20',    'นักเขียนการเดินทาง',    'ti-feather',         '#534AB7', S.journal.length, 20, 'บันทึก'],
    ['pins50', 'นักเดินทางตัวจริง',     'ti-backpack',        '#993556', s.places, 50, 'ที่'],
  ].map(([id, name, icon, color, have, need, unit]) => ({ id, name, icon, color, have, need, unit, done: have >= need }));
}

function barRow(label, value, max, color, right) {
  return `<div class="bar-row" style="--c:${color}">
      <div class="top"><span>${label}</span><span class="muted">${right ?? value}</span></div>
      <div class="bar"><div style="width:${max ? Math.min(100, value / max * 100) : 0}%"></div></div>
    </div>`;
}

function renderPassport() {
  const s = S.stats;
  const badges = computeBadges();
  const earned = badges.filter(b => b.done).length;
  let html = recapTeaser() + `
    <div class="stats">
      <div class="stat"><div class="l">จังหวัด</div><div class="v">${s.provinces.size}<small>/77</small></div></div>
      <div class="stat"><div class="l">ภาค</div><div class="v">${s.regions.size}<small>/6</small></div></div>
      <div class="stat"><div class="l">ประเทศ</div><div class="v">${s.countries.size}</div></div>
      <div class="stat"><div class="l">สถานที่</div><div class="v">${s.places}</div></div>
      <div class="stat"><div class="l">ไดอารี่</div><div class="v">${S.journal.length}<small> บันทึก</small></div></div>
      <div class="stat"><div class="l">ระยะทาง</div><div class="v">${fmtKm(s.km)}<small> กม.</small></div></div>
    </div>
    <h2>แสตมป์ <span class="muted small">${earned}/${badges.length}</span></h2>
    <div class="badges">${badges.map(b => `
      <div class="badge ${b.done ? '' : 'locked'}" style="--c:${b.color}">
        <div class="st"><i class="ti ${b.done ? b.icon : 'ti-lock'}"></i></div>
        <div class="n">${b.name}</div>
        <div class="p">${b.done ? 'ได้แล้ว' : `${Math.min(b.have, b.need)}/${b.need} ${b.unit}`}</div>
      </div>`).join('')}</div>`;

  if (GEO.provinces.length) {
    html += `<h2>รายภาค</h2><div class="bars">${Object.entries(REGIONS).map(([k, label]) => {
      const total = Object.values(GEO.provinceRegion).filter(x => x === k).length;
      const done = [...s.provinces].filter(n => GEO.provinceRegion[n] === k).length;
      return barRow(label, done, total, '#1D9E75', `${done}/${total}`);
    }).join('')}</div>`;
  }

  if (s.places) {
    const years = Object.entries(s.byYear).sort((a, b) => b[0].localeCompare(a[0]));
    const maxY = Math.max(...years.map(y => y[1]));
    html += `<h2>รายปี</h2><div class="bars">${years.map(([y, n]) => barRow(`พ.ศ. ${+y + 543}`, n, maxY, '#378ADD', `${n} ที่`)).join('')}</div>`;

    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    html += `<h2>ประเภทที่ไปบ่อย</h2><div class="bars">${cats.map(([k, n]) => {
      const c = cat(k);
      return barRow(`<i class="ti ${c.icon}"></i> ${c.label}`, n, s.places, c.color, `${n} ที่`);
    }).join('')}</div>`;

    const top = Object.entries(s.provCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length) {
      html += `<h2>จังหวัดที่ไปบ่อย</h2><div class="bars">${top.map(([n, c]) => barRow(esc(n), c, top[0][1], '#0F6E56', `${c} ที่`)).join('')}</div>`;
    }
    const abroad = Object.entries(s.countryCount).sort((a, b) => b[1] - a[1]);
    if (abroad.length) {
      html += `<h2>ประเทศ <span class="muted small">${s.continents.size} ทวีป</span></h2>
        <div class="chips static">${abroad.map(([iso, n]) => `<span class="chip">${esc(countryName(iso))} · ${n}</span>`).join('')}</div>`;
    }
    if (s.avgRating) html += `<p class="muted small" style="margin-top:18px">คะแนนความประทับใจเฉลี่ย ${s.avgRating.toFixed(1)} ดาว</p>`;
  }
  $('#passport').innerHTML = html;
}

/* ---------- settings ---------- */
function applyTheme() {
  const t = Prefs.get('theme', 'system');
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

ACTIONS.settings = async () => {
  const theme = Prefs.get('theme', 'system');
  let used = '', persisted = false;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      used = (est.usage / 1048576).toFixed(1) + ' MB';
    }
    if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted();
  } catch { /* ignore */ }
  const hasDemo = S.pins.some(p => p.demo) || S.trips.some(t => t.demo) || S.journal.some(j => j.demo);
  openSheet(`
    ${sheetHead('ตั้งค่า')}
    <div class="field"><span class="label">ธีม</span>
      <div class="seg wide">
        ${[['system', 'ตามเครื่อง'], ['light', 'สว่าง'], ['dark', 'มืด']].map(([k, l]) =>
          `<button data-action="set-theme" data-v="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </div>
    <h3>ข้อมูลของคุณ</h3>
    <p class="muted small">${S.pins.length} หมุด · ${S.trips.length} ทริป · ${S.journal.length} ไดอารี่${used ? ` · ใช้พื้นที่ ${used}` : ''}<br>
      ข้อมูลทั้งหมดเก็บในเบราว์เซอร์ของเครื่องนี้เท่านั้น ไม่ได้ส่งขึ้นเซิร์ฟเวอร์ ควรส่งออกไฟล์เก็บไว้เป็นระยะ</p>
    ${persisted ? '<p class="small" style="color:var(--accent)"><i class="ti ti-shield-check"></i> เบราว์เซอร์จะไม่ลบข้อมูลนี้อัตโนมัติ</p>'
      : '<button class="btn block" data-action="persist"><i class="ti ti-shield"></i> ขอให้เบราว์เซอร์เก็บข้อมูลถาวร</button>'}
    <div class="row" style="margin-bottom:8px">
      <button class="btn" data-action="export"><i class="ti ti-download"></i> ส่งออก</button>
      <label class="btn"><i class="ti ti-upload"></i> นำเข้า<input type="file" id="file-import" accept="application/json,.json" hidden></label>
    </div>
    ${hasDemo ? '<button class="btn block" data-action="remove-demo"><i class="ti ti-eraser"></i> ลบข้อมูลตัวอย่าง</button>'
      : '<button class="btn block" data-action="load-demo"><i class="ti ti-sparkles"></i> โหลดข้อมูลตัวอย่าง</button>'}
    <button class="btn block danger" data-action="wipe"><i class="ti ti-trash"></i> ลบข้อมูลทั้งหมด</button>
    <h3>เกี่ยวกับ</h3>
    <p class="muted small">รอยเท้า เวอร์ชัน ${APP_VERSION}<br>
      แผนที่ © OpenStreetMap contributors · ขอบเขตจังหวัดจาก OpenGISData-Thailand · ขอบเขตประเทศจาก Natural Earth</p>`);
};
ACTIONS['set-theme'] = el => {
  Prefs.set('theme', el.dataset.v);
  applyTheme();
  $$('[data-action="set-theme"]').forEach(b => b.classList.toggle('on', b === el));
};
ACTIONS.persist = async () => {
  let ok = false;
  try { ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { /* ignore */ }
  toast(ok ? 'เบราว์เซอร์จะเก็บข้อมูลถาวรแล้ว' : 'เบราว์เซอร์ยังไม่อนุญาต ลองเพิ่มแอพลงหน้าจอหลักก่อน', 3500);
  if (ok) ACTIONS.settings();
};

ACTIONS.export = () => {
  const data = { app: 'footprint', version: 3, exportedAt: new Date().toISOString(), pins: S.pins, trips: S.trips, journal: S.journal };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `footprint-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('ส่งออกไฟล์สำรองแล้ว');
};

document.addEventListener('change', async e => {
  if (e.target.id !== 'file-import') return;
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== 'footprint' || !Array.isArray(data.pins)) throw new Error('bad');
    const pins = data.pins.map(normPin).filter(Boolean);
    const trips = (Array.isArray(data.trips) ? data.trips : []).map(normTrip).filter(Boolean);
    const journal = (Array.isArray(data.journal) ? data.journal : []).map(normJournal).filter(Boolean);
    await DB.putMany('trips', trips);
    await DB.putMany('pins', pins);
    await DB.putMany('journal', journal);
    S.pins = (await DB.all('pins')).map(normPin).filter(Boolean);
    S.trips = (await DB.all('trips')).map(normTrip).filter(Boolean);
    S.journal = (await DB.all('journal')).map(normJournal).filter(Boolean);
    await backfillLocations();
    closeSheet();
    renderAll();
    toast(`นำเข้า ${pins.length} หมุด ${trips.length} ทริป ${journal.length} ไดอารี่แล้ว`, 3000);
  } catch {
    toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอพรอยเท้า', 3200);
  }
});

ACTIONS.wipe = async () => {
  if (!confirm('ลบหมุด ทริป และไดอารี่ทั้งหมดใช่ไหม? กู้คืนไม่ได้ ถ้ายังไม่ได้ส่งออกไฟล์สำรอง ให้กดยกเลิกก่อน')) return;
  if (!confirm('ยืนยันอีกครั้ง: ลบข้อมูลทั้งหมดในเครื่องนี้')) return;
  await DB.clear('pins');
  await DB.clear('trips');
  await DB.clear('journal');
  S.pins = []; S.trips = []; S.journal = [];
  S.filter = { year: 'all', cats: [], trip: 'all', wish: true };
  clearRoute();
  closeSheet();
  renderAll();
  toast('ลบข้อมูลทั้งหมดแล้ว');
};

/* ---------- share card ---------- */
let shareCanvas = null;
async function makeShareCard() {
  try {
    await Promise.all([document.fonts.load('600 60px "Noto Sans Thai"'), document.fonts.load('400 30px "Noto Sans Thai"')]);
  } catch { /* fall back to system font */ }
  const W = 1080, H = 1350, F = '"Noto Sans Thai", sans-serif';
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const s = S.stats;
  c.fillStyle = '#f6f5f0'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#0F6E56'; c.font = `600 64px ${F}`; c.fillText('รอยเท้าของฉัน', 70, 130);
  c.fillStyle = '#6b6a64'; c.font = `400 30px ${F}`; c.fillText(`อัปเดต ${fmtDate(today())}`, 72, 180);

  if (GEO.provinces.length) {
    const box = { x: 50, y: 225, w: 580, h: 1050 };
    const [minX, minY, maxX, maxY] = [97.3, 5.55, 105.7, 20.5];
    const kx = Math.cos(13 * Math.PI / 180);
    const sc = Math.min(box.w / ((maxX - minX) * kx), box.h / (maxY - minY));
    const ox = box.x + (box.w - (maxX - minX) * kx * sc) / 2;
    const P = ([x, y]) => [ox + (x - minX) * kx * sc, box.y + (maxY - y) * sc];
    c.lineWidth = 1.5; c.strokeStyle = '#f6f5f0';
    for (const f of GEO.provinces) {
      const n = s.provCount[f.properties.pro_th] || 0;
      c.fillStyle = n ? (n >= 3 ? '#0F6E56' : '#1D9E75') : '#dedbd1';
      c.beginPath();
      for (const poly of f.polys) for (const ring of poly) {
        ring.forEach((pt, i) => { const [X, Y] = P(pt); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
        c.closePath();
      }
      c.fill('evenodd');
      c.stroke();
    }
  }

  const earned = computeBadges().filter(b => b.done).length;
  const items = [
    [s.provinces.size, 'จาก 77 จังหวัด'],
    [`${s.regions.size}/6`, 'ภาค'],
    [s.places, 'สถานที่'],
    [s.countries.size, 'ประเทศ'],
    [fmtKm(s.km), 'กม. โดยประมาณ'],
    [earned, 'แสตมป์'],
  ];
  let y = 320;
  for (const [v, l] of items) {
    c.fillStyle = '#22221f'; c.font = `600 84px ${F}`; c.fillText(String(v), 670, y);
    c.fillStyle = '#6b6a64'; c.font = `400 32px ${F}`; c.fillText(l, 672, y + 46);
    y += 170;
  }
  c.fillStyle = '#9b9a93'; c.font = `400 26px ${F}`; c.fillText('บันทึกด้วยแอพรอยเท้า', 70, H - 46);
  return cv;
}

let shareFile = null;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const canShareFile = f => { try { return !!(f && navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch { return false; } };

ACTIONS['share-card'] = async () => {
  openSheet(`${sheetHead('รูปสรุปการเดินทาง')}<p class="muted">กำลังสร้างรูป…</p>`);
  shareCanvas = await makeShareCard();
  // Build the file up front: iPhone only allows share() straight from a tap, not after waiting for toBlob.
  const blob = await new Promise(r => shareCanvas.toBlob(r, 'image/png'));
  shareFile = blob && new File([blob], `footprint-${today()}.png`, { type: 'image/png' });
  const canShare = canShareFile(shareFile);
  openSheet(`
    ${sheetHead('รูปสรุปการเดินทาง')}
    <img class="share-img" src="${URL.createObjectURL(blob)}" alt="รูปสรุปการเดินทาง">
    <div class="row">
      <button class="btn" data-action="save-card"><i class="ti ti-download"></i> บันทึกรูป</button>
      ${canShare ? '<button class="btn primary" data-action="send-card"><i class="ti ti-share"></i> แชร์</button>' : ''}
    </div>
    <p class="muted small" style="text-align:center;margin:10px 0 0">บันทึกไม่ได้? กดค้างที่รูปแล้วเลือก "บันทึกรูปภาพ"</p>`);
};
ACTIONS['save-card'] = async () => {
  if (!shareFile) return;
  // iPhone home-screen apps can't download files; its share sheet has "Save Image" instead.
  if (isIOS() && canShareFile(shareFile)) {
    try { await navigator.share({ files: [shareFile] }); } catch { /* cancelled */ }
    return;
  }
  const url = URL.createObjectURL(shareFile);
  const a = document.createElement('a');
  a.href = url;
  a.download = shareFile.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('บันทึกรูปแล้ว ดูได้ในโฟลเดอร์ดาวน์โหลด', 3000);
};
ACTIONS['send-card'] = async () => {
  if (!canShareFile(shareFile)) return ACTIONS['save-card']();
  try { await navigator.share({ files: [shareFile], title: 'รอยเท้าของฉัน' }); } catch { /* cancelled */ }
};

/* ---------- welcome + demo ---------- */
function showWelcome() {
  openSheet(`
    <div class="welcome">
      <div class="welcome-icon"><i class="ti ti-map-pin"></i></div>
      <h1>ยินดีต้อนรับสู่รอยเท้า</h1>
      <p class="muted">บันทึกทุกที่ที่เคยไป แล้วดูแผนที่ค่อยๆ เต็มไปด้วยสี</p>
      <ul class="tips">
        <li><i class="ti ti-hand-finger"></i><div><b>แตะบนแผนที่</b><br><span class="muted small">ปักหมุดที่ที่ไปมาแล้ว หรือเก็บไว้ในรายการที่อยากไป</span></div></li>
        <li><i class="ti ti-photo-plus"></i><div><b>ปักหมุดจากรูป</b><br><span class="muted small">แอพอ่านพิกัดและวันที่จากรูปที่ถ่ายด้วยมือถือให้</span></div></li>
        <li><i class="ti ti-route"></i><div><b>รวมเป็นทริป</b><br><span class="muted small">ดูเส้นทางและระยะทางของแต่ละทริปบนแผนที่</span></div></li>
        <li><i class="ti ti-award"></i><div><b>สะสมแสตมป์</b><br><span class="muted small">ไปครบจังหวัด ครบภาค หรือไปต่างประเทศ ได้แสตมป์เพิ่ม</span></div></li>
      </ul>
      <div class="row">
        <button class="btn" data-action="load-demo">ดูข้อมูลตัวอย่าง</button>
        <button class="btn primary" data-action="close-sheet">เริ่มเลย</button>
      </div>
    </div>`);
  Prefs.set('welcomed', true);
}

ACTIONS['load-demo'] = async () => {
  const tA = normTrip({ id: 'demo-trip-north', name: 'เหนือหน้าหนาว', start: '2025-12-12', end: '2025-12-16', note: 'ทริปแรกกับเพื่อนสนิท', demo: true });
  const tB = normTrip({ id: 'demo-trip-south', name: 'ทะเลใต้สงกรานต์', start: '2026-04-10', end: '2026-04-13', demo: true });
  const rows = [
    ['วัดพระธาตุดอยสุเทพ', 18.8049, 98.9216, 'temple', '2025-12-12', 5, tA.id, 'ขึ้นบันไดนาคตอนเช้า วิวเมืองเชียงใหม่สวยมาก'],
    ['ดอยอินทนนท์', 18.5883, 98.4867, 'mountain', '2025-12-14', 5, tA.id, 'ตื่นตีสี่มาดูทะเลหมอก หนาว 6 องศา แต่คุ้มสุดๆ'],
    ['ปาย', 19.3586, 98.4403, 'nature', '2025-12-16', 4, tA.id, ''],
    ['เขาใหญ่', 14.4392, 101.3725, 'nature', '2026-01-20', 4, '', 'เจอช้างป่าข้างทาง'],
    ['วัดไชยวัฒนาราม อยุธยา', 14.343, 100.5419, 'temple', '2026-02-08', 5, '', 'ไปตอนพระอาทิตย์ตก'],
    ['ศาลเจ้าฟูชิมิอินาริ', 34.9671, 135.7727, 'temple', '2026-03-20', 5, '', 'ประตูโทริอิเป็นพันต้น'],
    ['หาดป่าตอง', 7.8961, 98.2966, 'beach', '2026-04-10', 3, tB.id, ''],
    ['เมืองเก่าภูเก็ต', 7.8847, 98.388, 'food', '2026-04-11', 5, tB.id, 'หมี่ฮกเกี้ยนอร่อยมาก'],
    ['เกาะพีพี', 7.7407, 98.7784, 'beach', '2026-04-12', 5, tB.id, 'น้ำใสมาก ดำน้ำตื้นเห็นปลาเยอะ'],
    ['เยาวราช', 13.7398, 100.5094, 'food', '2026-06-01', 4, '', ''],
    ['ภูทับเบิก', 16.897, 101.098, 'mountain', '2026-08-15', 4, '', ''],
  ];
  const pins = rows.map(([name, lat, lng, category, date, rating, tripId, note], i) =>
    normPin(newPin(lat, lng, { id: 'demo-' + i, name, category, date, rating, tripId, note, demo: true })));
  const wishRows = [['เกาะหลีเป๊ะ', 6.4881, 99.3047, 'beach'], ['สะพานมอญ สังขละบุรี', 15.158, 98.453, 'city'], ['บลูลากูน ไอซ์แลนด์', 63.8804, -22.4495, 'nature']];
  wishRows.forEach(([name, lat, lng, category], i) =>
    pins.push(normPin(newPin(lat, lng, { id: 'demo-w' + i, name, category, status: 'wish', date: '', demo: true }))));
  const lastYear = String(new Date().getFullYear() - 1);
  const entries = [
    { id: 'demo-j0', date: '2025-12-14', title: 'ทะเลหมอกครั้งแรก', mood: 'great', weather: 'cold', tripId: tA.id, pinIds: ['demo-1'],
      body: 'ตื่นตีสี่ ขับรถขึ้นดอยตอนยังมืด ลมแรงจนมือชา\n\nพอฟ้าเริ่มสว่าง ทะเลหมอกค่อยๆ โผล่มาใต้ภูเขา ทุกคนเงียบไปพร้อมกัน เป็นวินาทีที่อยากจำไว้ตลอดไป\n\nกาแฟร้อนแก้วนั้นอร่อยที่สุดในชีวิต' },
    { id: 'demo-j1', date: '2026-01-20', title: 'เจอช้างป่ากลางถนน', mood: 'good', weather: 'cloud', tripId: '', pinIds: ['demo-3'],
      body: 'ขับรถชมวิวอยู่ดีๆ ช้างป่าตัวใหญ่เดินออกมาจากป่า ต้องจอดรอเกือบครึ่งชั่วโมง ตื่นเต้นมาก' },
    { id: 'demo-j2', date: '2026-04-12', title: 'วันที่น้ำใสที่สุด', mood: 'great', weather: 'sun', tripId: tB.id, pinIds: ['demo-8'],
      body: 'นั่งเรือหางยาวไปเกาะพีพี น้ำใสจนเห็นปลาจากบนเรือ ดำน้ำตื้นจนตัวลอก\n\nถ้ามาอีกต้องค้างบนเกาะสักคืน' },
    { id: 'demo-j3', date: `${lastYear}-${today().slice(5)}`, title: 'เริ่มวางแผนทริปเหนือ', mood: 'good', weather: '', tripId: '', pinIds: [],
      body: 'นั่งไล่ดูรูปทะเลหมอกในอินเทอร์เน็ตทั้งคืน ตัดสินใจแล้วว่าธันวาคมนี้ต้องไปให้ได้' },
  ].map(e => normJournal({ ...e, demo: true }));
  await DB.putMany('trips', [tA, tB]);
  await DB.putMany('pins', pins);
  await DB.putMany('journal', entries);
  [tA, tB].forEach(t => upsert(S.trips, t));
  pins.forEach(p => upsert(S.pins, p));
  entries.forEach(e => upsert(S.journal, e));
  closeSheet();
  renderAll();
  switchView('map');
  toast('โหลดข้อมูลตัวอย่างแล้ว ลบได้ในหน้าตั้งค่า', 3200);
};

ACTIONS['remove-demo'] = async () => {
  const demoPins = S.pins.filter(p => p.demo), demoTrips = S.trips.filter(t => t.demo);
  const demoTripIds = new Set(demoTrips.map(t => t.id));
  const orphaned = S.pins.filter(p => !p.demo && demoTripIds.has(p.tripId));
  orphaned.forEach(p => { p.tripId = ''; });
  if (orphaned.length) await DB.putMany('pins', orphaned);
  const keptEntries = S.journal.filter(j => !j.demo && demoTripIds.has(j.tripId));
  keptEntries.forEach(j => { j.tripId = ''; });
  if (keptEntries.length) await DB.putMany('journal', keptEntries);
  for (const p of demoPins) await DB.del('pins', p.id);
  for (const t of demoTrips) await DB.del('trips', t.id);
  for (const j of S.journal.filter(j => j.demo)) await DB.del('journal', j.id);
  S.pins = S.pins.filter(p => !p.demo);
  S.trips = S.trips.filter(t => !t.demo);
  S.journal = S.journal.filter(j => !j.demo);
  if (demoTripIds.has(S.filter.trip)) S.filter.trip = 'all';
  if (demoTripIds.has(S.routeTrip)) clearRoute();
  closeSheet();
  renderAll();
  toast('ลบข้อมูลตัวอย่างแล้ว');
};
