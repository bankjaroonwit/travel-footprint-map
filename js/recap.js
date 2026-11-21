'use strict';
/* Monthly and yearly recap: what happened in one month or one year, compared with the period before. */

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const RC = { kind: 'year', key: '' };

const periodKey = (kind, iso) => kind === 'year' ? iso.slice(0, 4) : iso.slice(0, 7);
const inPeriod = (iso, kind, key) => isDate(iso) && periodKey(kind, iso) === key;
const thYear = y => Number(y) + 543;
function periodLabel(kind, key) {
  if (kind === 'year') return `ปี ${thYear(key)}`;
  return fmtMonth(key + '-01');
}
function shiftKey(kind, key, d) {
  if (kind === 'year') return String(Number(key) + d);
  const [y, m] = key.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/* Periods that have something in them, newest first. */
function recapPeriods(kind) {
  const keys = new Set();
  for (const p of visited()) if (isDate(p.date)) keys.add(periodKey(kind, p.date));
  for (const j of S.journal) if (isDate(j.date)) keys.add(periodKey(kind, j.date));
  return [...keys].sort().reverse();
}

function recapData(kind, key) {
  const all = visited().filter(p => isDate(p.date)).sort(byDate);
  const ps = all.filter(p => inPeriod(p.date, kind, key));
  const before = all.filter(p => periodKey(kind, p.date) < key);
  const seenProv = new Set(before.map(p => p.province).filter(Boolean));
  const seenCountry = new Set(before.map(p => p.country).filter(Boolean));
  const newProv = [], newCountry = [];
  for (const p of ps) {
    if (p.province && !seenProv.has(p.province)) { seenProv.add(p.province); newProv.push(p.province); }
    if (p.country && !seenCountry.has(p.country)) { seenCountry.add(p.country); newCountry.push(p.country); }
  }
  const tripIds = new Set(ps.map(p => p.tripId).filter(Boolean));
  const byCat = {};
  for (const p of ps) byCat[p.category] = (byCat[p.category] || 0) + 1;
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const rated = ps.filter(p => p.rating);
  const best = [...rated].sort((a, b) => b.rating - a.rating || b.photos.length - a.photos.length)[0];
  const photos = ps.flatMap(p => p.photos);
  const entries = S.journal.filter(j => inPeriod(j.date, kind, key)).sort(byJournalDate);
  const prevKey = shiftKey(kind, key, -1);
  const prevCount = all.filter(p => periodKey(kind, p.date) === prevKey).length;
  const buckets = kind === 'year'
    ? TH_MONTHS.map((_, i) => ps.filter(p => Number(p.date.slice(5, 7)) === i + 1).length)
    : [];
  return {
    ps, newProv, newCountry, trips: [...tripIds].map(tripById).filter(Boolean),
    provinces: new Set(ps.map(p => p.province).filter(Boolean)),
    countries: new Set(ps.map(p => p.country).filter(Boolean)),
    km: pathKm(ps), topCat, best, photos, entries, prevCount, buckets,
    avg: rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : 0,
  };
}

function compareText(now, prev, kind) {
  const unit = kind === 'year' ? 'ปีก่อน' : 'เดือนก่อน';
  if (!prev && now) return `ครั้งแรกเมื่อเทียบกับ${unit}`;
  const d = now - prev;
  if (!d) return `เท่ากับ${unit}`;
  return d > 0 ? `มากกว่า${unit} ${d} ที่` : `น้อยกว่า${unit} ${-d} ที่`;
}

function openRecap(kind = RC.kind, key) {
  RC.kind = kind;
  const periods = recapPeriods(kind);
  RC.key = key || (periods.includes(RC.key) ? RC.key : periods[0]) || periodKey(kind, today());
  const d = recapData(kind, RC.key);
  const i = periods.indexOf(RC.key);
  const older = periods[i + 1] || (i === -1 ? periods.find(k => k < RC.key) : null);
  const newer = i > 0 ? periods[i - 1] : (i === -1 ? [...periods].reverse().find(k => k > RC.key) : null);
  const empty = !d.ps.length && !d.entries.length;
  const cover = d.photos[0];
  const max = Math.max(1, ...d.buckets);
  const c = d.topCat && cat(d.topCat[0]);

  openSheet(`
    ${sheetHead('สรุปการเดินทาง')}
    <div class="seg wide" style="margin-bottom:12px">
      <button data-action="rc-kind" data-kind="month" class="${kind === 'month' ? 'on' : ''}">รายเดือน</button>
      <button data-action="rc-kind" data-kind="year" class="${kind === 'year' ? 'on' : ''}">รายปี</button>
    </div>
    <div class="rc-nav">
      <button class="icon-btn" data-action="rc-go" data-key="${older || ''}" ${older ? '' : 'disabled'} aria-label="ก่อนหน้า"><i class="ti ti-chevron-left"></i></button>
      <b>${periodLabel(kind, RC.key)}</b>
      <button class="icon-btn" data-action="rc-go" data-key="${newer || ''}" ${newer ? '' : 'disabled'} aria-label="ถัดไป"><i class="ti ti-chevron-right"></i></button>
    </div>
    ${empty ? `<div class="empty"><i class="ti ti-calendar-off"></i>ช่วงนี้ยังไม่มีการเดินทาง<br><span class="small">ลองเลื่อนดูช่วงอื่น หรือปักหมุดที่ไปมาเพิ่ม</span></div>` : `
    <div class="rc-hero"${cover ? ` style="background-image:linear-gradient(to bottom, rgba(0,0,0,.15), rgba(0,0,0,.7)), url('${cover}')"` : ''}>
      <div class="rc-big">${d.ps.length}</div>
      <div class="rc-big-l">สถานที่ที่ไป${kind === 'year' ? 'ในปีนี้' : 'ในเดือนนี้'}</div>
      <div class="rc-cmp">${compareText(d.ps.length, d.prevCount, kind)}</div>
    </div>

    <div class="rc-grid">
      <div class="rc-stat"><b>${d.provinces.size}</b><span>จังหวัด</span>${d.newProv.length ? `<em>ใหม่ ${d.newProv.length}</em>` : ''}</div>
      <div class="rc-stat"><b>${d.countries.size}</b><span>ประเทศ</span>${d.newCountry.length ? `<em>ใหม่ ${d.newCountry.length}</em>` : ''}</div>
      <div class="rc-stat"><b>${fmtKm(d.km)}</b><span>กม. โดยประมาณ</span></div>
      <div class="rc-stat"><b>${d.trips.length}</b><span>ทริป</span></div>
      <div class="rc-stat"><b>${d.photos.length}</b><span>รูป</span></div>
      <div class="rc-stat"><b>${d.entries.length}</b><span>ไดอารี่</span></div>
    </div>

    ${kind === 'year' ? `<h3>เดือนที่ออกเดินทาง</h3>
      <div class="rc-chart">${d.buckets.map((n, m) => `
        <button class="rc-col${n ? '' : ' zero'}" data-action="rc-go" data-kind="month" data-key="${RC.key}-${String(m + 1).padStart(2, '0')}" ${n ? '' : 'disabled'}>
          <span class="n">${n || ''}</span><span class="b" style="height:${n / max * 100}%"></span><span class="m">${TH_MONTHS[m]}</span>
        </button>`).join('')}</div>` : ''}

    ${d.newProv.length || d.newCountry.length ? `<h3><i class="ti ti-sparkles"></i> ไปครั้งแรก</h3>
      <div class="chips static">${d.newProv.map(n => `<span class="chip on">จ.${esc(n)}</span>`).join('')}${d.newCountry.filter(x => x !== 'TH').map(x => `<span class="chip on">${esc(countryName(x))}</span>`).join('')}</div>` : ''}

    <div class="rc-hl">
      ${c ? `<div class="fact"><i class="ti ${c.icon}" style="color:${c.color}"></i><div><b>${c.label}</b><span>สายที่ไปบ่อยสุด · ${d.topCat[1]} ที่</span></div></div>` : ''}
      ${d.avg ? `<div class="fact"><i class="ti ti-star" style="color:var(--star)"></i><div><b>${d.avg.toFixed(1)} / 5</b><span>คะแนนเฉลี่ย</span></div></div>` : ''}
    </div>

    ${d.best ? `<h3><i class="ti ti-trophy"></i> ที่ชอบที่สุด</h3>${placeItem(d.best)}` : ''}

    ${d.trips.length ? `<h3><i class="ti ti-route"></i> ทริป</h3>${d.trips.map(tripCard).join('')}` : ''}

    ${d.entries.length ? `<h3><i class="ti ti-notebook"></i> ไดอารี่</h3>${d.entries.slice(0, 5).map(j => `
      <button class="list-row" data-action="open-journal" data-id="${j.id}"><i class="ti ti-notebook"></i>
        <div><div class="t">${esc(j.title || 'ไม่มีหัวข้อ')}</div><div class="s">${fmtDate(j.date)}</div></div></button>`).join('')}` : ''}

    ${d.ps.length ? `<h3><i class="ti ti-map-pins"></i> สถานที่ทั้งหมด</h3>${d.ps.map(p => placeItem(p)).join('')}` : ''}

    ${d.ps.length ? `<button class="btn primary block" style="margin-top:14px" data-action="rc-map"><i class="ti ti-map-2"></i> ดูบนแผนที่</button>` : ''}
    `}`);
}

ACTIONS.recap = el => openRecap(el.dataset.kind || 'year', el.dataset.key || undefined);
ACTIONS['rc-kind'] = el => openRecap(el.dataset.kind);
ACTIONS['rc-go'] = el => { if (el.dataset.key) openRecap(el.dataset.kind || RC.kind, el.dataset.key); };
ACTIONS['rc-map'] = () => {
  const ps = recapData(RC.kind, RC.key).ps;
  closeSheet();
  switchView('map');
  setTimeout(() => {
    if (ps.length === 1) map.setView([ps[0].lat, ps[0].lng], 12);
    else map.fitBounds(ps.map(p => [p.lat, p.lng]), { paddingTopLeft: [30, TOP_PAD], paddingBottomRight: [70, 40], maxZoom: 13 });
  }, 60);
};

/* Small entry card at the top of the passport page. */
function recapTeaser() {
  const months = recapPeriods('month'), years = recapPeriods('year');
  if (!months.length) return '';
  const m = months[0], y = years[0];
  const nm = visited().filter(p => inPeriod(p.date, 'month', m)).length;
  const ny = visited().filter(p => inPeriod(p.date, 'year', y)).length;
  return `<div class="rc-teaser">
      <button data-action="recap" data-kind="month" data-key="${m}"><i class="ti ti-calendar-month"></i>
        <div><b>สรุป${fmtMonth(m + '-01')}</b><span>${nm} สถานที่</span></div></button>
      <button data-action="recap" data-kind="year" data-key="${y}"><i class="ti ti-calendar-stats"></i>
        <div><b>สรุปปี ${thYear(y)}</b><span>${ny} สถานที่</span></div></button>
    </div>`;
}
