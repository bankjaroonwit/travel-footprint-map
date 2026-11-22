'use strict';
/* Travel journal: dated entries with mood, weather, photos, and links to trips and places. */

const MOODS = {
  great: { label: 'ดีมาก',  icon: 'ti-mood-crazy-happy' },
  good:  { label: 'ดี',     icon: 'ti-mood-happy' },
  ok:    { label: 'เฉยๆ',   icon: 'ti-mood-neutral' },
  tired: { label: 'เหนื่อย', icon: 'ti-zzz' },
  bad:   { label: 'แย่',    icon: 'ti-mood-sad' },
};
const WEATHER = {
  sun:   { label: 'แดดดี', icon: 'ti-sun' },
  cloud: { label: 'มีเมฆ', icon: 'ti-cloud' },
  rain:  { label: 'ฝนตก', icon: 'ti-cloud-rain' },
  cold:  { label: 'หนาว',  icon: 'ti-snowflake' },
  hot:   { label: 'ร้อน',  icon: 'ti-temperature' },
};
const PROMPTS = [
  'วันนี้เห็นอะไรที่ไม่เคยเห็นมาก่อน?',
  'อาหารมื้อไหนอร่อยที่สุดวันนี้?',
  'ได้คุยกับใครที่น่าสนใจบ้าง?',
  'ช่วงเวลาไหนของวันนี้ที่อยากจำไว้ตลอดไป?',
  'มีอะไรผิดแผน แต่กลายเป็นเรื่องดีไหม?',
  'ถ้าได้กลับมาที่นี่อีก จะทำอะไรต่างจากเดิม?',
  'กลิ่น เสียง หรืออากาศที่นี่เป็นยังไง?',
  'วันนี้รู้สึกยังไง เพราะอะไร?',
];

let jDraft = null;   // entry being written
let jDirty = false;  // unsaved changes in the editor

function normJournal(e) {
  if (!e || typeof e !== 'object') return null;
  const title = String(e.title || '').slice(0, 120);
  const body = String(e.body || '');
  const photos = Array.isArray(e.photos) ? e.photos.filter(s => typeof s === 'string' && s.startsWith('data:image/')) : [];
  if (!title.trim() && !body.trim() && !photos.length) return null;
  return {
    id: String(e.id || uid()),
    date: isDate(e.date) ? e.date : today(),
    title, body, photos,
    mood: MOODS[e.mood] ? e.mood : '',
    weather: WEATHER[e.weather] ? e.weather : '',
    tripId: String(e.tripId || ''),
    pinIds: Array.isArray(e.pinIds) ? [...new Set(e.pinIds.map(String))] : [],
    demo: !!e.demo,
    createdAt: +e.createdAt || Date.now(),
    updatedAt: +e.updatedAt || Date.now(),
  };
}

const journalById = id => S.journal.find(j => j.id === id);
const linkedPins = j => j.pinIds.map(pinById).filter(Boolean).sort(byDate);
const fmtLong = iso => toD(iso).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const excerpt = (s, n = 100) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
const byJournalDate = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

/* ---------- list ---------- */
function memoryOfToday() {
  const t = today(), md = t.slice(5), y = +t.slice(0, 4);
  const j = S.journal.filter(e => e.date.slice(5) === md && +e.date.slice(0, 4) < y).sort(byJournalDate)[0];
  const p = !j && visited().filter(e => e.date.slice(5) === md && +e.date.slice(0, 4) < y).sort((a, b) => byDate(b, a))[0];
  const item = j || p;
  if (!item) return '';
  const years = y - +item.date.slice(0, 4);
  const label = j ? (j.title || excerpt(j.body, 40)) : `คุณอยู่ที่ ${p.name}`;
  return `
    <button class="memory" data-action="${j ? 'open-journal' : 'open-pin'}" data-id="${item.id}">
      <i class="ti ti-history"></i>
      <div><div class="small muted">วันนี้เมื่อ ${years} ปีก่อน</div><b>${esc(label)}</b></div>
    </button>`;
}

function renderJournal() {
  const el = $('#journal');
  const focused = document.activeElement && document.activeElement.id === 'j-q';
  el.innerHTML = `
    ${memoryOfToday()}
    ${S.journal.length ? `<div class="search-box"><i class="ti ti-search"></i><input id="j-q" class="input" placeholder="ค้นหาในไดอารี่" value="${esc(S.jQuery)}" autocomplete="off"></div>` : ''}
    <div id="j-list"></div>`;
  if (focused) $('#j-q').focus();
  renderJournalList();
}

function renderJournalList() {
  const box = $('#j-list');
  if (!box) return;
  if (!S.journal.length) {
    box.innerHTML = `<div class="empty"><i class="ti ti-notebook"></i>ยังไม่มีไดอารี่<br>เขียนเรื่องราวระหว่างเดินทางเก็บไว้ แล้วกลับมาอ่านย้อนหลังได้เสมอ
      <br><button class="btn primary" data-action="new-journal"><i class="ti ti-pencil"></i> เขียนบันทึกแรก</button></div>`;
    return;
  }
  const q = S.jQuery.trim().toLowerCase();
  const list = S.journal.filter(j => !q || [
    j.title, j.body, (tripById(j.tripId) || {}).name, ...linkedPins(j).map(p => p.name),
  ].join(' ').toLowerCase().includes(q)).sort(byJournalDate);
  if (!list.length) { box.innerHTML = '<div class="empty"><i class="ti ti-search"></i>ไม่เจอบันทึกที่ตรงกัน</div>'; return; }
  let html = `<p class="muted small" style="margin:0 0 4px">${S.journal.length} บันทึก</p>`, last = '';
  for (const j of list) {
    const m = j.date.slice(0, 7);
    if (m !== last) { html += `<div class="month">${fmtMonth(j.date)}</div>`; last = m; }
    html += journalCard(j);
  }
  box.innerHTML = html;
}

function journalCard(j) {
  const d = toD(j.date), mood = MOODS[j.mood];
  const places = linkedPins(j);
  const photo = j.photos[0] || ((places.find(p => p.photos.length) || {}).photos || [])[0];
  const where = [places[0] && places[0].name + (places.length > 1 ? ` +${places.length - 1}` : ''), (tripById(j.tripId) || {}).name].filter(Boolean).join(' · ');
  return `
    <button class="j-card" data-action="open-journal" data-id="${j.id}">
      <div class="j-date"><b>${d.getDate()}</b><span>${d.toLocaleDateString('th-TH', { weekday: 'short' })}</span></div>
      <div class="body">
        <div class="t">${mood ? `<i class="ti ${mood.icon}"></i>` : ''}<span>${esc(j.title || 'ไม่มีหัวข้อ')}</span></div>
        <div class="ex">${esc(excerpt(j.body)) || '<span class="muted">มีแต่รูป</span>'}</div>
        ${where ? `<div class="where"><i class="ti ti-map-pin"></i> ${esc(where)}</div>` : ''}
      </div>
      ${photo ? `<img src="${thumb(photo)}" alt="" loading="lazy" decoding="async">` : ''}
    </button>`;
}
ACTIONS['open-journal'] = el => openJournalEntry(el.dataset.id);

/* ---------- reading view ---------- */
function openJournalEntry(id) {
  const j = journalById(id);
  if (!j) return;
  const mood = MOODS[j.mood], w = WEATHER[j.weather], t = tripById(j.tripId);
  const places = linkedPins(j);
  openSheet(`
    ${sheetHead(`<span class="muted small" style="font-weight:400">${fmtLong(j.date)}</span>`)}
    <div class="j-read">
      ${j.photos.length ? `<div class="gallery">${j.photos.map((s, i) => `<img src="${s}" alt="" data-action="view-photo" data-kind="journal" data-id="${j.id}" data-i="${i}">`).join('')}</div>` : ''}
      <h1>${esc(j.title || 'ไม่มีหัวข้อ')}</h1>
      <div class="meta">
        ${mood ? `<span class="tag"><i class="ti ${mood.icon}"></i>${mood.label}</span>` : ''}
        ${w ? `<span class="tag"><i class="ti ${w.icon}"></i>${w.label}</span>` : ''}
        ${t ? `<button class="tag" data-action="open-trip" data-id="${t.id}"><i class="ti ti-route"></i>${esc(t.name)}</button>` : ''}
      </div>
      ${j.body.trim() ? `<div class="j-text">${esc(j.body)}</div>` : ''}
      ${places.length ? `<h3>สถานที่ในบันทึกนี้</h3>${places.map(p => placeItem(p)).join('')}` : ''}
      <div class="row" style="margin-top:12px">
        <button class="btn danger" data-action="delete-journal" data-id="${j.id}"><i class="ti ti-trash"></i> ลบ</button>
        <button class="btn primary" data-action="edit-journal" data-id="${j.id}"><i class="ti ti-edit"></i> แก้ไข</button>
      </div>
    </div>`);
}

ACTIONS['delete-journal'] = async el => {
  const j = journalById(el.dataset.id);
  if (!j || !confirm(`ลบบันทึก "${j.title || fmtDate(j.date)}" ใช่ไหม? ลบแล้วกู้คืนไม่ได้`)) return;
  await DB.del('journal', j.id);
  S.journal = S.journal.filter(x => x.id !== j.id);
  closeSheet();
  renderAll();
  toast('ลบบันทึกแล้ว');
};

/* ---------- editor ---------- */
function openJournalForm(j, preset = {}) {
  const isNew = !j;
  jDraft = j ? JSON.parse(JSON.stringify(j)) : {
    id: uid(), date: today(), title: '', body: '', mood: '', weather: '',
    tripId: '', pinIds: [], photos: [], createdAt: Date.now(), ...preset,
  };
  if (isNew && !jDraft.tripId) jDraft.tripId = suggestTrip(jDraft.date);
  jDirty = false;
  const d = jDraft;
  const trips = [...S.trips].sort((a, b) => (tripRange(b).start || '').localeCompare(tripRange(a).start || ''));
  openSheet(`
    ${sheetHead(isNew ? 'เขียนไดอารี่' : 'แก้ไขไดอารี่')}
    <div id="j-form">
      <div class="row">
        <div class="field"><label for="j-date">วันที่</label><input class="input" type="date" id="j-date" value="${d.date}" max="${today()}"></div>
        <div class="field"><label for="j-trip">ทริป</label>
          <select class="input" id="j-trip">
            <option value="">ไม่อยู่ในทริป</option>
            ${trips.map(t => `<option value="${t.id}" ${t.id === d.tripId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="j-title">หัวข้อ</label>
        <input class="input" id="j-title" value="${esc(d.title)}" placeholder="วันที่ได้เห็นทะเลหมอก" maxlength="120" autocomplete="off">
      </div>
      <div class="field"><span class="label">วันนี้รู้สึก</span>
        <div class="moods">${Object.entries(MOODS).map(([k, m]) =>
          `<button type="button" class="mood ${d.mood === k ? 'on' : ''}" data-action="j-mood" data-v="${k}"><i class="ti ${m.icon}"></i>${m.label}</button>`).join('')}</div>
      </div>
      <div class="field"><span class="label">อากาศ</span>
        <div class="chips">${Object.entries(WEATHER).map(([k, w]) =>
          `<button type="button" class="chip ${d.weather === k ? 'on' : ''}" data-action="j-weather" data-v="${k}"><i class="ti ${w.icon}"></i>${w.label}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label for="j-body">เรื่องราว</label>
        <textarea class="input" id="j-body" placeholder="วันนี้เป็นยังไงบ้าง เล่าให้ตัวเองในอนาคตฟัง">${esc(d.body)}</textarea>
        <div class="j-tools">
          <button type="button" class="link" data-action="j-prompt"><i class="ti ti-bulb"></i> ไม่รู้จะเขียนอะไร?</button>
          <span id="j-count"></span>
        </div>
        <div class="err" id="j-err" hidden>เขียนหัวข้อ เรื่องราว หรือใส่รูปอย่างน้อยหนึ่งอย่าง</div>
      </div>
      <div class="field"><span class="label">สถานที่ที่เกี่ยวข้อง</span><div class="chips" id="j-places"></div></div>
      <div class="field"><span class="label">รูปภาพ</span><div class="photos" id="j-photos"></div></div>
      <div class="row">
        <button class="btn" data-action="close-sheet">ยกเลิก</button>
        <button class="btn primary" data-action="save-journal">บันทึก</button>
      </div>
    </div>`);
  renderJPlaces();
  renderJPhotos();
  updateJCount();
}

function renderJPlaces() {
  const box = $('#j-places');
  if (!box) return;
  const d = jDraft;
  const list = visited().filter(p => p.date === d.date || (d.tripId && p.tripId === d.tripId) || d.pinIds.includes(p.id)).sort(byDate);
  box.innerHTML = list.length
    ? list.map(p => `<button type="button" class="chip ${d.pinIds.includes(p.id) ? 'on' : ''}" data-action="j-place" data-id="${p.id}"><i class="ti ${cat(p.category).icon}"></i>${esc(p.name)}</button>`).join('')
    : '<span class="muted small">ยังไม่มีหมุดในวันนี้หรือในทริปนี้ ปักหมุดบนแผนที่ก่อนแล้วจะเลือกได้ที่นี่</span>';
}

function renderJPhotos() {
  const box = $('#j-photos');
  if (!box) return;
  box.innerHTML = jDraft.photos.map((src, i) => `
      <div class="thumb"><img src="${src}" alt=""><button type="button" data-action="j-rm-photo" data-i="${i}" aria-label="ลบรูป"><i class="ti ti-x"></i></button></div>`).join('') +
    `<label class="add-photo"><i class="ti ti-photo-plus"></i>เพิ่มรูป<input type="file" id="j-files" accept="image/*" multiple hidden></label>`;
}

function updateJCount() {
  const b = $('#j-body'), c = $('#j-count');
  if (b && c) c.textContent = b.value.length ? `${b.value.length.toLocaleString('th-TH')} ตัวอักษร` : '';
}

ACTIONS['new-journal'] = el => {
  const preset = {};
  const p = el.dataset.pin && pinById(el.dataset.pin);
  const t = el.dataset.trip && tripById(el.dataset.trip);
  if (p) Object.assign(preset, { date: p.date || today(), tripId: p.tripId, pinIds: [p.id] });
  else if (t) Object.assign(preset, { tripId: t.id, date: tripRange(t).start || today() });
  openJournalForm(null, preset);
};
ACTIONS['edit-journal'] = el => openJournalForm(journalById(el.dataset.id));
ACTIONS['j-mood'] = el => {
  jDraft.mood = jDraft.mood === el.dataset.v ? '' : el.dataset.v;
  jDirty = true;
  $$('[data-action="j-mood"]').forEach(b => b.classList.toggle('on', b.dataset.v === jDraft.mood));
};
ACTIONS['j-weather'] = el => {
  jDraft.weather = jDraft.weather === el.dataset.v ? '' : el.dataset.v;
  jDirty = true;
  $$('[data-action="j-weather"]').forEach(b => b.classList.toggle('on', b.dataset.v === jDraft.weather));
};
ACTIONS['j-place'] = el => {
  const id = el.dataset.id, ids = jDraft.pinIds;
  jDraft.pinIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  jDirty = true;
  el.classList.toggle('on', jDraft.pinIds.includes(id));
};
ACTIONS['j-rm-photo'] = el => {
  jDraft.photos.splice(+el.dataset.i, 1);
  jDirty = true;
  renderJPhotos();
};
ACTIONS['j-prompt'] = () => {
  const b = $('#j-body');
  const used = PROMPTS.filter(p => !b.value.includes(p));
  const pick = (used.length ? used : PROMPTS)[Math.floor(Math.random() * (used.length || PROMPTS.length))];
  b.value = (b.value.trim() ? b.value.replace(/\s*$/, '') + '\n\n' : '') + pick + '\n';
  jDirty = true;
  updateJCount();
  b.focus();
  b.setSelectionRange(b.value.length, b.value.length);
};

ACTIONS['save-journal'] = async () => {
  const d = jDraft;
  d.date = $('#j-date').value || today();
  d.tripId = $('#j-trip').value;
  d.title = $('#j-title').value.trim();
  d.body = $('#j-body').value.replace(/\s+$/, '');
  d.updatedAt = Date.now();
  const j = normJournal(d);
  if (!j) {
    $('#j-err').hidden = false;
    $('#j-body').focus();
    return;
  }
  const isNew = !journalById(j.id);
  const before = new Set(computeBadges().filter(b => b.done).map(b => b.id));
  await DB.put('journal', j);
  upsert(S.journal, j);
  jDraft = null;
  jDirty = false;
  renderAll();
  openJournalEntry(j.id);
  const badge = computeBadges().find(b => b.done && !before.has(b.id));
  toast(badge ? `ได้แสตมป์ใหม่: ${badge.name}` : (isNew ? 'บันทึกไดอารี่แล้ว' : 'แก้ไขแล้ว'), badge ? 3200 : 2400);
  requestPersist();
};

/* Ask before throwing away unsaved writing. */
const _closeSheet = ACTIONS['close-sheet'];
ACTIONS['close-sheet'] = (el, e) => {
  if ($('#j-form') && jDirty && !confirm('ทิ้งสิ่งที่เขียนไว้ใช่ไหม?')) return;
  jDraft = null;
  jDirty = false;
  _closeSheet(el, e);
};

document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'j-body' || id === 'j-title') {
    jDirty = true;
    if ($('#j-err')) $('#j-err').hidden = true;
    if (id === 'j-body') updateJCount();
  }
  if (id === 'j-q') { S.jQuery = e.target.value; renderJournalList(); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (!jDraft) return;
  if (t.id === 'j-date') {
    jDraft.date = t.value || today();
    const tr = $('#j-trip');
    if (tr && !tr.value) { const s = suggestTrip(jDraft.date); if (s) { tr.value = s; jDraft.tripId = s; } }
    jDirty = true;
    renderJPlaces();
  } else if (t.id === 'j-trip') {
    jDraft.tripId = t.value;
    jDirty = true;
    renderJPlaces();
  } else if (t.id === 'j-files') {
    for (const f of [...t.files]) {
      try { jDraft.photos.push(await compressImage(f)); }
      catch { toast(`เปิดรูป ${f.name} ไม่ได้ (รองรับ JPG/PNG/WebP)`); }
    }
    jDirty = true;
    renderJPhotos();
  }
});
