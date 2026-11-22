'use strict';
/* Screens: timeline, detail sheets, passport/stats, photo viewer, settings, share card, demo data. */

function renderAll() {
  S.stats = computeStats();
  renderMap();
  renderTimeline();
  renderJournal();
  renderPassport();
  ensureThumbs();
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
  if (p.photos[0]) return `<img src="${thumb(p.photos[0])}" alt="" loading="lazy" decoding="async">`;
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
  const segs = [['places', 'สถานที่', visited().length], ['trips', 'ทริป', doneTrips().length], ['wish', 'อยากไป', wishes().length]];
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
    const trips = doneTrips().sort((a, b) => (tripRange(b).start || '9').localeCompare(tripRange(a).start || '9'));
    el.innerHTML = `<button class="btn block" data-action="new-trip"><i class="ti ti-plus"></i> สร้างทริป</button>` +
      (trips.length ? trips.map(tripCard).join('')
        : `<div class="empty"><i class="ti ti-route"></i>ยังไม่มีทริป<br>รวมหลายที่ที่ไปในครั้งเดียวกันเป็นทริป แล้วดูเส้นทางบนแผนที่ได้</div>`);
  } else {
    const list = wishes().sort((a, b) => b.createdAt - a.createdAt);
    const plans = planTrips().sort((a, b) => (tripRange(a).start || '9').localeCompare(tripRange(b).start || '9'));
    el.innerHTML = `
      <div class="sec-title"><i class="ti ti-map-route"></i> ทริปที่วางแผนไว้</div>
      ${plans.map(tripCard).join('')}
      <button class="btn block" data-action="new-plan"><i class="ti ti-plus"></i> วางแผนทริปใหม่</button>
      <div class="sec-title"><i class="ti ti-heart"></i> ที่อยากไป</div>` + (list.length
      ? `<p class="muted small" style="margin-top:0">ไปถึงแล้วเมื่อไหร่ เปิดหมุดแล้วกด "ไปมาแล้ว" ได้เลย</p>${list.map(p => placeItem(p)).join('')}`
      : `<div class="empty"><i class="ti ti-heart"></i>ยังไม่มีที่อยากไป<br>แตะบนแผนที่ แล้วเลือก "เพิ่มในที่อยากไป"</div>`);
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
  const ps = tripStops(t.id);
  return {
    ps,
    provinces: new Set(ps.map(p => p.province).filter(Boolean)).size,
    countries: new Set(ps.map(p => p.country).filter(Boolean)).size,
    km: (cachedRoad(t.id) || {}).km ?? pathKm(ps),
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
        <div class="s">${t.plan ? '<i class="ti ti-calendar-event"></i> ' : ''}${esc(fmtRange(r.start, r.end) || (t.plan ? 'ยังไม่กำหนดวัน' : 'ยังไม่มีวันที่'))}</div>
        <div class="s">${st.ps.length} ที่ · ${t.plan ? '' : where + ' · '}${fmtKm(st.km)} กม.${t.plan && st.ps.length ? ` · ไปแล้ว ${st.ps.filter(p => p.status !== 'wish').length}` : ''}</div>
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
        `<img src="${thumb(src)}" alt="" decoding="async" data-action="view-photo" data-id="${p.id}" data-i="${i}">`).join('')}</div>` : ''}

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
    <div class="muted">${t.plan ? `<span class="plan-tag"><i class="ti ti-map-route"></i> วางแผนไว้</span> ` : ''}${esc(fmtRange(r.start, r.end) || (t.plan ? 'ยังไม่กำหนดวัน' : 'ยังไม่มีวันที่'))}</div>
    ${t.plan ? nextStopCard(t, st.ps) : ''}
    <div class="trip-stats">
      <div><b>${st.ps.length}</b><span>สถานที่</span></div>
      <div><b>${st.countries > 1 ? st.countries : st.provinces}</b><span>${st.countries > 1 ? 'ประเทศ' : 'จังหวัด'}</span></div>
      <div id="trip-road" data-id="${t.id}"><b>${fmtKm(st.km)}</b><span>กม. โดยประมาณ</span></div>
    </div>
    ${st.ps.length > 1 ? `<div class="road-row" id="trip-road-row">
      <span class="road-info"></span>
      <button class="rt-btn" data-action="toggle-roundtrip" data-id="${t.id}" aria-pressed="false"><i class="ti ti-arrows-exchange"></i> ไป-กลับ</button>
    </div>` : ''}
    ${t.note ? `<div class="note">${esc(t.note)}</div>` : ''}
    ${t.plan && st.ps.length ? `<button class="btn block" data-action="plan-finish" data-id="${t.id}"><i class="ti ti-circle-check"></i> ${st.ps.some(p => p.status !== 'wish') ? 'จบทริป' : 'ไปทริปนี้มาแล้ว'}</button>` : ''}
    ${st.ps.length > 0 ? `<button class="btn ${t.plan ? '' : 'primary'} block" data-action="show-route" data-id="${t.id}" ${t.plan ? 'style="margin-top:8px"' : ''}><i class="ti ti-route"></i> ดูเส้นทางบนแผนที่</button>` : ''}
    ${t.plan ? planStops(t, st.ps) : st.ps.length ? st.ps.map((p, i) => placeItem(p, `<span class="num">${i + 1}</span>`)).join('')
      : '<p class="muted small">ยังไม่มีหมุดในทริปนี้ ตอนปักหมุดให้เลือกทริปนี้ในช่อง "ทริป"</p>'}
    ${t.plan ? '' : `<h3>ไดอารี่ของทริปนี้</h3>
    ${journalLinks(S.journal.filter(j => j.tripId === t.id), `data-trip="${t.id}"`)}`}
    <div class="row" style="margin-top:8px">
      <button class="btn danger" data-action="delete-trip" data-id="${t.id}"><i class="ti ti-trash"></i> ลบทริป</button>
      <button class="btn" data-action="edit-trip" data-id="${t.id}"><i class="ti ti-edit"></i> แก้ไข</button>
    </div>`);
  fillTripRoad(t.id);
}
ACTIONS['open-trip'] = el => openTripDetail(el.dataset.id);

/* During a planned trip: the next place in order, with "arrived", "skip" and directions. */
function nextStopCard(t, ps) {
  const next = ps.find(p => p.status === 'wish');
  if (!next) return '';
  const done = ps.filter(p => p.status !== 'wish').length, n = ps.indexOf(next) + 1;
  const last = S.lastArrived && S.lastArrived.trip === t.id && pinById(S.lastArrived.pin);
  const left = ps.filter(p => p.status === 'wish').length;
  return `
    <div class="next-card">
      <div class="nc-bar"><div style="width:${Math.round(done / ps.length * 100)}%"></div></div>
      <div class="nc-head">${done ? `ไปแล้ว ${done}/${ps.length} · ที่ต่อไป` : 'ที่แรกของทริป'}</div>
      <div class="nc-place"><span class="num">${n}</span><b>${esc(next.name)}</b></div>
      <div class="nc-btns">
        <button class="btn primary" data-action="arrive" data-id="${next.id}"><i class="ti ti-map-pin-check"></i> ถึงแล้ว</button>
        <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${next.lat},${next.lng}" target="_blank" rel="noopener"><i class="ti ti-navigation"></i> นำทาง</a>
        ${left > 1 ? `<button class="btn" data-action="skip-stop" data-id="${next.id}" aria-label="ข้ามไปก่อน"><i class="ti ti-player-skip-forward"></i></button>` : ''}
      </div>
      ${last ? `<button class="nc-last" data-action="edit-pin" data-id="${last.id}"><i class="ti ti-camera-plus"></i> เพิ่งถึง ${esc(last.name)} · ใส่รูปหรือรีวิว</button>` : ''}
    </div>`;
}
/* Arrived: mark this place visited today, straight away (photos and a review can be added after). */
ACTIONS['arrive'] = async el => {
  const p = pinById(el.dataset.id), tripId = p.tripId;
  const before = snapshot();
  Object.assign(p, { status: 'visited', date: today(), fromWish: true, updatedAt: Date.now() });
  await DB.put('pins', p);
  S.lastArrived = { trip: tripId, pin: p.id };
  const finished = await settlePlans();
  renderAll();
  reopenTrip(tripId);
  const badge = computeBadges().find(b => b.done && !before.badges.has(b.id));
  if (finished) toast(`ครบทุกที่แล้ว! ย้าย "${finished.name}" ไปอยู่ในทริปที่ไปแล้ว`, 3500);
  else toast(badge ? `ได้แสตมป์ใหม่: ${badge.name}` : `ถึง ${p.name} แล้ว`, 2600);
};
/* Skip for now: move this place to the end of the order. */
ACTIONS['skip-stop'] = async el => {
  const p = pinById(el.dataset.id), list = tripStops(p.tripId).filter(x => x !== p);
  list.push(p);
  await saveStopOrder(list);
  reopenTrip(p.tripId);
  toast(`ย้าย ${p.name} ไปไว้ท้ายสุด`);
};

/* Stops of a planned trip, with buttons to change the order. */
function planStops(t, ps) {
  const next = ps.find(p => p.status === 'wish');
  const rows = ps.map((p, i) => `
    <div class="stop ${p === next && ps.some(x => x.status !== 'wish') ? 'next' : ''}">
      ${placeItem(p, `<span class="num ${p.status !== 'wish' ? 'done' : ''}">${p.status !== 'wish' ? '<i class="ti ti-check"></i>' : i + 1}</span>`)}
      <div class="stop-move">
        <button data-action="stop-move" data-id="${p.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="เลื่อนขึ้น"><i class="ti ti-chevron-up"></i></button>
        <button data-action="stop-move" data-id="${p.id}" data-d="1" ${i === ps.length - 1 ? 'disabled' : ''} aria-label="เลื่อนลง"><i class="ti ti-chevron-down"></i></button>
      </div>
    </div>`).join('');
  return `${ps.length ? '' : '<p class="muted small">ยังไม่มีที่ในทริปนี้ เพิ่มจากรายการที่อยากไปได้เลย</p>'}
    ${rows}
    <div class="row plan-actions">
      <button class="btn" data-action="plan-add" data-id="${t.id}"><i class="ti ti-heart-plus"></i> เพิ่มที่อยากไป</button>
      ${ps.length > 2 ? `<button class="btn" data-action="plan-sort" data-id="${t.id}"><i class="ti ti-route-2"></i> เรียงให้ใกล้สุด</button>` : ''}
    </div>
    <p class="muted small">ที่ใหม่ที่ยังไม่อยู่ในรายการ ให้แตะบนแผนที่ เลือก "อยากไป" แล้วเลือกทริปนี้ในช่อง "ทริปที่วางแผนไว้"</p>`;
}

/* Re-numbers a planned trip's stops in the given order and saves them. */
async function saveStopOrder(list) {
  list.forEach((p, i) => { p.seq = i + 1; });
  await DB.putMany('pins', list);
}
function reopenTrip(id) {
  const sheet = $('#sheet'), top = sheet.scrollTop;
  openTripDetail(id);
  sheet.scrollTop = top;
  renderTimeline();
  if (S.routeTrip === id) showRoute(id, { keepView: true });
}
ACTIONS['stop-move'] = async el => {
  const p = pinById(el.dataset.id), list = tripStops(p.tripId), i = list.indexOf(p), j = i + +el.dataset.d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await saveStopOrder(list);
  reopenTrip(p.tripId);
};
/* Shortest order (straight-line), starting from the current first stop: nearest neighbour, then 2-opt. */
ACTIONS['plan-sort'] = async el => {
  const id = el.dataset.id, ps = tripStops(id);
  if (ps.length < 3) return;
  const rest = ps.slice(1), order = [ps[0]];
  while (rest.length) {
    const last = order[order.length - 1];
    let k = 0;
    rest.forEach((p, i) => { if (haversine(last, p) < haversine(last, rest[k])) k = i; });
    order.push(rest.splice(k, 1)[0]);
  }
  for (let improved = true, n = 0; improved && n < 50; n++) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
      const a = order[i - 1], b = order[i], c = order[j], d = order[j + 1];
      const before = haversine(a, b) + (d ? haversine(c, d) : 0), after = haversine(a, c) + (d ? haversine(b, d) : 0);
      if (after < before - 1e-6) { order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse()); improved = true; }
    }
  }
  const changed = order.some((p, i) => p !== ps[i]);
  await saveStopOrder(order);
  reopenTrip(id);
  toast(changed ? 'เรียงลำดับใหม่ให้ระยะทางสั้นลงแล้ว' : 'ลำดับนี้สั้นที่สุดแล้ว');
};
/* Pick wishes to put into a planned trip. */
let planPick = null;
ACTIONS['plan-add'] = el => {
  const t = tripById(el.dataset.id);
  const list = wishes().filter(p => p.tripId !== t.id).sort((a, b) => b.createdAt - a.createdAt);
  planPick = { id: t.id, sel: new Set() };
  openSheet(`
    ${sheetHead('เพิ่มเข้า ' + esc(t.name))}
    ${list.length ? `<p class="muted small" style="margin-top:0">แตะเลือกที่ที่จะไปในทริปนี้</p>
      ${list.map(p => {
        const other = p.tripId && tripById(p.tripId);
        return `<button class="item pick-item" data-action="plan-pick" data-id="${p.id}">${thumbHtml(p)}
          <div><div class="t">${esc(p.name)}</div><div class="s">${esc(placeLabel(p) || 'อยากไป')}${other ? ` · อยู่ใน ${esc(other.name)}` : ''}</div></div>
          <i class="ti ti-circle pick-mark"></i></button>`;
      }).join('')}
      <div class="row plan-pick-bar">
        <button class="btn" data-action="open-trip" data-id="${t.id}">ยกเลิก</button>
        <button class="btn primary" data-action="plan-add-save" id="plan-add-save" disabled>เพิ่ม</button>
      </div>`
    : `<div class="empty"><i class="ti ti-heart"></i>ไม่มีที่อยากไปที่ยังไม่อยู่ในทริปนี้<br>แตะบนแผนที่ แล้วเลือก "อยากไป" เพื่อเพิ่ม</div>
      <button class="btn block" data-action="open-trip" data-id="${t.id}">กลับไปที่ทริป</button>`}`);
};
ACTIONS['plan-pick'] = el => {
  const id = el.dataset.id, s = planPick.sel;
  s.has(id) ? s.delete(id) : s.add(id);
  el.classList.toggle('on', s.has(id));
  el.querySelector('.pick-mark').className = `ti ${s.has(id) ? 'ti-circle-check-filled' : 'ti-circle'} pick-mark`;
  const b = $('#plan-add-save');
  b.disabled = !s.size;
  b.textContent = s.size ? `เพิ่ม ${s.size} ที่` : 'เพิ่ม';
};
ACTIONS['plan-add-save'] = async () => {
  const { id, sel } = planPick;
  let seq = nextSeq(id);
  const ps = [...sel].map(pinById).filter(Boolean);
  ps.forEach(p => { p.tripId = id; p.seq = seq++; p.updatedAt = Date.now(); });
  await DB.putMany('pins', ps);
  planPick = null;
  renderAll();
  openTripDetail(id);
  toast(`เพิ่ม ${ps.length} ที่เข้าทริปแล้ว`);
};

/* "Been on this trip": one step that marks the places you went as visited, puts the ones you skipped
   back on the wish list, and moves the trip to the trips you've taken. */
let finishSel = null;
ACTIONS['plan-finish'] = el => {
  const t = tripById(el.dataset.id), ps = tripStops(t.id);
  const start = t.start && t.start <= today() ? t.start : today();
  const end = t.end && t.end >= start && t.end <= today() ? t.end : start;
  finishSel = { id: t.id, sel: new Set(ps.map(p => p.id)) };
  openSheet(`
    ${sheetHead('ไปทริปนี้มาแล้ว')}
    <div class="row">
      <div class="field"><label for="fin-start">ไปวันที่</label><input class="input" type="date" id="fin-start" value="${start}" max="${today()}"></div>
      <div class="field"><label for="fin-end">ถึงวันที่</label><input class="input" type="date" id="fin-end" value="${end}" max="${today()}"></div>
    </div>
    <p class="muted small" style="margin-top:0">ได้ไปที่ไหนบ้าง? ที่ไม่ได้ไปให้แตะเอาออก จะกลับไปอยู่ในรายการอยากไปเหมือนเดิม</p>
    ${ps.map(p => {
      const was = p.status !== 'wish';
      return `<button class="item pick-item on" ${was ? 'disabled' : `data-action="fin-pick" data-id="${p.id}"`}>${thumbHtml(p)}
        <div><div class="t">${esc(p.name)}</div><div class="s">${was ? `ไปแล้ว · ${fmtDate(p.date)}` : esc(placeLabel(p) || '')}</div></div>
        <i class="ti ti-circle-check-filled pick-mark"></i></button>`;
    }).join('')}
    <div class="err" id="fin-err" hidden>เลือกอย่างน้อย 1 ที่</div>
    <div class="row plan-pick-bar">
      <button class="btn" data-action="open-trip" data-id="${t.id}">ยกเลิก</button>
      <button class="btn primary" data-action="fin-save" id="fin-save">บันทึก ${ps.length} ที่</button>
    </div>`);
};
ACTIONS['fin-pick'] = el => {
  const id = el.dataset.id, s = finishSel.sel;
  s.has(id) ? s.delete(id) : s.add(id);
  el.classList.toggle('on', s.has(id));
  el.querySelector('.pick-mark').className = `ti ${s.has(id) ? 'ti-circle-check-filled' : 'ti-circle'} pick-mark`;
  $('#fin-save').textContent = `บันทึก ${s.size} ที่`;
  $('#fin-err').hidden = true;
};
ACTIONS['fin-save'] = async () => {
  const { id, sel } = finishSel, t = tripById(id), ps = tripStops(id);
  if (!sel.size) { $('#fin-err').hidden = false; return; }
  let start = $('#fin-start').value || today(), end = $('#fin-end').value || start;
  if (end < start) [start, end] = [end, start];
  const before = snapshot();
  const changed = [];
  for (const p of ps) {
    if (p.status !== 'wish') continue;
    if (sel.has(p.id)) Object.assign(p, { status: 'visited', date: start, fromWish: true });
    else Object.assign(p, { tripId: '', seq: 0 });
    p.updatedAt = Date.now();
    changed.push(p);
  }
  if (changed.length) await DB.putMany('pins', changed);
  Object.assign(t, { plan: false, start, end });
  await DB.put('trips', t);
  finishSel = null;
  renderAll();
  openTripDetail(id);
  const badge = computeBadges().find(b => b.done && !before.badges.has(b.id));
  toast(badge ? `ได้แสตมป์ใหม่: ${badge.name}` : `บันทึกทริป "${t.name}" แล้ว`, 3000);
};

/* Fills in the road distance and driving time on an open trip page (looked up in the background). */
function fillTripRoad(id) {
  const box = $('#trip-road'), row = $('#trip-road-row');
  if (!box || !row) return;
  const rt = roundTrip(), info = row.querySelector('.road-info'), btn = row.querySelector('.rt-btn');
  btn.classList.toggle('on', rt);
  btn.setAttribute('aria-pressed', String(rt));
  const paint = r => {
    if (!r || $('#trip-road') !== box || roundTrip() !== rt) return;
    box.innerHTML = `<b>${fmtKm(r.km)}</b><span>กม. ${rt ? 'ไป-กลับ' : r.roadKm ? 'ตามถนน' : 'เส้นตรง'}</span>`;
    if (r.roadKm) info.innerHTML = `<i class="ti ti-car"></i> ขับรถ ~${fmtDur(r.sec)}${r.flyKm ? ` <span class="muted">· เรือ/บิน ${fmtKm(r.flyKm)} กม.</span>` : ''}`;
    else if (r.failed) info.innerHTML = '<i class="ti ti-wifi-off"></i> คำนวณตามถนนไม่ได้ตอนนี้ แสดงเส้นตรงแทน';
    else info.innerHTML = '<i class="ti ti-plane"></i> ถนนไปไม่ถึง นับเป็นเส้นตรง (เรือ/บิน)';
  };
  const hit = cachedRoad(id, rt);
  if (hit) return paint(hit);
  info.innerHTML = '<i class="ti ti-loader-2 spin"></i> กำลังคำนวณตามถนน…';
  roadRoute(id, rt).then(r => { paint(r); renderTimeline(); });
}

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
/* Full-screen photos: swipe sideways to change, swipe down to close, pinch or double-tap to zoom,
   tap to hide the bars. */
const VW = { photos: [], i: 0, scale: 1, tx: 0, ty: 0 };
const vwImg = () => $('#viewer-track').children[VW.i]?.querySelector('img');
function vwZoom(s, tx = 0, ty = 0, anim = true) {
  const img = vwImg();
  if (!img) return;
  if (s > 1) {  // keep the zoomed photo covering the screen edges it can reach
    const mx = Math.max(0, (img.offsetWidth * s - innerWidth) / 2), my = Math.max(0, (img.offsetHeight * s - innerHeight) / 2);
    tx = Math.min(mx, Math.max(-mx, tx)); ty = Math.min(my, Math.max(-my, ty));
  } else { s = 1; tx = ty = 0; }
  Object.assign(VW, { scale: s, tx, ty });
  img.style.transition = anim ? 'transform .25s ease' : 'none';
  img.style.transform = s === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${s})`;
  $('#viewer').classList.toggle('zoomed', s > 1);
}
function vwTrack(dx = 0, anim = true) {
  const t = $('#viewer-track');
  t.style.transition = anim ? 'transform .32s cubic-bezier(.2, .8, .2, 1)' : 'none';
  t.style.transform = `translateX(calc(${-VW.i * 100}% + ${dx}px))`;
}
function showViewer(anim = true) {
  const n = VW.photos.length;
  $('#viewer-count').textContent = `${VW.i + 1} / ${n}`;
  $('#viewer-count').hidden = $('#viewer-prev').hidden = $('#viewer-next').hidden = n < 2;
  $('#viewer-bg').style.backgroundImage = `url('${VW.photos[VW.i]}')`;
  $$('#viewer-thumbs img').forEach((im, k) => im.classList.toggle('on', k === VW.i));
  const th = $('#viewer-thumbs').children[VW.i];
  if (th) th.parentNode.scrollTo({ left: th.offsetLeft - th.parentNode.clientWidth / 2 + th.offsetWidth / 2, behavior: anim ? 'smooth' : 'auto' });
  vwTrack(0, anim);
}
function stepViewer(d) {
  const n = VW.photos.length;
  if (n < 2) return;
  vwZoom(1, 0, 0, false);
  VW.i = (VW.i + d + n) % n;
  showViewer();
}
function openViewer(photos, i, cap) {
  Object.assign(VW, { photos, i, scale: 1, tx: 0, ty: 0 });
  $('#viewer-track').innerHTML = photos.map(s => `<div class="v-slide"><img src="${s}" alt="" draggable="false"></div>`).join('');
  $('#viewer-thumbs').innerHTML = photos.length > 1
    ? photos.map((s, k) => `<img src="${s}" alt="" data-action="viewer-go" data-i="${k}">`).join('') : '';
  $('#viewer-cap').innerHTML = cap;
  const v = $('#viewer');
  v.classList.remove('in', 'chrome-off', 'zoomed', 'dragging');
  v.style.removeProperty('--bg-o');
  v.hidden = false;
  showViewer(false);
  void v.offsetWidth;  // start the fade-in from the hidden state
  v.classList.add('in');
}
function closeViewer() {
  const v = $('#viewer');
  if (v.hidden || !v.classList.contains('in')) return;
  v.classList.remove('in');
  setTimeout(() => {
    v.hidden = true;
    v.classList.remove('dragging');
    v.style.removeProperty('--bg-o');
    $('#viewer-track').innerHTML = '';
  }, 230);
}
ACTIONS['view-photo'] = el => {
  const j = el.dataset.kind === 'journal', src = j ? journalById(el.dataset.id) : pinById(el.dataset.id);
  if (!src) return;
  const sub = j ? fmtDate(src.date) : [fmtDate(src.date), src.province ? 'จ.' + src.province : ''].filter(Boolean).join(' · ');
  openViewer(src.photos, +el.dataset.i || 0, `<b>${esc((j ? src.title : src.name) || '')}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`);
};
ACTIONS['viewer-close'] = () => closeViewer();
ACTIONS['viewer-prev'] = () => stepViewer(-1);
ACTIONS['viewer-next'] = () => stepViewer(1);
ACTIONS['viewer-go'] = el => stepViewer(+el.dataset.i - VW.i);
(() => {
  const v = $('#viewer');
  let g = null, lastTap = 0, tapTimer = 0, lastTouch = 0;
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const toggleChrome = () => v.classList.toggle('chrome-off');
  const zoomAt = (x, y) => {
    if (VW.scale > 1) return vwZoom(1);
    const s = 2.5, cx = x - innerWidth / 2, cy = y - innerHeight / 2;
    vwZoom(s, -cx * (s - 1), -cy * (s - 1));
  };
  v.addEventListener('touchstart', e => {
    lastTouch = Date.now();
    if (e.target.closest('button, .v-thumbs')) { g = null; return; }
    const t = e.touches;
    if (t.length === 2) {
      g = { mode: 'pinch', d0: dist(t[0], t[1]), s0: VW.scale, tx0: VW.tx, ty0: VW.ty,
        cx: (t[0].clientX + t[1].clientX) / 2 - innerWidth / 2, cy: (t[0].clientY + t[1].clientY) / 2 - innerHeight / 2 };
    } else if (t.length === 1) {
      g = { mode: '', x0: t[0].clientX, y0: t[0].clientY, t0: Date.now(), dx: 0, dy: 0, tx0: VW.tx, ty0: VW.ty };
    }
  }, { passive: true });
  v.addEventListener('touchmove', e => {
    if (!g) return;
    e.preventDefault();
    const t = e.touches;
    if (g.mode === 'pinch') {
      if (t.length < 2) return;
      const s = Math.min(4, Math.max(1, g.s0 * dist(t[0], t[1]) / g.d0)), k = s / g.s0;
      vwZoom(s, g.cx - (g.cx - g.tx0) * k, g.cy - (g.cy - g.ty0) * k, false);
      return;
    }
    g.dx = t[0].clientX - g.x0; g.dy = t[0].clientY - g.y0;
    if (!g.mode) {
      if (Math.hypot(g.dx, g.dy) < 8) return;
      g.mode = VW.scale > 1 ? 'pan' : Math.abs(g.dx) > Math.abs(g.dy) ? 'swipe' : g.dy > 0 ? 'down' : 'none';
      if (g.mode === 'down') v.classList.add('dragging');
    }
    if (g.mode === 'pan') vwZoom(VW.scale, g.tx0 + g.dx, g.ty0 + g.dy, false);
    else if (g.mode === 'swipe') vwTrack(VW.photos.length > 1 ? g.dx : g.dx / 4, false);
    else if (g.mode === 'down') {
      const p = Math.min(1, Math.max(0, g.dy) / 420), img = vwImg();
      img.style.transition = 'none';
      img.style.transform = `translate(${g.dx * .6}px, ${Math.max(0, g.dy)}px) scale(${1 - p * .3})`;
      v.style.setProperty('--bg-o', String(1 - p * .9));
    }
  }, { passive: false });
  const end = e => {
    if (!g) return;
    if (e.touches && e.touches.length) {  // a finger is still down
      if (g.mode === 'pinch' && e.touches.length === 1) g = null;
      return;
    }
    const G = g; g = null;
    const dt = Math.max(1, Date.now() - G.t0);
    if (G.mode === 'pinch') { if (VW.scale < 1.08) vwZoom(1); return; }
    if (G.mode === 'pan') return;
    if (G.mode === 'swipe') {
      if (VW.photos.length > 1 && (Math.abs(G.dx) > innerWidth * .2 || Math.abs(G.dx) / dt > .5)) stepViewer(G.dx < 0 ? 1 : -1);
      else vwTrack(0);
      return;
    }
    if (G.mode === 'down') {
      if (G.dy > 110 || (G.dy > 40 && G.dy / dt > .6)) { closeViewer(); return; }
      v.classList.remove('dragging');
      v.style.removeProperty('--bg-o');
      const img = vwImg();
      if (img) { img.style.transition = 'transform .25s ease'; img.style.transform = ''; }
      return;
    }
    if (G.mode || dt > 350) return;
    // a tap: double tap zooms, single tap hides/shows the bars
    const now = Date.now();
    if (now - lastTap < 300) { clearTimeout(tapTimer); lastTap = 0; zoomAt(G.x0, G.y0); }
    else { lastTap = now; tapTimer = setTimeout(toggleChrome, 300); }
  };
  v.addEventListener('touchend', end);
  v.addEventListener('touchcancel', end);
  // mouse: click outside the photo closes, double-click zooms
  v.addEventListener('click', e => {
    if (Date.now() - lastTouch < 800 || e.target.closest('button, .v-thumbs, .v-bottom')) return;
    if (e.target.tagName !== 'IMG' && VW.scale === 1) closeViewer();
  });
  v.addEventListener('dblclick', e => {
    if (Date.now() - lastTouch < 800 || e.target.tagName !== 'IMG') return;
    zoomAt(e.clientX, e.clientY);
  });
})();
document.addEventListener('keydown', e => {
  if (!$('#viewer').hidden) {
    if (e.key === 'Escape') closeViewer();
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
    ['trip5',  'นักจัดทริป',          'ti-route',           '#993C1D', doneTrips().length, 5, 'ทริป'],
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
  const tC = normTrip({ id: 'demo-trip-plan', name: 'กาญจน์ฯ วันหยุดยาว', plan: true, note: 'ไปกับครอบครัว ขับรถไปเอง', demo: true });
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
  const wishRows = [['เกาะหลีเป๊ะ', 6.4881, 99.3047, 'beach'], ['สะพานมอญ สังขละบุรี', 15.158, 98.453, 'city', 3], ['บลูลากูน ไอซ์แลนด์', 63.8804, -22.4495, 'nature'],
    ['สะพานข้ามแม่น้ำแคว', 14.0409, 99.5036, 'temple', 1], ['น้ำตกเอราวัณ', 14.3683, 99.1439, 'waterfall', 2]];
  wishRows.forEach(([name, lat, lng, category, seq], i) =>
    pins.push(normPin(newPin(lat, lng, { id: 'demo-w' + i, name, category, status: 'wish', date: '', demo: true, ...(seq ? { tripId: tC.id, seq } : {}) }))));
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
  await DB.putMany('trips', [tA, tB, tC]);
  await DB.putMany('pins', pins);
  await DB.putMany('journal', entries);
  [tA, tB, tC].forEach(t => upsert(S.trips, t));
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
