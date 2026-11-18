import { starsFromHeat as simStarsFromHeat, TICK_DT } from './sim.js';
let S = null;
export const CRIME_HEAT = {
  carjack: 20,
  shot_fired: 15,
  public_gunfire: 15,
  hit_ped: 10,
  attack_ped: 10,
  kill_ped: 20,
  kill_cop: 40,
  steal_police_vehicle: 30,
  hit_police: 20,
  hit_police_vehicle: 20,
  damage_police_vehicle: 20,
  rob_store: 30,
  explosion: 25,
  attack_helicopter: 20,
  kill_swat: 20,
  witness_call: 10,
  rob_ped: 10,
};
const SEARCH_RADIUS = { 0: 0, 1: 80, 2: 100, 3: 120, 4: 150, 5: 180 };
const ESCAPE_TIME = { 0: 0, 1: 15, 2: 20, 3: 25, 4: 30, 5: 35 };
function ensure(state) {
  if (!state.wanted) state.wanted = { heat: 0, stars: 0, state: 'clear' };
  if (state.wanted.heat == null) state.wanted.heat = 0;
  if (state.wanted.stars == null) state.wanted.stars = 0;
  if (!state.wanted.hotScenes) state.wanted.hotScenes = [];
  if (state.wanted.lastCrimeTick == null) state.wanted.lastCrimeTick = -9999;
  if (state.wanted.noLosTime == null) state.wanted.noLosTime = 0;
  if (!Array.isArray(state.crimeQueue)) state.crimeQueue = [];
  return state.wanted;
}
export function starsFromHeat(heat) {
  const h = Math.max(0, Math.min(100, heat || 0));
  if (h <= 0) return 0;
  return Math.max(0, Math.min(5, Math.ceil(h / 20)));
}
export function wantedState(level) {
  if (!level) return 'clear';
  if (S && S.police && S.police.seen) return 'active';
  if (S && S.wanted && S.wanted.noLosTime > 0) return 'searching';
  return 'responding';
}
export function searchCircle(level) {
  const st = S;
  const center = (st && st.wanted && st.wanted.lastSeenPos) || (st && st.player ? { x: st.player.pos.x, z: st.player.pos.z } : { x: 0, z: 0 });
  return { center: { x: center.x, z: center.z }, radius: SEARCH_RADIUS[level] || 0 };
}
export function hotSceneAdd(position) {
  const st = S;
  if (!st || !position) return null;
  ensure(st);
  const scene = { pos: { x: position.x, z: position.z }, expiresTick: (st.tick || 0) + 120 * 60 };
  st.wanted.hotScenes.push(scene);
  return scene;
}
export function hotSceneActive(pos) {
  const st = S;
  if (!st || !pos) return false;
  ensure(st);
  const now = st.tick || 0;
  st.wanted.hotScenes = st.wanted.hotScenes.filter((s) => s.expiresTick > now);
  for (const s of st.wanted.hotScenes) {
    const dx = s.pos.x - pos.x, dz = s.pos.z - pos.z;
    if (dx * dx + dz * dz < 60 * 60) return true;
  }
  return false;
}
export function resprayCost(stars) {
  return 1000 * Math.max(0, Math.min(5, stars || 0));
}
export function wantedClear() {
  const st = S;
  if (!st) return;
  ensure(st);
  st.wanted.heat = 0;
  st.wanted.stars = 0;
  st.wanted.state = 'clear';
  st.wanted.noLosTime = 0;
  st.wanted.hotScenes = [];
}
function applyHeat(amount, position) {
  const st = S;
  if (!st) return;
  ensure(st);
  st.wanted.heat = Math.max(0, Math.min(100, st.wanted.heat + amount));
  st.wanted.stars = starsFromHeat(st.wanted.heat);
  st.wanted.lastCrimeTick = st.tick || 0;
  st.wanted.noLosTime = 0;
  if (position) hotSceneAdd(position);
}
export function heatRise(crimeType, position, actor) {
  const amount = CRIME_HEAT[crimeType];
  if (amount == null) return 0;
  applyHeat(amount, position);
  return amount;
}
export function heatDecay(dt) {
  const st = S;
  if (!st) return;
  ensure(st);
  const d = dt || TICK_DT || 1 / 60;
  const w = st.wanted;
  if (w.heat <= 0) return;
  const seen = st.police && st.police.seen;
  if (seen) { w.noLosTime = 0; return; }
  const sinceCrime = ((st.tick || 0) - (w.lastCrimeTick || 0)) * (TICK_DT || 1 / 60);
  if (sinceCrime < 12) return;
  w.heat = Math.max(0, w.heat - 2 * d);
  w.stars = starsFromHeat(w.heat);
}
function escapeStep(dt) {
  const st = S;
  if (!st) return;
  ensure(st);
  const w = st.wanted;
  if (w.stars <= 0) { w.noLosTime = 0; return; }
  const seen = st.police && st.police.seen;
  if (seen) { w.noLosTime = 0; return; }
  const d = dt || TICK_DT || 1 / 60;
  w.noLosTime += d;
  const need = ESCAPE_TIME[w.stars] || (10 + 5 * w.stars);
  if (w.noLosTime >= need) {
    w.stars -= 1;
    w.heat = w.stars * 20;
    w.noLosTime = 0;
    if (w.stars === 0) w.state = 'clear';
  }
}
export function updateWantedHeat(crimes, dt) {
  const st = S;
  if (!st) return;
  ensure(st);
  const list = crimes || [];
  for (const crime of list) {
    if (typeof crime === 'string') { heatRise(crime, st.player ? st.player.pos : null, 'player'); continue; }
    if (!crime) continue;
    const type = crime.type || crime.crime || crime.name;
    const pos = crime.position || crime.pos || null;
    if (type) heatRise(type, pos, crime.actor || 'player');
  }
  heatDecay(dt);
  escapeStep(dt);
  const w = st.wanted;
  w.state = w.stars === 0 ? 'clear' : wantedState(w.stars);
}
export function init(state) {
  S = state;
  ensure(state);
}
export function update(state, dt) {
  S = state;
  ensure(state);
  const queued = state.crimeQueue.splice(0, state.crimeQueue.length);
  updateWantedHeat(queued, dt);
}
