import { mulberry32, TICK_DT } from './sim.js';
import { randomLanePointNear } from './roadgraph.js';
import { districtFor } from './cityGenerator.js';
import { simCrimeEvent } from './sim.js';
let S = null;
let nextId = 1;
const POOL = 100;
const CELL = 20;
function rnd() {
  if (S && typeof S.rng === 'function') return S.rng();
  return mulberry32((S ? S.seed || 0 : 0) + (S ? S.tick || 0 : 0))();
}
function ensure(state) {
  if (!state.peds) state.peds = { hash: new Map(), spawned: 0 };
  if (!Array.isArray(state.actors.peds)) state.actors.peds = [];
  return state.peds;
}
function dist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
function hashKey(x, z) { return Math.floor(x / CELL) + ':' + Math.floor(z / CELL); }
export function rebuildHash() {
  const st = S;
  if (!st) return;
  const hash = new Map();
  for (const ped of st.actors.peds) {
    if (!ped || ped.state === 'dead') continue;
    const k = hashKey(ped.pos.x, ped.pos.z);
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push(ped);
  }
  st.peds.hash = hash;
}
export function pedsNear(pos, radius) {
  const st = S;
  if (!st) return [];
  const out = [];
  const minCx = Math.floor((pos.x - radius) / CELL), maxCx = Math.floor((pos.x + radius) / CELL);
  const minCz = Math.floor((pos.z - radius) / CELL), maxCz = Math.floor((pos.z + radius) / CELL);
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      const cell = st.peds.hash.get(cx + ':' + cz);
      if (!cell) continue;
      for (const ped of cell) if (dist2(ped.pos, pos) <= radius) out.push(ped);
    }
  }
  return out;
}
const PALETTES = [
  { skin: '#c68642', shirt: '#2980b9', pants: '#2c3e50' },
  { skin: '#8d5524', shirt: '#e74c3c', pants: '#34495e' },
  { skin: '#ffdbac', shirt: '#16a085', pants: '#7f8c8d' },
  { skin: '#f1c27d', shirt: '#f1c40f', pants: '#2c3e50' },
  { skin: '#a0663a', shirt: '#8e44ad', pants: '#1a1a1a' },
  { skin: '#e0ac69', shirt: '#ecf0f1', pants: '#2980b9' },
];
let renderApi = null;
let renderPromise = null;
function loadRender() {
  if (!renderPromise) {
    renderPromise = import('./render.js').then((m) => { renderApi = m; }).catch(() => { renderApi = null; });
  }
  return renderPromise;
}
function makePed(pos) {
  const pal = PALETTES[Math.floor(rnd() * PALETTES.length)];
  return {
    id: nextId++, pos: { x: pos.x, y: 0, z: pos.z }, heading: rnd() * Math.PI * 2,
    speed: 0, hp: 100, state: 'wander', stateTime: 0,
    target: null, pauseTime: 1 + rnd() * 5, palette: pal,
    mesh: null, cash: 10 + Math.floor(rnd() * 140),
  };
}
function spawnPointNear(playerPos) {
  try {
    const p = randomLanePointNear(playerPos, 40, 120);
    if (p && typeof p.x === 'number') {
      return { x: p.x + (rnd() - 0.5) * 8, z: p.z + (rnd() - 0.5) * 8 };
    }
  } catch (e) { }
  const a = rnd() * Math.PI * 2, r = 40 + rnd() * 80;
  return { x: playerPos.x + Math.cos(a) * r, z: playerPos.z + Math.sin(a) * r };
}
export function spawnPedsNear(player) {
  const st = S;
  if (!st) return [];
  ensure(st);
  const p = (player && player.pos) || st.player.pos;
  let district = '';
  try { district = districtFor(p.x, p.z) || ''; } catch (e) { }
  const dense = district === 'Port Lumen' || district === 'Palmera Row' || district === 'Cerro Verde';
  const sparse = district === 'Brisa Yards' || district === 'Las Salinas';
  const want = sparse ? 35 : dense ? 60 : 45;
  const out = [];
  let guard = 0;
  while (st.actors.peds.filter((x) => x.state !== 'dead').length < want && guard++ < 10) {
    if (st.actors.peds.length >= POOL) break;
    const ped = makePed(spawnPointNear(p));
    st.actors.peds.push(ped);
    st.peds.spawned++;
    out.push(ped);
    loadRender().then(() => {
      try { if (renderApi && typeof renderApi.addPedToScene === 'function') renderApi.addPedToScene(ped); } catch (e) { }
    });
  }
  return out;
}
export function despawnPed(ped) {
  const st = S;
  if (!st || !ped) return false;
  const i = st.actors.peds.indexOf(ped);
  if (i >= 0) st.actors.peds.splice(i, 1);
  ped.recycled = true;
  return true;
}
export function wander(ped) {
  if (!ped) return;
  ped.state = 'wander';
  ped.stateTime = 0;
  if (!ped.target || dist2(ped.pos, ped.target) < 2) {
    ped.target = spawnPointNear(ped.pos);
    ped.pauseTime = 2 + rnd() * 4;
  }
  ped.speed = 1.2 + rnd() * 0.4;
}
export function chat(ped) {
  if (!ped) return;
  ped.state = 'idle-group';
  ped.stateTime = 0;
  ped.speed = 0;
}
export function cower(ped) {
  if (!ped) return;
  ped.state = 'cower';
  ped.stateTime = 0;
  ped.speed = 0;
}
export function flee(ped) {
  if (!ped) return;
  ped.state = 'flee';
  ped.stateTime = 0;
  ped.speed = 4.5;
  const threat = (S && S.flags && S.flags.lastGunfire) ? S.flags.lastGunfire.pos : (S ? S.player.pos : ped.pos);
  const a = Math.atan2(ped.pos.x - threat.x, ped.pos.z - threat.z);
  ped.heading = a;
  ped.target = { x: ped.pos.x + Math.sin(a) * 60, z: ped.pos.z + Math.cos(a) * 60 };
}
export function callPolice(ped) {
  if (!ped) return;
  ped.state = 'call-police';
  ped.stateTime = 0;
  ped.speed = 0;
  ped.callDone = false;
}
export function fight(ped) {
  if (!ped) return;
  ped.state = 'fight';
  ped.stateTime = 0;
  ped.speed = 2.5;
}
export function ragdoll(ped) {
  if (!ped) return;
  ped.state = 'dead';
  ped.stateTime = 0;
  ped.speed = 0;
  ped.ragdoll = true;
}
export function knockdown(ped) {
  if (!ped) return;
  ped.state = 'knocked-down';
  ped.stateTime = 0;
  ped.speed = 0;
}
export function pedRobCash(ped) {
  if (!ped) return 0;
  const amount = ped.cash || 0;
  ped.cash = 0;
  if (S && S.player) S.player.cash = (S.player.cash || 0) + amount;
  return amount;
}
function threatNear(ped, radius) {
  const st = S;
  if (!st) return null;
  const gun = st.flags && st.flags.lastGunfire;
  if (gun) {
    const age = ((st.tick || 0) - (gun.tick || 0)) * (TICK_DT || 1 / 60);
    if (age < 8 && dist2(ped.pos, gun.pos) < radius) return gun.pos;
  }
  const exp = st.flags && st.flags.lastExplosion;
  if (exp && dist2(ped.pos, exp.pos) < radius) return exp.pos;
  if (st.combat && st.combat.aiming && st.player) {
    if (dist2(ped.pos, st.player.pos) < 12) return st.player.pos;
  }
  return null;
}
export function pedStateTransition(ped) {
  if (!ped || ped.state === 'dead') return;
  const threat = threatNear(ped, 25);
  if (ped.state === 'wander' || ped.state === 'idle-group') {
    if (threat) {
      if (dist2(ped.pos, threat) < 4) cower(ped);
      else flee(ped);
      return;
    }
    if (ped.state === 'wander' && rnd() < 0.002) {
      const near = pedsNear(ped.pos, 6).filter((q) => q !== ped && q.state === 'wander');
      if (near.length > 0) { chat(ped); chat(near[0]); return; }
    }
    if (ped.state === 'idle-group' && ped.stateTime > 6 + ped.pauseTime) wander(ped);
    return;
  }
  if (ped.state === 'cower') {
    if (ped.stateTime > 3 + rnd() * 2) flee(ped);
    else if (!threat) wander(ped);
    return;
  }
  if (ped.state === 'flee') {
    if (ped.stateTime > 6 && !threat) wander(ped);
    return;
  }
  if (ped.state === 'call-police') {
    if (ped.stateTime > 4) {
      if (!ped.callDone) {
        ped.callDone = true;
        try { simCrimeEvent(S, 'witness_call', ped.pos, 'ped'); } catch (e) { }
      }
      flee(ped);
    }
    return;
  }
  if (ped.state === 'knocked-down') {
    if (ped.stateTime > 2) flee(ped);
    return;
  }
  if (ped.state === 'fight') {
    if (ped.hp <= 0) { ragdoll(ped); return; }
    if (!threat && ped.stateTime > 5) wander(ped);
  }
}
function stepPed(ped, dt) {
  ped.stateTime += dt;
  if (ped.state === 'wander' || ped.state === 'flee' || ped.state === 'fight') {
    if (ped.target) {
      const dx = ped.target.x - ped.pos.x, dz = ped.target.z - ped.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.5) {
        ped.heading = Math.atan2(dx, dz);
        const step = Math.min(d, (ped.speed || 1.4) * dt);
        ped.pos.x += (dx / d) * step;
        ped.pos.z += (dz / d) * step;
      } else if (ped.state === 'wander') {
        ped.pauseTime -= dt;
        if (ped.pauseTime <= 0) { ped.target = null; wander(ped); }
      }
    } else {
      wander(ped);
    }
  }
  if (ped.hp <= 0 && ped.state !== 'dead') {
    ragdoll(ped);
    try { simCrimeEvent(S, 'kill_ped', ped.pos, 'player'); } catch (e) { }
  }
}
export function pedUpdate(dt) {
  const st = S;
  if (!st) return;
  const d = dt || TICK_DT || 1 / 60;
  ensure(st);
  rebuildHash();
  const p = st.player.pos;
  for (const ped of [...st.actors.peds]) {
    if (!ped) continue;
    if (ped.state === 'dead') {
      ped.stateTime += d;
      if (ped.stateTime > 20 || dist2(ped.pos, p) > 150) despawnPed(ped);
      continue;
    }
    if (dist2(ped.pos, p) > 150) { despawnPed(ped); continue; }
    pedStateTransition(ped);
    stepPed(ped, d);
    if (ped.state === 'wander' && st.flags && st.flags.lastGunfire) {
      const age = ((st.tick || 0) - (st.flags.lastGunfire.tick || 0)) * (TICK_DT || 1 / 60);
      if (age < 1 && dist2(ped.pos, st.flags.lastGunfire.pos) < 25 && rnd() < 0.15) callPolice(ped);
    }
  }
  spawnPedsNear(st.player);
}
export function init(state) {
  S = state;
  ensure(state);
  loadRender();
}
export function update(state, dt) {
  S = state;
  ensure(state);
  pedUpdate(dt);
}
