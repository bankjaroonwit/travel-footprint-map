'use strict';
/* Pin and trip forms, place search, photo import, filters. */

let draft = null;      // pin being edited
let tripDraft = null;  // trip being edited

function newPin(lat, lng, extra = {}) {
  const loc = locate(lat, lng);
  return {
    id: uid(), name: '', lat, lng, status: 'visited', date: today(),
    province: loc.province, country: loc.country, category: 'city', rating: 0,
    note: '', photos: [], tripId: '', fromWish: false, demo: false,
    createdAt: Date.now(), updatedAt: Date.now(),
    ...extra,
  };
}

function suggestTrip(date) {
  if (!isDate(date)) return '';
  const t = S.trips.find(t => { const r = tripRange(t); return r.start && date >= r.start && date <= r.end; });
  return t ? t.id : '';
}

function locText(d) {
  const parts = [];
  if (d.province) parts.push('จ.' + d.province);
  parts.push(countryName(d.country) || 'ไม่ทราบประเทศ');
  return parts.join(' · ');
}

/* ---------- pin form ---------- */
function openPinForm(p) {
  draft = JSON.parse(JSON.stringify(p));
  const d = draft;
  const isNew = !pinById(d.id);
  if (isNew && !d.tripId && d.status !== 'wish') d.tripId = suggestTrip(d.date);

  const countries = GEO.countryList.length ? [...GEO.countryList] : [];
  if (d.country && !countries.some(c => c.iso === d.country)) countries.unshift({ iso: d.country, name: countryName(d.country) });
  const provField = GEO.provinceNames.length
    ? `<select class="input" id="f-prov"><option value="">ไม่ระบุ</option>${GEO.provinceNames.map(n => `<option ${n === d.province ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`
    : `<input class="input" id="f-prov" value="${esc(d.province)}" placeholder="เชียงใหม่">`;
  const title = isNew ? (d.status === 'wish' ? 'เพิ่มที่อยากไป' : 'ปักหมุดใหม่') : 'แก้ไขหมุด';

  openSheet(`
    ${sheetHead(title)}
    <div id="pin-form" data-status="${d.status}">
      <div class="field">
        <div class="seg wide">
          <button type="button" data-action="f-status" data-v="visited" class="${d.status !== 'wish' ? 'on' : ''}"><i class="ti ti-check"></i> ไปมาแล้ว</button>
          <button type="button" data-action="f-status" data-v="wish" class="${d.status === 'wish' ? 'on' : ''}"><i class="ti ti-heart"></i> อยากไป</button>
        </div>
      </div>
      <div class="field">
        <label for="f-name">ชื่อสถานที่</label>
        <input class="input" id="f-name" value="${esc(d.name)}" placeholder="ดอยอินทนนท์" maxlength="120" autocomplete="off">
        <div class="err" id="f-name-err" hidden>ใส่ชื่อสถานที่ก่อน</div>
        <div class="near" id="f-near" hidden></div>
        ${isNew && !d.name ? '' : '<button type="button" class="link near-btn" data-action="f-near-load"><i class="ti ti-map-search"></i> ลืมชื่อ? ดูสถานที่แถวนี้</button>'}
      </div>
      <div class="loc-line"><i class="ti ti-map-pin"></i><span>${esc(locText(d))}</span>·<button type="button" class="link" data-action="f-move">เปลี่ยนตำแหน่ง</button></div>
      <div class="row">
        <div class="field v-only"><label for="f-date">วันที่ไป</label><input class="input" type="date" id="f-date" value="${esc(d.date)}" max="${today()}"></div>
        <div class="field"><label for="f-trip" id="f-trip-label">${d.status === 'wish' ? 'ทริปที่วางแผนไว้' : 'ทริป'}</label>
          <select class="input" id="f-trip">${tripOptions(d.status, d.tripId)}</select>
        </div>
      </div>
      <div class="field" id="f-trip-new-wrap" hidden>
        <label for="f-trip-new">ชื่อทริปใหม่</label>
        <input class="input" id="f-trip-new" placeholder="เหนือหน้าหนาว" maxlength="80">
        <div class="err" id="f-trip-new-err" hidden>ตั้งชื่อทริปก่อน</div>
      </div>
      <div class="row">
        <div class="field"><label for="f-country">ประเทศ</label>
          <select class="input" id="f-country">
            <option value="">ไม่ทราบ</option>
            ${countries.map(c => `<option value="${c.iso}" ${c.iso === d.country ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="prov-wrap" ${d.country === 'TH' ? '' : 'hidden'}><label for="f-prov">จังหวัด</label>${provField}</div>
      </div>
      <div class="field">
        <span class="label">ประเภท</span>
        <div class="chips">
          ${Object.entries(CATS).map(([k, c]) => `<button type="button" class="chip ${k === d.category ? 'on' : ''}" data-action="f-cat" data-v="${k}"><i class="ti ${c.icon}"></i>${c.label}</button>`).join('')}
        </div>
      </div>
      <div class="field v-only">
        <span class="label">ความประทับใจ</span>
        <div class="stars" id="f-stars">
          ${[1, 2, 3, 4, 5].map(i => `<button type="button" data-action="f-star" data-v="${i}" class="${i <= d.rating ? 'on' : ''}" aria-label="${i} ดาว">★</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span class="label">รูปภาพ</span>
        <div class="photos" id="f-photos"></div>
      </div>
      <div class="field">
        <label for="f-note">บันทึก</label>
        <textarea class="input" id="f-note" placeholder="เล่าสั้นๆ ว่าที่นี่เป็นยังไง">${esc(d.note)}</textarea>
      </div>
      <div class="row">
        <button class="btn" data-action="close-sheet">ยกเลิก</button>
        <button class="btn primary" data-action="save-pin">บันทึก</button>
      </div>
    </div>`);
  renderDraftPhotos();
  if (isNew && !d.name) loadNear(d.photos.length > 0);
}

/* Trip choices for a pin: a wish can only go into a planned trip; a visited place into any trip. */
function tripOptions(status, sel) {
  const byStart = (a, b) => (tripRange(b).start || '').localeCompare(tripRange(a).start || '');
  const opt = t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`;
  const plans = planTrips().sort(byStart), done = doneTrips().sort(byStart);
  let html = `<option value="">ไม่อยู่ในทริป</option>`;
  if (status === 'wish') html += plans.map(opt).join('');
  else {
    if (done.length) html += `<optgroup label="ทริปที่ไปแล้ว">${done.map(opt).join('')}</optgroup>`;
    if (plans.length) html += `<optgroup label="ทริปที่วางแผนไว้">${plans.map(opt).join('')}</optgroup>`;
  }
  return html + `<option value="__new">+ ${status === 'wish' ? 'วางแผนทริปใหม่' : 'สร้างทริปใหม่'}</option>`;
}

function renderDraftPhotos() {
  const box = $('#f-photos');
  if (!box) return;
  box.innerHTML = draft.photos.map((src, i) => `
      <div class="thumb"><img src="${src}" alt=""><button type="button" data-action="f-rm-photo" data-i="${i}" aria-label="ลบรูป"><i class="ti ti-x"></i></button></div>`).join('') +
    `<label class="add-photo"><i class="ti ti-photo-plus"></i>เพิ่มรูป<input type="file" id="f-files" accept="image/*" multiple hidden></label>`;
}

function collectForm() {
  if (!draft || !$('#pin-form')) return;
  const val = id => { const e = $('#' + id); return e ? e.value : null; };
  draft.name = (val('f-name') || '').trim();
  draft.date = val('f-date') || '';
  draft.country = val('f-country') ?? draft.country;
  draft.province = draft.country === 'TH' ? (val('f-prov') || '').trim() : '';
  draft.note = (val('f-note') || '').trim();
  draft.tripId = val('f-trip') ?? draft.tripId;
  draft._newTrip = (val('f-trip-new') || '').trim();
}

ACTIONS['f-status'] = el => {
  collectForm();
  draft.status = el.dataset.v;
  $('#pin-form').dataset.status = draft.status;
  const tr = $('#f-trip');
  if (tr) {
    const keep = draft.tripId === '__new' || draft.status !== 'wish' || isPlan(tripById(draft.tripId)) ? draft.tripId : '';
    tr.innerHTML = tripOptions(draft.status, keep);
    tr.value = keep;
    $('#f-trip-label').textContent = draft.status === 'wish' ? 'ทริปที่วางแผนไว้' : 'ทริป';
    $('#f-trip-new-wrap').hidden = keep !== '__new';
  }
  $$('[data-action="f-status"]').forEach(b => b.classList.toggle('on', b === el));
};
ACTIONS['f-cat'] = el => {
  draft.category = el.dataset.v;
  $$('[data-action="f-cat"]').forEach(b => b.classList.toggle('on', b === el));
};
ACTIONS['f-star'] = el => {
  const n = +el.dataset.v;
  draft.rating = draft.rating === n ? 0 : n;
  $$('[data-action="f-star"]').forEach(b => b.classList.toggle('on', +b.dataset.v <= draft.rating));
};
ACTIONS['f-rm-photo'] = el => {
  draft.photos.splice(+el.dataset.i, 1);
  renderDraftPhotos();
};
ACTIONS['f-move'] = () => {
  collectForm();
  const keep = draft;
  startPick('แตะตำแหน่งใหม่ของหมุด', ll => {
    const loc = locate(ll.lat, ll.lng);
    Object.assign(keep, { lat: ll.lat, lng: ll.lng, country: loc.country, province: loc.province });
    openPinForm(keep);
  }, () => openPinForm(keep));
};
ACTIONS['close-sheet'] = () => { closeSheet(); draft = null; tripDraft = null; };

async function addPhotos(files) {
  for (const f of files) {
    try { draft.photos.push(await compressImage(f)); }
    catch { toast(`เปิดรูป ${f.name} ไม่ได้ (รองรับ JPG/PNG/WebP)`); }
  }
  renderDraftPhotos();
}

function snapshot() {
  const st = S.stats;
  return {
    badges: new Set(computeBadges().filter(b => b.done).map(b => b.id)),
    provinces: new Set(st.provinces),
    countries: new Set(st.countries),
  };
}

ACTIONS['save-pin'] = async () => {
  collectForm();
  const d = draft;
  if (!d.name) {
    $('#f-name-err').hidden = false;
    $('#f-name').focus();
    return;
  }
  if (d.status === 'wish') { d.date = ''; d.rating = 0; }
  else if (!d.date) d.date = today();
  if (d.tripId === '__new') {
    if (!d._newTrip) {
      $('#f-trip-new-err').hidden = false;
      $('#f-trip-new').focus();
      return;
    }
    const t = normTrip({ id: uid(), name: d._newTrip, plan: d.status === 'wish' });
    await DB.put('trips', t);
    S.trips.push(t);
    d.tripId = t.id;
  }
  if (d.status === 'wish' && !isPlan(tripById(d.tripId))) d.tripId = '';
  const old = pinById(d.id);
  if (d.tripId && (!old || old.tripId !== d.tripId)) d.seq = nextSeq(d.tripId);
  delete d._newTrip;
  d.updatedAt = Date.now();

  const isNew = !pinById(d.id);
  const before = snapshot();
  const p = normPin(d);
  await DB.put('pins', p);
  upsert(S.pins, p);
  draft = null;
  closeSheet();
  map.closePopup();
  const finished = await settlePlans();
  renderAll();
  if (finished) toast(`ไปครบทุกที่ใน "${finished.name}" แล้ว ย้ายไปอยู่ในทริปที่ไปแล้ว`, 3500);
  else celebrate(before, p, isNew);
  requestPersist();
};

function celebrate(before, p, isNew) {
  const badge = computeBadges().find(b => b.done && !before.badges.has(b.id));
  if (badge) return toast(`ได้แสตมป์ใหม่: ${badge.name}`, 3200);
  if (p.status !== 'wish') {
    if (p.country && !before.countries.has(p.country) && p.country !== 'TH') return toast(`ประเทศใหม่: ${countryName(p.country)}`, 3000);
    if (p.province && !before.provinces.has(p.province)) return toast(`จังหวัดใหม่: ${p.province} (${S.stats.provinces.size}/77)`, 3000);
  }
  toast(p.status === 'wish' ? 'เพิ่มในที่อยากไปแล้ว' : (isNew ? 'ปักหมุดแล้ว' : 'บันทึกแล้ว'));
}

/* A planned trip whose places have all been visited becomes an ordinary trip. Returns that trip, if any. */
async function settlePlans() {
  let done = null;
  for (const t of planTrips()) {
    const ps = S.pins.filter(p => p.tripId === t.id);
    if (ps.length && ps.every(p => p.status !== 'wish')) {
      t.plan = false;
      await DB.put('trips', t);
      done = t;
    }
  }
  return done;
}

/* ---------- trip form ---------- */
function openTripForm(t, plan = false) {
  const isNew = !t;
  tripDraft = t ? { ...t } : { id: uid(), name: '', start: '', end: '', note: '', plan };
  const d = tripDraft;
  openSheet(`
    ${sheetHead(isNew ? (d.plan ? 'วางแผนทริป' : 'สร้างทริป') : 'แก้ไขทริป')}
    <div class="field">
      <label for="t-name">ชื่อทริป</label>
      <input class="input" id="t-name" value="${esc(d.name)}" placeholder="ทะเลใต้สงกรานต์" maxlength="80">
      <div class="err" id="t-name-err" hidden>ตั้งชื่อทริปก่อน</div>
    </div>
    <div class="row">
      <div class="field"><label for="t-start">${d.plan ? 'วันที่จะไป' : 'วันเริ่ม'}</label><input class="input" type="date" id="t-start" value="${esc(d.start)}"></div>
      <div class="field"><label for="t-end">วันกลับ</label><input class="input" type="date" id="t-end" value="${esc(d.end)}"></div>
    </div>
    <p class="muted small" style="margin-top:-6px">${d.plan
      ? 'ยังไม่รู้วันก็เว้นไว้ได้ บันทึกแล้วค่อยเพิ่มที่อยากไปเข้าทริป แล้วเรียงลำดับที่จะไป'
      : 'ไม่ใส่วันที่ก็ได้ แอพจะใช้วันที่ของหมุดในทริปแทน หมุดใหม่ที่วันที่ตรงกับช่วงนี้จะถูกจัดเข้าทริปให้อัตโนมัติ'}</p>
    <div class="field">
      <label for="t-note">บันทึก</label>
      <textarea class="input" id="t-note" placeholder="${d.plan ? 'ไปกับใคร งบเท่าไหร่ ต้องจองอะไรบ้าง' : 'ไปกับใคร ทริปนี้เป็นยังไง'}">${esc(d.note)}</textarea>
    </div>
    <div class="row">
      <button class="btn" data-action="close-sheet">ยกเลิก</button>
      <button class="btn primary" data-action="save-trip">บันทึก</button>
    </div>`);
  if (isNew) setTimeout(() => { const n = $('#t-name'); if (n) n.focus(); }, 320);
}

ACTIONS['new-trip'] = () => openTripForm(null);
ACTIONS['new-plan'] = () => openTripForm(null, true);
ACTIONS['edit-trip'] = el => openTripForm(tripById(el.dataset.id));
ACTIONS['save-trip'] = async () => {
  const name = $('#t-name').value.trim();
  if (!name) {
    $('#t-name-err').hidden = false;
    $('#t-name').focus();
    return;
  }
  const t = normTrip({ ...tripDraft, name, start: $('#t-start').value, end: $('#t-end').value, note: $('#t-note').value.trim() });
  await DB.put('trips', t);
  upsert(S.trips, t);
  tripDraft = null;
  renderAll();
  openTripDetail(t.id);
  toast('บันทึกทริปแล้ว');
};
ACTIONS['delete-trip'] = async el => {
  const t = tripById(el.dataset.id);
  if (!t || !confirm(`ลบทริป "${t.name}" ใช่ไหม? ${t.plan ? 'ที่อยากไปในทริปจะยังอยู่ในรายการอยากไป' : 'หมุดในทริปจะยังอยู่ แค่ไม่ได้อยู่ในทริปนี้แล้ว'}`)) return;
  const affected = S.pins.filter(p => p.tripId === t.id);
  affected.forEach(p => { p.tripId = ''; });
  if (affected.length) await DB.putMany('pins', affected);
  const entries = S.journal.filter(j => j.tripId === t.id);
  entries.forEach(j => { j.tripId = ''; });
  if (entries.length) await DB.putMany('journal', entries);
  await DB.del('trips', t.id);
  S.trips = S.trips.filter(x => x.id !== t.id);
  if (S.filter.trip === t.id) S.filter.trip = 'all';
  closeSheet();
  renderAll();
  toast('ลบทริปแล้ว');
};

/* ---------- place search (OpenStreetMap Nominatim) ---------- */
ACTIONS.search = () => {
  openSheet(`
    ${sheetHead('ค้นหาสถานที่')}
    <form id="search-form" class="search-row">
      <input class="input" id="search-q" placeholder="วัดอรุณ, เกาะเต่า, Kyoto" autocomplete="off" enterkeyhint="search">
      <button class="btn primary" type="submit" aria-label="ค้นหา"><i class="ti ti-search"></i></button>
    </form>
    <div id="search-results"></div>
    <p class="muted small">ผลค้นหาจาก OpenStreetMap</p>`);
  setTimeout(() => { const q = $('#search-q'); if (q) q.focus(); }, 320);
};

async function doSearch(q) {
  q = q.trim();
  const box = $('#search-results');
  if (!q) { box.innerHTML = '<div class="err">พิมพ์ชื่อสถานที่ก่อน</div>'; return; }
  const ql = q.toLowerCase();
  const mine = S.pins.filter(p => p.name.toLowerCase().includes(ql)).slice(0, 5);
  const mineHtml = mine.length ? `<h3>หมุดของคุณ</h3>${mine.map(p => `
      <button class="list-row" data-action="open-pin" data-id="${p.id}"><i class="ti ${p.status === 'wish' ? 'ti-heart' : 'ti-map-pin'}"></i>
        <div><div class="t">${esc(p.name)}</div><div class="s">${esc(placeLabel(p))}</div></div></button>`).join('')}` : '';
  box.innerHTML = mineHtml + '<p class="muted small">กำลังค้นหา…</p>';
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=th,en&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    if (!$('#search-results')) return;
    const rows = data.map(x => {
      const name = x.name || x.display_name.split(',')[0];
      return `<button class="list-row" data-action="search-pick" data-lat="${+x.lat}" data-lng="${+x.lon}" data-name="${esc(name)}">
          <i class="ti ti-map-search"></i><div><div class="t">${esc(name)}</div><div class="s">${esc(x.display_name)}</div></div></button>`;
    }).join('');
    box.innerHTML = mineHtml + (rows ? `${mine.length ? '<h3>สถานที่</h3>' : ''}${rows}` : '<p class="muted small">ไม่เจอสถานที่นี้ ลองพิมพ์ชื่ออื่นหรือเป็นภาษาอังกฤษ</p>');
  } catch {
    if ($('#search-results')) box.innerHTML = mineHtml + '<p class="err">ค้นหาไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง</p>';
  }
}

ACTIONS['search-pick'] = el => {
  const lat = +el.dataset.lat, lng = +el.dataset.lng;
  closeSheet();
  switchView('map');
  map.setView([lat, lng], 14, { animate: false });
  offerPin(L.latLng(lat, lng), el.dataset.name);
};

/* ---------- pin from photos (reads GPS from EXIF) ---------- */
ACTIONS['import-photos'] = () => $('#photo-import').click();

async function importFromPhotos(files) {
  if (!files.length) return;
  toast('กำลังอ่านรูป…');
  let gps = null, date = '';
  const photos = [];
  for (const f of files) {
    const ex = await readExif(f);
    if (ex) {
      if (!gps && ex.lat != null) gps = ex;
      if (!date && ex.date) date = ex.date;
    }
    try { photos.push(await compressImage(f)); }
    catch { toast(`เปิดรูป ${f.name} ไม่ได้ (รองรับ JPG/PNG/WebP)`); }
  }
  if (!photos.length) return;
  const extra = { photos, date: date && date <= today() ? date : today() };
  switchView('map');
  if (gps) {
    map.setView([gps.lat, gps.lng], 13, { animate: false });
    openPinForm(newPin(gps.lat, gps.lng, extra));
    toast('เจอพิกัดในรูป ปักหมุดให้แล้ว');
  } else {
    startPick('รูปไม่มีพิกัด แตะตรงที่ถ่ายรูปนี้', ll => openPinForm(newPin(ll.lat, ll.lng, extra)));
  }
}

/* ---------- filters ---------- */
ACTIONS.filter = () => renderFilterSheet(true);

function renderFilterSheet(open) {
  const f = S.filter;
  const years = [...new Set(visited().map(p => p.date.slice(0, 4)))].sort().reverse();
  const html = `
    ${sheetHead('ตัวกรอง')}
    <div class="field"><span class="label">ปี</span>
      <div class="chips">
        <button class="chip ${f.year === 'all' ? 'on' : ''}" data-action="flt-year" data-v="all">ทุกปี</button>
        ${years.map(y => `<button class="chip ${f.year === y ? 'on' : ''}" data-action="flt-year" data-v="${y}">${+y + 543}</button>`).join('')}
      </div>
    </div>
    <div class="field"><span class="label">ประเภท (เลือกได้หลายอัน)</span>
      <div class="chips">
        ${Object.entries(CATS).map(([k, c]) => `<button class="chip ${f.cats.includes(k) ? 'on' : ''}" data-action="flt-cat" data-v="${k}"><i class="ti ${c.icon}"></i>${c.label}</button>`).join('')}
      </div>
    </div>
    <div class="field"><label for="flt-trip">ทริป</label>
      <select class="input" id="flt-trip">
        <option value="all">ทุกทริป</option>
        ${S.trips.map(t => `<option value="${t.id}" ${f.trip === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
      </select>
    </div>
    <label class="switch field"><span>แสดงที่อยากไป</span><input type="checkbox" id="flt-wish" ${f.wish ? 'checked' : ''}></label>
    <p class="muted small">แสดง ${filtered().length} จาก ${S.pins.length} หมุด</p>
    <div class="row">
      <button class="btn" data-action="flt-clear">ล้างตัวกรอง</button>
      <button class="btn primary" data-action="close-sheet">เสร็จ</button>
    </div>`;
  if (open) openSheet(html);
  else if (sheetOpen() && $('#flt-trip')) $('#sheet-body').innerHTML = html;
}
function applyFilter() {
  renderMap();
  renderTimeline();
  renderFilterSheet(false);
}
ACTIONS['flt-year'] = el => { S.filter.year = el.dataset.v; applyFilter(); };
ACTIONS['flt-cat'] = el => {
  const k = el.dataset.v, c = S.filter.cats;
  S.filter.cats = c.includes(k) ? c.filter(x => x !== k) : [...c, k];
  applyFilter();
};
ACTIONS['flt-clear'] = () => {
  S.filter = { year: 'all', cats: [], trip: 'all', wish: true };
  applyFilter();
};

/* ---------- form events ---------- */
document.addEventListener('change', e => {
  const t = e.target;
  switch (t.id) {
    case 'f-country': $('#prov-wrap').hidden = t.value !== 'TH'; break;
    case 'f-trip': $('#f-trip-new-wrap').hidden = t.value !== '__new'; break;
    case 'f-date': {
      const tr = $('#f-trip');
      if (tr && !tr.value) { const s = suggestTrip(t.value); if (s) tr.value = s; }
      break;
    }
    case 'f-files': addPhotos([...t.files]); break;
    case 'photo-import': importFromPhotos([...t.files]).finally(() => { t.value = ''; }); break;
    case 'flt-trip': S.filter.trip = t.value; applyFilter(); break;
    case 'flt-wish': S.filter.wish = t.checked; applyFilter(); break;
  }
});
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'f-name' && $('#f-name-err')) $('#f-name-err').hidden = true;
  if (id === 'f-trip-new' && $('#f-trip-new-err')) $('#f-trip-new-err').hidden = true;
  if (id === 't-name' && $('#t-name-err')) $('#t-name-err').hidden = true;
  if (id === 'tl-q') { S.tlQuery = e.target.value; renderPlacesList(); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'search-form') {
    e.preventDefault();
    doSearch($('#search-q').value);
  }
});
