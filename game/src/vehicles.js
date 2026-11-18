import { mulberry32, TICK_DT } from './sim.js';
import { nearestLanePoint } from './roadgraph.js';
import { simCrimeEvent } from './sim.js';
export const TOP_SPEEDS = { mico: 34, viajero: 38, furia: 48, terraza: 33, bruto: 32, enforcer: 44 };
const ACCEL = { mico: 4.4, viajero: 4.0, furia: 5.6, terraza: 3.2, bruto: 2.9, enforcer: 5.0 };
const COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#7f8c8d', '#16a085', '#e67e22', '#ecf0f1', '#2c3e50'];
let S = null;
let nextId = 1;
let renderApi = null;
let renderPromise = null;
function loadRender() {
  if (!renderPromise) {
    renderPromise = import('./render.js').then((m) => { renderApi = m; }).catch(() => { renderApi = null; });
  }
  return renderPromise;
}
function rnd() {
  if (S && typeof S.rng === 'function') return S.rng();
  return mulberry32((S ? S.seed || 0 : 0) + (S ? S.tick || 0 : 0))();
}
function ensure(state) {
  if (!state.vehicles) state.vehicles = { fx: [], spawned: 0 };
  if (!Array.isArray(state.actors.cars)) state.actors.cars = [];
  if (!Array.isArray(state.actors.peds)) state.actors.peds = [];
  return state.vehicles;
}
export function playerCar(state) {
  const st = state || S;
  if (!st) return null;
  const v = st.player && st.player.vehicle;
  if (v && typeof v === 'object') return v;
  if (v != null && st.actors && Array.isArray(st.actors.cars)) {
    const found = st.actors.cars.find((c) => c.id === v);
    if (found) return found;
  }
  if (st.actors && Array.isArray(st.actors.cars)) return st.actors.cars.find((c) => c.player) || null;
  return null;
}
function forward(heading) { return { x: Math.sin(heading), z: Math.cos(heading) }; }
export function stepVehicle(state, input, dt) {
  const d = dt || TICK_DT || 1 / 60;
  const car = (input && input.car) || playerCar(state);
  if (!car) return null;
  const top = TOP_SPEEDS[car.archetype] || 34;
  const acc = ACCEL[car.archetype] || 4;
  const throttle = (input && input.throttle) || 0;
  const brake = (input && input.brake) || 0;
  const steer = (input && input.steer) || 0;
  const hand = input && input.handbrake;
  let speed = car.speed || 0;
  if (input && input.reverse && speed < 0.5) speed -= acc * 0.6 * d;
  else speed += throttle * acc * d;
  speed -= brake * 10 * d;
  if (!throttle && !brake) speed -= Math.sign(speed) * 1.5 * d;
  if (hand) speed *= Math.max(0, 1 - 1.6 * d);
  if (speed > top) speed = top;
  if (speed < -12) speed = -12;
  if (Math.abs(speed) < 0.05 && !throttle) speed = 0;
  const grip = hand ? 0.55 : 1;
  const steerRate = (speed >= 0 ? 1 : -1) * steer * 1.9 * grip * Math.min(1, Math.abs(speed) / 8 + 0.25);
  car.heading = (car.heading || 0) + steerRate * d * Math.sign(speed || 1);
  const f = forward(car.heading);
  car.pos.x += f.x * speed * d;
  car.pos.z += f.z * speed * d;
  car.speed = speed;
  if (car.pos.y == null) car.pos.y = 0;
  return car;
}
export function spawnPlayerCar(archetype, pos) {
  const st = S;
  const p = pos || { x: 0, y: 0, z: 0 };
  const car = {
    id: nextId++, archetype: archetype || 'mico',
    pos: { x: p.x, y: p.y || 0, z: p.z }, heading: p.heading || 0,
    speed: 0, damage: 100, color: COLORS[Math.floor(rnd() * COLORS.length)],
    mesh: null, player: true, disabled: false, exploded: false,
  };
  if (st) {
    ensure(st);
    st.actors.cars.push(car);
    st.vehicles.spawned++;
  }
  loadRender().then(() => {
    try { if (renderApi && typeof renderApi.addCarToScene === 'function') renderApi.addCarToScene(car); } catch (e) { }
  });
  return car;
}
export function spawnCar(archetype, pos, opts) {
  const car = spawnPlayerCar(archetype, pos);
  car.player = false;
  if (opts) {
    if (opts.heading != null) car.heading = opts.heading;
    if (opts.speed != null) car.speed = opts.speed;
    if (opts.color) car.color = opts.color;
    if (opts.cop) car.cop = true;
    if (opts.parked) car.parked = true;
  }
  return car;
}
export function recycleCar(car) {
  const st = S;
  if (!st || !car) return false;
  const arr = st.actors.cars;
  const i = arr.indexOf(car);
  if (i >= 0) arr.splice(i, 1);
  car.recycled = true;
  return true;
}
export function carHealth(car) {
  if (!car) return 0;
  return Math.max(0, Math.min(100, car.damage == null ? 100 : car.damage));
}
export function carExplode(car) {
  if (!car || car.exploded) return car;
  car.exploded = true;
  car.disabled = true;
  car.speed = 0;
  car.damage = 0;
  if (S) {
    ensure(S);
    S.vehicles.fx.push({ kind: 'explosion', pos: { ...car.pos }, tick: S.tick || 0 });
    try { simCrimeEvent(S, 'explosion', car.pos, 'player'); } catch (e) { }
  }
  return car;
}
export function applyCrashDamage(impulseSpeed, car) {
  const target = car || playerCar(S);
  if (!target) return 0;
  const dmg = Math.max(0, (impulseSpeed || 0) - 2) * 2.2;
  target.damage = Math.max(0, (target.damage == null ? 100 : target.damage) - dmg);
  if (target.damage <= 0) carExplode(target);
  return target.damage;
}
export function wheelMatrix(i, state) {
  const car = playerCar(state || S);
  const base = car ? car.pos : { x: 0, y: 0, z: 0 };
  const heading = car ? car.heading || 0 : 0;
  const offs = [[-0.8, 1.1], [0.8, 1.1], [-0.8, -1.1], [0.8, -1.1]][i % 4];
  const c = Math.cos(heading), s = Math.sin(heading);
  return {
    x: base.x + offs[0] * c - offs[1] * s,
    y: (base.y || 0) + 0.35,
    z: base.z + offs[0] * s + offs[1] * c,
    rotY: heading,
  };
}
function collidePlayerCar(state, dt) {
  const pc = playerCar(state);
  if (!pc || pc.disabled) return;
  const pSpeed = Math.abs(pc.speed || 0);
  for (const other of state.actors.cars) {
    if (other === pc || other.recycled || other.disabled) continue;
    const dx = other.pos.x - pc.pos.x, dz = other.pos.z - pc.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 9) {
      const impact = Math.abs((pc.speed || 0) - (other.speed || 0));
      if (impact > 4) {
        applyCrashDamage(impact, pc);
        applyCrashDamage(impact * 0.8, other);
        pc.speed = (pc.speed || 0) * 0.6;
        other.speed = (other.speed || 0) * 0.5;
        state.vehicles.fx.push({ kind: 'crash', pos: { ...pc.pos }, tick: state.tick || 0 });
      } else if (pSpeed > 0.5) {
        pc.speed = (pc.speed || 0) * 0.98;
      }
    }
  }
  if (pSpeed > 5) {
    for (const ped of state.actors.peds) {
      if (!ped || ped.state === 'dead' || ped.state === 'knocked-down') continue;
      const dx = ped.pos.x - pc.pos.x, dz = ped.pos.z - pc.pos.z;
      if (dx * dx + dz * dz < 4) {
        ped.hp = 0;
        ped.state = 'dead';
        ped.stateTime = 0;
        try { simCrimeEvent(state, 'kill_ped', ped.pos, 'player'); } catch (e) { }
        state.vehicles.fx.push({ kind: 'debris', pos: { ...ped.pos }, tick: state.tick || 0 });
        applyCrashDamage(2, pc);
      }
    }
  }
}
export function init(state) {
  S = state;
  ensure(state);
  loadRender();
}
export function update(state, dt) {
  S = state;
  const d = dt || TICK_DT || 1 / 60;
  ensure(state);
  for (const car of state.actors.cars) {
    if (!car || car.recycled || car.player || car.disabled) continue;
    const f = forward(car.heading || 0);
    car.pos.x += f.x * (car.speed || 0) * d;
    car.pos.z += f.z * (car.speed || 0) * d;
    if (car.damage != null && car.damage <= 0 && !car.exploded) carExplode(car);
  }
  collidePlayerCar(state, d);
  const fx = state.vehicles.fx;
  if (fx.length > 40) fx.splice(0, fx.length - 40);
}
