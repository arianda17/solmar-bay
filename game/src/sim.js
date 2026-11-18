export const TICK_DT = 1 / 60;
export const DEFAULT_SEED = 20261124;
export const GOLDEN_HOUR_MINUTES = 1060; // 17:40, static golden hour
export const WORLD_HALF = 1000; // 2.0 km x 2.0 km
export const WATER_LINE_Z = 920; // bay edge; water south of this line
export const WATER_BARRIER_Z = 922; // invisible barrier 2 m offshore
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(seed, cx, cz) {
  let h = (seed >>> 0) ^ Math.imul(cx | 0, 374761393) ^ Math.imul(cz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}
export function starsFromHeat(heat) {
  const s = Math.ceil(heat / 20);
  return s < 0 ? 0 : s > 5 ? 5 : s;
}
export function createSim(seed) {
  const s = seed === undefined ? DEFAULT_SEED : seed >>> 0;
  const state = {
    seed: s,
    tick: 0,
    timeMinutes: GOLDEN_HOUR_MINUTES,
    rng: mulberry32(s),
    player: {
      pos: { x: 0, y: 0, z: 40 },
      prevPos: { x: 0, y: 0, z: 40 },
      heading: 0,
      speed: 0,
      health: 100,
      stamina: 100,
      cash: 12450,
      onFoot: true,
      vehicle: null,
      lastDamageTick: -100000,
      vy: 0,
      grounded: true,
    },
    world: { roadGraph: null, districts: [] },
    actors: { cars: [], peds: [], cops: [] },
    wanted: { heat: 0, stars: 0, state: "clear" },
    mission: { current: null, step: 0, data: {} },
    flags: {},
    crimeQueue: [],
    traffic: { cars: [], pool: [] },
    peds: { list: [], pool: [] },
    police: { cruisers: [], helicopter: null, lastSeenTick: 0, unseenTicks: 0 },
    vehicles: { pool: [], playerCar: null },
    combat: { weapons: [], current: 0 },
    audio: { station: 0, muted: false },
    camera: { mode: "foot", shake: 0 },
    hud: { objective: "", prompt: "", toast: "" },
  };
  return state;
}
export function simSeed(state, seed) {
  state.seed = seed >>> 0;
  state.rng = mulberry32(state.seed);
  state.tick = 0;
  return state;
}
export function simClockTicks(state) {
  return state.tick;
}
export function simActors(state) {
  return state.actors;
}
export function simCollisions(state) {
  const hits = [];
  const colliders = state.world.colliders || [];
  const p = state.player.pos;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (p.x > c.minX - 0.6 && p.x < c.maxX + 0.6 && p.z > c.minZ - 0.6 && p.z < c.maxZ + 0.6) {
      hits.push(c);
    }
  }
  return hits;
}
export function simCrimeEvent(state, type, position, actor) {
  state.crimeQueue.push({
    type,
    x: position ? position.x : 0,
    y: position ? position.y : 0,
    z: position ? position.z : 0,
    actor: actor || "player",
    tick: state.tick,
  });
  return state.crimeQueue.length;
}
export function simSetWanted(state, level, st) {
  const stars = level < 0 ? 0 : level > 5 ? 5 : level;
  state.wanted.stars = stars;
  state.wanted.heat = stars * 20;
  if (st) state.wanted.state = st;
  else state.wanted.state = stars === 0 ? "clear" : "active";
  return state.wanted;
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function simTick(state, dt) {
  const step = dt || TICK_DT;
  state.tick += 1;
  const p = state.player;
  p.prevPos.x = p.pos.x;
  p.prevPos.y = p.pos.y;
  p.prevPos.z = p.pos.z;
  if (p.health > 0 && p.health < 40 && state.tick - p.lastDamageTick > 8 * 60) {
    p.health = Math.min(40, p.health + step * 1.5);
  }
  if (!state.flags.sprinting && p.stamina < 100) {
    p.stamina = Math.min(100, p.stamina + step * 20);
  }
  if (p.pos.z > WATER_BARRIER_Z) {
    p.pos.z = WATER_LINE_Z - 2;
    p.pos.x = clamp01((p.pos.x + WORLD_HALF) / (2 * WORLD_HALF)) * 2 * WORLD_HALF - WORLD_HALF;
    p.health = Math.max(1, p.health - 5);
    p.lastDamageTick = state.tick;
    state.flags.fellInWater = true;
  }
  if (p.pos.x > WORLD_HALF) p.pos.x = WORLD_HALF;
  if (p.pos.x < -WORLD_HALF) p.pos.x = -WORLD_HALF;
  if (p.pos.z > WATER_LINE_Z - 1) p.pos.z = WATER_LINE_Z - 1;
  if (p.pos.z < -WORLD_HALF) p.pos.z = -WORLD_HALF;
  state.wanted.stars = starsFromHeat(state.wanted.heat);
  if (state.wanted.stars === 0) state.wanted.state = "clear";
  if (state.crimeQueue.length > 0) {
    state.flags.lastCrime = state.crimeQueue[state.crimeQueue.length - 1];
    state.crimeQueue.length = 0;
  }
  return state;
}
