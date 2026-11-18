import { mulberry32, TICK_DT } from './sim.js';
import { nearestLanePoint, nearestNode, intersectionLight, randomLanePointNear } from './roadgraph.js';
import { districtFor } from './cityGenerator.js';
let S = null;
const ARCHETYPES = ['mico', 'mico', 'viajero', 'viajero', 'viajero', 'terraza', 'bruto', 'furia'];
const COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#7f8c8d', '#16a085', '#e67e22', '#ecf0f1', '#2c3e50'];
const TARGET_COUNT = 25;
function rnd() {
  if (S && typeof S.rng === 'function') return S.rng();
  return mulberry32((S ? S.seed || 0 : 0) + (S ? S.tick || 0 : 0))();
}
function ensure(state) {
  if (!state.traffic) state.traffic = { target: TARGET_COUNT, honks: 0 };
  if (!Array.isArray(state.actors.cars)) state.actors.cars = [];
  return state.traffic;
}
function pt(v, fallback) {
  if (!v) return fallback;
  if (typeof v.x === 'number' && typeof v.z === 'number') return { x: v.x, z: v.z };
  if (v.point && typeof v.point.x === 'number') return { x: v.point.x, z: v.point.z };
  if (Array.isArray(v) && v.length >= 2) return { x: v[0], z: v[1] };
  return fallback;
}
function dist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
function angleTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function pickArchetype(district) {
  if ((district === 'Alto Mar' || district === 'Palmera Row') && rnd() < 0.12) return 'furia';
  if (district === 'Brisa Yards' && rnd() < 0.3) return 'bruto';
  return ARCHETYPES[Math.floor(rnd() * ARCHETYPES.length)];
}
function lanePointNear(pos, minR, maxR) {
  try {
    const p = randomLanePointNear(pos, minR, maxR);
    const q = pt(p, null);
    if (q) return q;
  } catch (e) { }
  const a = rnd() * Math.PI * 2;
  const r = minR + rnd() * (maxR - minR);
  return { x: pos.x + Math.cos(a) * r, z: pos.z + Math.sin(a) * r };
}
let nextId = 1000;
function makeTrafficCar(pos, district) {
  const car = {
    id: nextId++, archetype: pickArchetype(district),
    pos: { x: pos.x, y: 0, z: pos.z }, heading: rnd() * Math.PI * 2,
    speed: 0, cruise: 11 + rnd() * 5, damage: 100,
    color: COLORS[Math.floor(rnd() * COLORS.length)],
    mesh: null, traffic: true, blockedTime: 0, routeTarget: null,
    state: 'drive', fleeTime: 0,
  };
  return car;
}
export function spawnTrafficNear(player) {
  const st = S;
  if (!st) return null;
  ensure(st);
  const p = (player && player.pos) || (st.player && st.player.pos) || { x: 0, z: 0 };
  const district = districtFor ? districtFor(p.x, p.z) : '';
  const pos = lanePointNear(p, 90, 180);
  const car = makeTrafficCar(pos, district);
  st.actors.cars.push(car);
  return car;
}
export function despawnTraffic(car) {
  const st = S;
  if (!st || !car) return false;
  const arr = st.actors.cars;
  const i = arr.indexOf(car);
  if (i >= 0) arr.splice(i, 1);
  car.recycled = true;
  return true;
}
export function respawnTraffic() {
  const st = S;
  if (!st) return 0;
  const p = st.player.pos;
  let n = 0;
  for (const car of [...st.actors.cars]) {
    if (car.traffic && dist2(car.pos, p) > 220) { despawnTraffic(car); n++; }
  }
  return n;
}
export function carFollowing(car, ahead, gap) {
  if (!car) return 0;
  if (!ahead) return car.cruise || 12;
  const g = gap == null ? 4 : gap;
  const d = dist2(car.pos, ahead.pos);
  if (d < g + 2) return 0;
  if (d < 20) return Math.max(0, (ahead.speed || 0) * 0.9);
  return car.cruise || 12;
}
export function intersectionPass(car, node) {
  if (!car || !node) return true;
  let light = null;
  try { light = intersectionLight(node, (S && S.tick) || 0); } catch (e) { light = null; }
  if (light == null) return true;
  if (typeof light === 'string') return light !== 'red';
  if (typeof light === 'boolean') return light;
  if (typeof light === 'object') {
    if (light.state) return light.state !== 'red';
    if (light.phase) return light.phase !== 'red';
    if (light.green != null) return !!light.green;
  }
  return true;
}
export function driverFlee(car) {
  if (!car) return;
  car.driverFled = true;
  car.speed = 0;
  car.state = 'abandoned';
  if (S) {
    const p = S.player ? S.player.pos : { x: 0, z: 0 };
    const a = Math.atan2(car.pos.x - p.x, car.pos.z - p.z);
    car.fleeDir = a;
  }
}
export function parkedCarsForStreet(street) {
  const length = (street && (street.length || street.len)) || 40;
  const count = Math.max(1, Math.round(length / 40));
  const base = (street && street.pos) || (street && street.from) || { x: 0, z: 0 };
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      archetype: ARCHETYPES[Math.floor(rnd() * ARCHETYPES.length)],
      pos: { x: base.x + i * 40 + rnd() * 6, y: 0, z: base.z + (rnd() < 0.5 ? 4 : -4) },
      heading: rnd() * Math.PI * 2,
      parked: true,
    });
  }
  return out;
}
function trafficTargetCount(playerPos) {
  let n = TARGET_COUNT;
  try {
    const d = districtFor(playerPos.x, playerPos.z);
    if (d === 'Port Lumen' || d === 'Palmera Row') n = Math.round(n * 1.2);
    if (d === 'Las Salinas') n = Math.round(n * 0.7);
  } catch (e) { }
  return Math.max(18, Math.min(28, n));
}
export function trafficUpdate(dt) {
  const st = S;
  if (!st) return;
  const d = dt || TICK_DT || 1 / 60;
  ensure(st);
  const p = st.player.pos;
  const gun = st.flags && st.flags.lastGunfire;
  const gunAge = gun ? ((st.tick || 0) - (gun.tick || 0)) * (TICK_DT || 1 / 60) : 999;
  for (const car of [...st.actors.cars]) {
    if (!car || !car.traffic || car.recycled) continue;
    const distP = dist2(car.pos, p);
    if (distP > 220) { despawnTraffic(car); continue; }
    if (gun && gunAge < 2 && dist2(car.pos, gun.pos) < 30) {
      car.state = 'scatter';
      car.fleeTime = 3;
      car.heading += (rnd() - 0.5) * 0.6;
      car.speed = Math.min(car.cruise || 12, 8);
      continue;
    }
    if (car.state === 'scatter') {
      car.fleeTime -= d;
      if (car.fleeTime <= 0) car.state = 'drive';
    }
    if (car.state === 'abandoned') { car.speed = 0; continue; }
    let ahead = null, best = 20;
    for (const other of st.actors.cars) {
      if (other === car || other.recycled) continue;
      const dd = dist2(car.pos, other.pos);
      if (dd < best) {
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        const dot = (other.pos.x - car.pos.x) * fx + (other.pos.z - car.pos.z) * fz;
        if (dot > 0) { best = dd; ahead = other; }
      }
    }
    let targetSpeed = carFollowing(car, ahead, 4);
    try {
      const node = nearestNode(car.pos);
      const np = pt(node, null);
      if (np && dist2(car.pos, np) < 14 && !intersectionPass(car, node)) targetSpeed = 0;
    } catch (e) { }
    try {
      const lp = pt(nearestLanePoint(car.pos), null);
      if (lp) {
        const want = angleTo(car.pos, lp);
        car.heading += Math.max(-1.2 * d, Math.min(1.2 * d, angleDiff(want, car.heading)));
      }
    } catch (e) { }
    if (targetSpeed === 0 && (car.cruise || 0) > 0) {
      car.blockedTime = (car.blockedTime || 0) + d;
      if (car.blockedTime > 3 && !car.honked) { car.honked = true; st.traffic.honks++; }
      if (car.blockedTime > 8) {
        car.routeTarget = lanePointNear(p, 60, 140);
        car.heading = angleTo(car.pos, car.routeTarget);
        car.blockedTime = 0;
        car.honked = false;
      }
    } else {
      car.blockedTime = 0;
      car.honked = false;
    }
    const sp = car.speed || 0;
    car.speed = sp + Math.max(-8 * d, Math.min(6 * d, targetSpeed - sp));
    if (car.speed < 0.05 && targetSpeed === 0) car.speed = 0;
  }
  const want = trafficTargetCount(p);
  let active = st.actors.cars.filter((c) => c.traffic && !c.recycled).length;
  let guard = 0;
  while (active < want && guard++ < 8) {
    spawnTrafficNear(st.player);
    active++;
  }
}
export function init(state) {
  S = state;
  ensure(state);
}
export function update(state, dt) {
  S = state;
  ensure(state);
  trafficUpdate(dt);
}
