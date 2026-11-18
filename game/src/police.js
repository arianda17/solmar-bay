import { mulberry32, TICK_DT } from './sim.js';
import { nearestNode, nearestLanePoint, astarRoute, randomLanePointNear } from './roadgraph.js';
let S = null;
let nextCopId = 1;
let nextCarId = 5000;
const LADDER = {
  1: { cruisers: 1, radius: 80, escape: 15, guns: false },
  2: { cruisers: 2, radius: 100, escape: 20, guns: false },
  3: { cruisers: 3, radius: 120, escape: 25, guns: true },
  4: { cruisers: 4, radius: 150, escape: 30, guns: true, heli: true },
  5: { cruisers: 6, radius: 180, escape: 35, guns: true, heli: true },
};
function rnd() {
  if (S && typeof S.rng === 'function') return S.rng();
  return mulberry32((S ? S.seed || 0 : 0) + (S ? S.tick || 0 : 0))();
}
function ensure(state) {
  if (!state.police) {
    state.police = { heli: null, heliTimer: 0, heliDelay: 0, repathTimer: 0, shootTimer: 0, lastStars: 0 };
  }
  if (!Array.isArray(state.actors.cops)) state.actors.cops = [];
  if (!Array.isArray(state.actors.cars)) state.actors.cars = [];
  return state.police;
}
function dist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
function pt(v, fallback) {
  if (!v) return fallback;
  if (typeof v.x === 'number' && typeof v.z === 'number') return { x: v.x, z: v.z };
  if (v.point && typeof v.point.x === 'number') return { x: v.point.x, z: v.point.z };
  return fallback;
}
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function spawnPoint(minR, maxR) {
  const st = S;
  const p = st.player.pos;
  try {
    const q = pt(randomLanePointNear(p, minR, maxR), null);
    if (q) return q;
  } catch (e) { }
  const a = rnd() * Math.PI * 2, r = minR + rnd() * (maxR - minR);
  return { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
}
export function spawnPoliceCruiser(stars) {
  const st = S;
  if (!st) return null;
  ensure(st);
  const ahead = stars >= 5;
  const pos = spawnPoint(ahead ? 120 : 90, ahead ? 180 : 150);
  const car = {
    id: nextCarId++, archetype: 'enforcer', pos: { x: pos.x, y: 0, z: pos.z },
    heading: Math.atan2(st.player.pos.x - pos.x, st.player.pos.z - pos.z),
    speed: 0, damage: 100, color: '#1a1a2e', mesh: null,
    cop: true, police: true, siren: true, path: null, pathIdx: 0,
  };
  st.actors.cars.push(car);
  for (let i = 0; i < 2; i++) {
    st.actors.cops.push({
      id: nextCopId++, pos: { x: pos.x, y: 0, z: pos.z }, heading: car.heading,
      hp: 100, carId: car.id, onFoot: false, state: 'pursue', stateTime: 0,
    });
  }
  return car;
}
export function policeAStarPath(cop, target) {
  if (!cop || !target) return null;
  try {
    const from = nearestNode(cop.pos);
    const to = nearestNode(target.pos || target);
    const route = astarRoute(from, to);
    if (Array.isArray(route) && route.length > 0) {
      return route.map((n) => pt(n, null)).filter(Boolean);
    }
  } catch (e) { }
  return [target.pos || target];
}
export function policeLineOfSight(cop, player) {
  const from = cop.pos || cop;
  const to = (player && player.pos) || player;
  if (!from || !to) return false;
  const colliders = (S && S.world && S.world.colliders) || [];
  if (!Array.isArray(colliders) || colliders.length === 0) return true;
  const dx = to.x - from.x, dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 0.01) return true;
  for (const c of colliders) {
    let minX, maxX, minZ, maxZ;
    if (c.min && c.max) { minX = c.min.x; maxX = c.max.x; minZ = c.min.z; maxZ = c.max.z; }
    else if (typeof c.x === 'number' && c.r != null) { minX = c.x - c.r; maxX = c.x + c.r; minZ = c.z - c.r; maxZ = c.z + c.r; }
    else if (typeof c.x === 'number' && c.w != null) { minX = c.x - c.w / 2; maxX = c.x + c.w / 2; minZ = c.z - (c.d || c.w) / 2; maxZ = c.z + (c.d || c.w) / 2; }
    else continue;
    let tmin = 0, tmax = 1;
    let ok = true;
    const axes = [[dx, from.x, minX, maxX], [dz, from.z, minZ, maxZ]];
    for (const [dd, o, mn, mx] of axes) {
      if (Math.abs(dd) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } }
      else {
        let t1 = (mn - o) / dd, t2 = (mx - o) / dd;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin < 1 && tmax > 0) return false; // blocked
  }
  return true;
}
export function policeArrestCheck(cop, player) {
  if (!cop || !player) return false;
  const p = player.pos || player;
  const onFoot = player.onFoot !== false && !player.vehicle;
  if (!onFoot) return false;
  if ((player.health == null ? 100 : player.health) >= 20) return false;
  if (dist2(cop.pos, p) > 3) return false;
  if (S) S.flags.arrestRequested = true;
  return true;
}
export function policeShootCheck(cop, player) {
  const st = S;
  if (!st || !cop || !player) return false;
  const stars = (st.wanted && st.wanted.stars) || 0;
  if (stars < 3) return false;
  if (st.police.shootTimer > 0) return false;
  const p = player.pos || player;
  const d = dist2(cop.pos, p);
  if (d > 40) return false;
  if (!policeLineOfSight(cop, player)) return false;
  st.police.shootTimer = 0.7;
  let acc = 0.6;
  if (Math.abs(player.speed || 0) > 5) acc -= 0.3;
  if (rnd() < acc) {
    player.health = Math.max(0, (player.health == null ? 100 : player.health) - 8);
    player.lastDamageTick = st.tick || 0;
    return true;
  }
  return false;
}
export function policeRoadblock(stars, pos) { return null; }
export function swatVan(stars) { return null; }
export function policeHelicopterUpdate(dt) {
  const st = S;
  if (!st) return;
  const d = dt || TICK_DT || 1 / 60;
  ensure(st);
  const stars = (st.wanted && st.wanted.stars) || 0;
  const pol = st.police;
  if (stars >= 4) {
    if (!pol.heli) {
      pol.heliDelay += d;
      if (pol.heliDelay >= 5) {
        pol.heli = {
          pos: { x: st.player.pos.x + 120, y: 38, z: st.player.pos.z + 60 },
          angle: 0, spotlight: true,
        };
        pol.heliTimer = 0;
      }
    } else {
      pol.heliTimer = 0;
      pol.heli.angle += d * 0.5;
      const r = 45;
      pol.heli.pos.x = st.player.pos.x + Math.cos(pol.heli.angle) * r;
      pol.heli.pos.z = st.player.pos.z + Math.sin(pol.heli.angle) * r;
      pol.heli.pos.y = 35 + Math.sin(pol.heli.angle * 0.7) * 5;
    }
  } else if (pol.heli) {
    pol.heliTimer += d;
    pol.heliDelay = 0;
    if (pol.heliTimer >= 10) pol.heli = null;
  } else {
    pol.heliDelay = 0;
  }
}
export function policePursuitUpdate(dt) {
  const st = S;
  if (!st) return;
  const d = dt || TICK_DT || 1 / 60;
  ensure(st);
  const stars = (st.wanted && st.wanted.stars) || 0;
  const ladder = LADDER[stars] || { cruisers: 0, radius: 0, escape: 15, guns: false };
  const p = st.player.pos;
  const cruisers = st.actors.cars.filter((c) => c.police && !c.recycled);
  let guard = 0;
  while (cruisers.length < ladder.cruisers && guard++ < 6) {
    spawnPoliceCruiser(stars);
    cruisers.push(st.actors.cars[st.actors.cars.length - 1]);
  }
  while (cruisers.length > ladder.cruisers) {
    const extra = cruisers.pop();
    const ci = st.actors.cars.indexOf(extra);
    if (ci >= 0) st.actors.cars.splice(ci, 1);
    for (let i = st.actors.cops.length - 1; i >= 0; i--) {
      if (st.actors.cops[i].carId === extra.id) st.actors.cops.splice(i, 1);
    }
  }
  if (stars === 0) {
    for (const car of [...cruisers]) {
      const i = st.actors.cars.indexOf(car);
      if (i >= 0) st.actors.cars.splice(i, 1);
    }
    st.actors.cops.length = 0;
    return;
  }
  if (st.police.shootTimer > 0) st.police.shootTimer -= d;
  st.police.repathTimer -= d;
  const repath = st.police.repathTimer <= 0;
  if (repath) st.police.repathTimer = 2;
  for (const car of cruisers) {
    if (car.disabled) continue;
    if (repath || !car.path) {
      const cop = st.actors.cops.find((c) => c.carId === car.id);
      car.path = policeAStarPath(cop || car, st.player);
      car.pathIdx = 0;
    }
    let target = p;
    if (car.path && car.pathIdx < car.path.length) {
      target = car.path[car.pathIdx];
      if (dist2(car.pos, target) < 10) car.pathIdx++;
    }
    const want = Math.atan2(target.x - car.pos.x, target.z - car.pos.z);
    car.heading += Math.max(-2.2 * d, Math.min(2.2 * d, angleDiff(want, car.heading)));
    const distP = dist2(car.pos, p);
    let targetSpeed = distP < 8 ? 26 : Math.min(40, 18 + stars * 3);
    if (distP < 4) targetSpeed = 30;
    car.speed = (car.speed || 0) + Math.max(-10 * d, Math.min(8 * d, targetSpeed - (car.speed || 0)));
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    car.pos.x += fx * (car.speed || 0) * d;
    car.pos.z += fz * (car.speed || 0) * d;
    const pc = st.player.vehicle;
    if (pc && typeof pc === 'object' && dist2(car.pos, pc.pos) < 3.5) {
      pc.speed = (pc.speed || 0) * 0.7;
      car.speed = (car.speed || 0) * 0.8;
    }
  }
  for (const cop of st.actors.cops) {
    if (cop.hp <= 0) continue;
    const car = st.actors.cars.find((c) => c.id === cop.carId);
    if (!cop.onFoot) {
      if (car && dist2(car.pos, p) < 15 && st.player.onFoot) {
        cop.onFoot = true;
        cop.pos = { x: car.pos.x, y: 0, z: car.pos.z };
      } else if (car) {
        cop.pos = { x: car.pos.x, y: 0, z: car.pos.z };
        cop.heading = car.heading;
        continue;
      }
    }
    if (cop.onFoot) {
      const dd = dist2(cop.pos, p);
      if (dd > 3) {
        const a = Math.atan2(p.x - cop.pos.x, p.z - cop.pos.z);
        cop.heading = a;
        const step = Math.min(dd - 2, 3.4 * d);
        cop.pos.x += Math.sin(a) * step;
        cop.pos.z += Math.cos(a) * step;
      }
      policeArrestCheck(cop, st.player);
      policeShootCheck(cop, st.player);
    }
  }
  let seen = false;
  for (const cop of st.actors.cops) {
    if (cop.hp > 0 && dist2(cop.pos, p) < (ladder.radius || 80) && policeLineOfSight(cop, st.player)) { seen = true; break; }
  }
  if (st.police.heli) seen = true;
  st.police.seen = seen;
  if (seen) {
    st.wanted.lastSeenPos = { x: p.x, z: p.z };
    st.wanted.lastSeenTick = st.tick || 0;
  }
}
export function init(state) {
  S = state;
  ensure(state);
}
export function update(state, dt) {
  S = state;
  ensure(state);
  policePursuitUpdate(dt);
  policeHelicopterUpdate(dt);
}
