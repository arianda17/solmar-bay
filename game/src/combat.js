import { mulberry32, simCrimeEvent, TICK_DT } from './sim.js';
import { aimPressed, firePressed, keyPressed, consumePressed } from './input.js';
let S = null;
export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, range: 1.6, swing: 0.6, mag: Infinity, reload: 0 },
  pistol: { name: 'Dockside 9', damage: 18, range: 35, mag: 10, reload: 1.8, reserve: 60, auto: false },
  smg: { name: 'Kite-45', damage: 10, range: 25, mag: 30, reload: 2.4, reserve: 60, auto: true },
};
const SLOTS = ['fists', 'pistol', 'smg'];
function rnd() {
  if (S && typeof S.rng === 'function') return S.rng();
  return mulberry32((S ? S.seed || 0 : 0) + (S ? S.tick || 0 : 0))();
}
function ensure(state) {
  if (!state.combat) {
    state.combat = {
      slot: 'fists', ammo: { pistol: 10, smg: 30 }, reserve: { pistol: 60, smg: 60 },
      cooldown: 0, reloading: null, reloadTimer: 0, aiming: false,
      fx: [], lastShot: null, lastHitTick: -1,
    };
  }
  if (!state.combat.slot) state.combat.slot = 'fists';
  if (!state.combat.ammo) state.combat.ammo = { pistol: 10, smg: 30 };
  if (!state.combat.reserve) state.combat.reserve = { pistol: 60, smg: 60 };
  if (!Array.isArray(state.combat.fx)) state.combat.fx = [];
  return state.combat;
}
function safe(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}
export function weaponDamage(weapon, part) {
  const w = WEAPONS[weapon] || WEAPONS.fists;
  let dmg = w.damage;
  if (part === 'head') dmg *= 2;
  return dmg;
}
export function spawnMuzzleFlash(weapon) {
  const st = S;
  if (!st) return null;
  ensure(st);
  const p = st.player.pos;
  const fx = { kind: 'muzzle', weapon, pos: { x: p.x, y: 1.4, z: p.z }, tick: st.tick || 0 };
  st.combat.fx.push(fx);
  return fx;
}
export function spawnTracer(start, end) {
  const st = S;
  if (!st) return null;
  ensure(st);
  const fx = { kind: 'tracer', start: { ...start }, end: { ...end }, tick: st.tick || 0 };
  st.combat.fx.push(fx);
  if (st.combat.fx.length > 24) st.combat.fx.splice(0, st.combat.fx.length - 24);
  return fx;
}
export function spawnBloodPuff(pos) {
  const st = S;
  if (!st || !pos) return null;
  ensure(st);
  const fx = { kind: 'debris', pos: { ...pos }, tick: st.tick || 0 };
  st.combat.fx.push(fx);
  return fx;
}
function aimDir(spread) {
  const st = S;
  const heading = (st.player && st.player.heading) || 0;
  const a = heading + (spread ? (rnd() - 0.5) * spread : 0);
  return { x: Math.sin(a), y: 0, z: Math.cos(a) };
}
function targetsInCone(origin, dir, range, maxAngle) {
  const st = S;
  const hits = [];
  const consider = (ent, kind) => {
    if (!ent || ent.hp == null || ent.hp <= 0) return;
    if (ent.state === 'dead') return;
    const dx = ent.pos.x - origin.x, dz = ent.pos.z - origin.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > range || d < 0.01) return;
    const dot = (dx * dir.x + dz * dir.z) / d;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (angle <= maxAngle) hits.push({ ent, kind, dist: d, angle });
  };
  for (const ped of st.actors.peds || []) consider(ped, 'ped');
  for (const cop of st.actors.cops || []) consider(cop, 'cop');
  const enemies = (st.mission && st.mission.data && st.mission.data.enemies) || [];
  for (const e of enemies) if (e.alive !== false) consider(e, 'enemy');
  hits.sort((a, b) => a.dist - b.dist);
  return hits;
}
export function hitscanShot(origin, dir, range, spread) {
  const st = S;
  if (!st) return null;
  ensure(st);
  const o = origin || st.player.pos;
  const d = dir || aimDir(spread || 0.02);
  const hits = targetsInCone(o, d, range || 35, 0.09 + (spread || 0));
  const end = hits.length > 0
    ? { x: hits[0].ent.pos.x, y: 1.2, z: hits[0].ent.pos.z }
    : { x: o.x + d.x * (range || 35), y: 1.2, z: o.z + d.z * (range || 35) };
  spawnTracer({ x: o.x, y: 1.4, z: o.z }, end);
  if (hits.length === 0) return null;
  const hit = hits[0];
  const weapon = st.combat.slot;
  applyDamage(hit.ent, weaponDamage(weapon, 'body'), { ...hit.ent.pos }, d, 'body');
  return hit.ent;
}
export function applyDamage(entity, damage, hitPoint, direction, part) {
  const st = S;
  if (!entity || entity.hp == null) return 0;
  const dmg = damage || 0;
  entity.hp = Math.max(0, entity.hp - dmg);
  entity.lastDamageTick = st ? st.tick || 0 : 0;
  if (hitPoint) spawnBloodPuff(hitPoint);
  if (st) {
    st.combat.lastHitTick = st.tick || 0;
    if (st.hud) st.hud.hitmarkerTick = st.tick || 0;
  }
  if (entity.hp <= 0) {
    if (entity.state === 'cower' || entity.state === 'wander' || entity.state === 'flee' || entity.state === 'idle-group') {
      entity.state = 'dead';
      entity.stateTime = 0;
      if (st) {
        try { simCrimeEvent(st, 'kill_ped', entity.pos, 'player'); } catch (e) { }
      }
    } else if (entity.carId != null) {
      if (st) {
        try { simCrimeEvent(st, 'kill_cop', entity.pos, 'player'); } catch (e) { }
      }
    } else if (entity.missionEnemy) {
      entity.alive = false;
      if (st && st.mission && st.mission.data) st.mission.data.kills = (st.mission.data.kills || 0) + 1;
    }
  }
  return entity.hp;
}
export function meleeSwing() {
  const st = S;
  if (!st) return null;
  ensure(st);
  if (st.combat.cooldown > 0) return null;
  st.combat.cooldown = WEAPONS.fists.swing;
  const origin = st.player.pos;
  const dir = aimDir(0);
  const hits = targetsInCone(origin, dir, WEAPONS.fists.range, 0.6);
  if (hits.length === 0) return null;
  const target = hits[0].ent;
  applyDamage(target, weaponDamage('fists', 'body'), { ...target.pos }, dir, 'body');
  return target;
}
export function reload(weapon) {
  const st = S;
  if (!st) return false;
  ensure(st);
  const slot = weapon || st.combat.slot;
  const w = WEAPONS[slot];
  if (!w || !w.mag || w.mag === Infinity) return false;
  if (st.combat.reloading) return false;
  const need = w.mag - (st.combat.ammo[slot] || 0);
  if (need <= 0) return false;
  if ((st.combat.reserve[slot] || 0) <= 0) return false;
  st.combat.reloading = slot;
  st.combat.reloadTimer = w.reload;
  return true;
}
function fireWeapon() {
  const st = S;
  const c = st.combat;
  const slot = c.slot;
  const w = WEAPONS[slot];
  if (slot === 'fists') { meleeSwing(); return; }
  if (c.reloading) return;
  if ((c.ammo[slot] || 0) <= 0) {
    c.lastShot = { weapon: slot, dry: true, tick: st.tick || 0 };
    reload(slot);
    return;
  }
  c.ammo[slot]--;
  const spread = c.aiming ? 0.02 : 0.16;
  const origin = st.player.pos;
  const dir = aimDir(spread);
  spawnMuzzleFlash(slot);
  hitscanShot(origin, dir, w.range, spread);
  try { simCrimeEvent(st, 'shot_fired', origin, 'player'); } catch (e) { }
  if (st.flags) st.flags.lastGunfire = { pos: { x: origin.x, z: origin.z }, tick: st.tick || 0 };
  c.lastShot = { weapon: slot, tick: st.tick || 0 };
  c.cooldown = slot === 'smg' ? 0.11 : 0.28;
}
export function fireFromVehicle(car, side) { return false; }
function switchWeapon() {
  const st = S;
  const c = st.combat;
  if (safe(() => consumePressed('Digit1'), false)) { c.slot = 'fists'; c.reloading = null; return; }
  if (safe(() => consumePressed('Digit2'), false)) { c.slot = 'pistol'; c.reloading = null; return; }
  if (safe(() => consumePressed('Digit3'), false)) { c.slot = 'smg'; c.reloading = null; return; }
  const wheel = safe(() => consumePressed('wheel'), 0);
  if (wheel) {
    const i = SLOTS.indexOf(c.slot);
    const next = (i + (wheel > 0 ? 1 : SLOTS.length - 1)) % SLOTS.length;
    c.slot = SLOTS[next];
    c.reloading = null;
  }
}
export function init(state) {
  S = state;
  ensure(state);
}
export function update(state, dt) {
  S = state;
  const d = dt || TICK_DT || 1 / 60;
  const c = ensure(state);
  if (state.player && state.player.onFoot === false) return; // in vehicle: no on-foot combat
  c.aiming = safe(() => aimPressed(), false);
  if (c.cooldown > 0) c.cooldown -= d;
  if (c.reloading) {
    c.reloadTimer -= d;
    if (c.reloadTimer <= 0) {
      const slot = c.reloading;
      const w = WEAPONS[slot];
      const need = w.mag - (c.ammo[slot] || 0);
      const take = Math.min(need, c.reserve[slot] || 0);
      c.ammo[slot] = (c.ammo[slot] || 0) + take;
      c.reserve[slot] = (c.reserve[slot] || 0) - take;
      c.reloading = null;
    }
  }
  switchWeapon();
  if (safe(() => consumePressed('KeyR'), false) || safe(() => keyPressed('KeyR'), false)) reload(c.slot);
  const firing = safe(() => firePressed(), false);
  if (firing && c.cooldown <= 0) {
    if (c.slot === 'smg') fireWeapon();
    else if (safe(() => consumePressed('fire'), true)) fireWeapon();
  }
}
