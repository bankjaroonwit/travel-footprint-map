'use strict';
/* Road distance for trips: asks a free OpenStreetMap routing service (driving) for the way between
   the pins of a trip, in date order. Only coordinates are sent. Results are kept on this device, so
   a trip is only looked up again when its pins change. Legs that roads can't reach (islands without
   a car ferry, other countries across the sea) fall back to a straight line and count as flight/boat. */

const ROUTER = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
const FLY_KM = 800;          // straight legs longer than this are treated as flights without asking
const SNAP_M = 3000;         // a pin this far from any road can't be driven to
const ROAD_CACHE_MAX = 40;

const roadCache = new Map(Prefs.get('roadCache', []));
const roadPending = new Map();
const roundTrip = () => Prefs.get('roundTrip', false);

const routeKey = pts => pts.map(p => p.lat.toFixed(5) + ',' + p.lng.toFixed(5)).join(';');
function tripPoints(id, rt = roundTrip()) {
  const pts = tripStops(id).map(p => ({ lat: p.lat, lng: p.lng }));
  if (rt && pts.length > 1) pts.push(pts[0]);
  return pts;
}

function fmtDur(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
}

function saveRoadCache() {
  while (roadCache.size > ROAD_CACHE_MAX) roadCache.delete(roadCache.keys().next().value);
  Prefs.set('roadCache', [...roadCache]);
}

/* A straight leg, used for flights and whenever the router can't help. */
const straightLeg = (a, b) => ({ road: false, km: haversine(a, b), sec: 0, coords: [[a.lat, a.lng], [b.lat, b.lng]] });

async function askRouter(pts) {
  const url = ROUTER + pts.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';') + '?overview=full&geometries=geojson';
  const res = await fetch(url);
  if (!res.ok) throw new Error('router ' + res.status);
  const j = await res.json();
  if (j.code !== 'Ok' || !j.routes || !j.routes[0]) return null;
  return j;
}

/* Drops points that barely change the line's shape (Douglas-Peucker, ~15 m), so stored routes stay small. */
function simplify(pts, tol = 0.00015) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]], t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    let best = -1, bd = t2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let u = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      u = Math.max(0, Math.min(1, u));
      const d = (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2;
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* Splits the route's one long line back into its legs, using the snapped waypoint positions. */
function splitGeometry(coords, waypoints) {
  const out = [];
  let from = 0;
  for (let w = 1; w < waypoints.length; w++) {
    const [wx, wy] = waypoints[w].location;
    let best = from, bd = Infinity;
    for (let i = from; i < coords.length; i++) {
      const d = (coords[i][0] - wx) ** 2 + (coords[i][1] - wy) ** 2;
      if (d < bd) { bd = d; best = i; }
      if (d === 0) break;
    }
    out.push(coords.slice(from, best + 1).map(([x, y]) => [y, x]));
    from = best;
  }
  return out;
}

/* Road legs for a run of points that should all be reachable by car. */
async function routeRun(pts, ctx) {
  let j = null;
  try { j = await askRouter(pts); } catch { j = null; ctx.failed = true; }
  if (!j) {
    // ask leg by leg so one unreachable stop doesn't spoil the rest
    if (pts.length === 2) return [straightLeg(pts[0], pts[1])];
    const legs = [];
    for (let i = 1; i < pts.length; i++) legs.push(...await routeRun([pts[i - 1], pts[i]], ctx));
    return legs;
  }
  const r = j.routes[0], geo = splitGeometry(r.geometry.coordinates, j.waypoints);
  return r.legs.map((l, i) => {
    const a = pts[i], b = pts[i + 1], far = j.waypoints[i].distance > SNAP_M || j.waypoints[i + 1].distance > SNAP_M;
    const line = haversine(a, b);
    // too far from a road, or a "road" way that is absurdly longer than the straight line (a long detour round the sea)
    if (far || l.distance / 1000 > line * 4 + 60) return straightLeg(a, b);
    const coords = geo[i] && geo[i].length > 1 ? simplify(geo[i]) : [[a.lat, a.lng], [b.lat, b.lng]];
    return { road: true, km: l.distance / 1000, sec: l.duration, coords };
  });
}

async function computeRoad(pts) {
  const legs = [], ctx = { failed: false };
  let run = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (haversine(pts[i - 1], pts[i]) > FLY_KM) {
      if (run.length > 1) legs.push(...await routeRun(run, ctx));
      legs.push(straightLeg(pts[i - 1], pts[i]));
      run = [pts[i]];
    } else run.push(pts[i]);
  }
  if (run.length > 1) legs.push(...await routeRun(run, ctx));
  return { ...summarize(legs), failed: ctx.failed };
}

function summarize(legs) {
  const sum = (f, k) => legs.filter(f).reduce((s, l) => s + l[k], 0);
  return {
    legs,
    km: sum(() => true, 'km'),
    roadKm: sum(l => l.road, 'km'),
    flyKm: sum(l => !l.road, 'km'),
    sec: sum(l => l.road, 'sec'),
  };
}

/* The cached result for a trip, or null. Synchronous, for lists. */
function cachedRoad(id, rt = roundTrip()) {
  const pts = tripPoints(id, rt);
  if (pts.length < 2) return null;
  const hit = roadCache.get(routeKey(pts));
  return hit ? summarize(hit) : null;
}

/* Road route for a trip, looked up once and then served from the cache. Never rejects: on failure the
   legs are straight lines. */
function roadRoute(id, rt = roundTrip()) {
  const pts = tripPoints(id, rt);
  if (pts.length < 2) return Promise.resolve(null);
  const key = routeKey(pts);
  if (roadCache.has(key)) return Promise.resolve(summarize(roadCache.get(key)));
  if (roadPending.has(key)) return roadPending.get(key);
  const job = computeRoad(pts).then(r => {
    // don't remember a result spoiled by a network problem; try again next time
    if (!r.failed) {
      roadCache.set(key, r.legs.map(l => ({ ...l, coords: l.coords.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]) })));
      saveRoadCache();
    }
    return r;
  }).finally(() => roadPending.delete(key));
  roadPending.set(key, job);
  return job;
}

/* "412 กม. · ขับ ~7 ชม." style text for a computed route. */
function roadText(r, rt) {
  if (!r) return '';
  const km = `${fmtKm(r.km)} กม.${rt ? ' ไป-กลับ' : ''}`;
  return r.roadKm ? `${km} · ขับ ~${fmtDur(r.sec)}${r.flyKm ? ' + เรือ/บิน' : ''}` : `${km} (เส้นตรง)`;
}

ACTIONS['toggle-roundtrip'] = el => {
  Prefs.set('roundTrip', !roundTrip());
  const id = el.dataset.id;
  if (S.routeTrip === id) showRoute(id, { keepView: true });
  if ($('#trip-road')) fillTripRoad(id);
  renderTimeline();
};
