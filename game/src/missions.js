import { TICK_DT, starsFromHeat } from './sim.js';
import { spawnPointForDistrict } from './cityGenerator.js';
import { enterExitPressed, consumePressed } from './input.js';
let S = null;
function marker(district) {
  try { const p = spawnPointForDistrict(district); if (p && typeof p.x === 'number') return { x: p.x, y: p.y || 0, z: p.z }; } catch (e) { }
  return { x: 0, y: 0, z: 0 };
}
function dist2(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb; } }
function st(type, text, district, o) { return { type, text, district, radius: 10, ...(o || {}) }; }
const PL = 'Port Lumen', BY = 'Brisa Yards', PR = 'Palmera Row', CV = 'Cerro Verde', AM = 'Alto Mar';
const MISSIONS = {
  M1: { name: 'Pier Run', giver: 'Nia Calder', reward: 400, unlocks: ['safehouse', 'M2', 'pistol'],
    briefing: ['Nia: "Rafe. You are late. Get to the promenade. We have a van that needs a new owner."',
      'Rafe: "You could just say steal a car."', 'Nia: "I could. But I am being polite. First job is always free."'],
    steps: [st('goto', 'Walk to the marker on Tidewheel Promenade', PL, { checkpoint: true }),
      st('enter_vehicle', 'Steal the parked Mico (E)', PL, { checkpoint: true }),
      st('deliver_vehicle', 'Drive to the Cerro Verde safehouse', CV),
      st('goto', 'Talk to Nia at the safehouse (E)', CV, { radius: 6, interact: true })] },
  M2: { name: 'Cargo Manifest', giver: 'Nia Calder', reward: 650, unlocks: ['tomo', 'respray', 'M3', 'smg_shop'],
    briefing: ['Nia: "A smuggler named Pico is moving a van tonight. Tail him. Do not get seen."',
      'Rafe: "And if he runs?"', 'Nia: "Then you run faster. Bring me the van."'],
    steps: [st('goto', 'Drive to the tail start in Brisa Yards', BY, { checkpoint: true }),
      st('tail', "Tail Pico's van: stay 25-60 m for 90 s", BY, { tailTime: 90, checkpoint: true }),
      st('enter_vehicle', "Steal Pico's van (E)", BY, { checkpoint: true }),
      st('escape', 'Lose the patrol', BY),
      st('deliver_vehicle', "Deliver the van to Tomo's chop shop", BY)] },
  M3: { name: 'Hot Wire', giver: 'Tomo Varela', reward: 1200, unlocks: ['M4', 'M5', 'furia_traffic', 'respray_recolor'],
    briefing: ['Tomo: "There is a Furia 2 in the Sunflare garage. Blue, loud, worth a fortune. Get it out clean."',
      'Rafe: "Clean. Right. And if the patrol shows?"', 'Tomo: "Then you improvise. That is what you are good at."'],
    steps: [st('goto', 'Drive to the Sunflare Hotel parking entrance', PR, { checkpoint: true }),
      st('goto', 'Enter the parking structure on foot (E)', PR, { radius: 6, interact: true }),
      st('enter_vehicle', 'Steal the Furia 2 (E)', PR, { checkpoint: true }),
      st('goto', 'Exit the parking structure via the ramp', PR),
      st('escape', 'Escape the Coastal Patrol', PR),
      st('deliver_vehicle', "Deliver the Furia 2 to Tomo's", BY)] },
  M4: { name: 'The Drop', giver: 'Nia Calder', reward: 1500, unlocks: ['courier', 'bullet_barn'],
    briefing: ['Nia: "Package. Pier. Twelve minutes. Do not open it, do not drop it, do not be late."',
      'Rafe: "What is in it?"', 'Nia: "Curiosity kills couriers, Rafe. Drive."'],
    steps: [st('pickup', 'Pick up the package in Port Lumen (E)', PL, { radius: 6, checkpoint: true }),
      st('goto', 'Drive to Solmar Pier (12:00 left)', PR, { timer: 720 }),
      st('goto', 'Deliver the package at the pier (E)', PR, { radius: 6, interact: true, spawnGuards: 2 }),
      st('kill', 'Eliminate the guards 0/2', PR, { count: 2, checkpoint: true }),
      st('escape', 'Escape the pier area', PR),
      st('goto', 'Return to Nia at Casa de Radios', AM)] },
  M5: { name: 'Ridgeline', giver: 'Mara Solis', reward: 800, unlocks: ['street_races'],
    briefing: ['Mara: "Three laps. Switchbacks. No shortcuts, no excuses. Beat my time and I will owe you one."',
      'Rafe: "And if I lose?"', 'Mara: "Then you buy the drinks. Fair?"'],
    steps: [st('goto', 'Drive to the Ridgeline start line', AM, { checkpoint: true }),
      st('race', 'Race 3 laps — finish 1st', AM, { laps: 3, checkpoints: 4 }),
      st('goto', 'Talk to Mara at the finish (E)', AM, { radius: 6, interact: true })] },
  M6: { name: "Captain's Debt", giver: 'Tomo Varela', reward: 2500, unlocks: ['all_districts', 'stats', 'replay'],
    briefing: ['Tomo: "They took the depot. Serrano\'s men. I am inside, Rafe. Get me out."',
      'Rafe: "Serrano himself?"', 'Tomo: "His dogs. The captain stays clean. But the evidence is in the office. Grab it and run."'],
    steps: [st('goto', 'Drive to the Brisa Yards depot entrance', BY, { checkpoint: true }),
      st('goto', 'Enter the depot on foot (E)', BY, { radius: 6, interact: true }),
      st('kill', 'Clear the depot guards 0/4', BY, { count: 4, spawnGuards: 4, checkpoint: true }),
      st('goto', 'Free Tomo from the holding room (E)', BY, { radius: 6, interact: true }),
      st('pickup', 'Grab the evidence briefcase (E)', BY, { radius: 6 }),
      st('escort', 'Escape the depot with Tomo', BY, { radius: 12 }),
      st('escape', 'Escape the patrol with Tomo', BY),
      st('deliver_vehicle', 'Drive Tomo to the Cerro Verde safehouse', CV)] },
};
function ensure(state) {
  if (!state.mission) state.mission = { current: null, step: 0, data: {} };
  if (!state.mission.data) state.mission.data = {};
  if (!state.mission.completed) state.mission.completed = {};
  return state.mission;
}
function stepPos(step) { if (!step.pos) step.pos = marker(step.district || PL); return step.pos; }
function currentStep(state) {
  const m = state.mission;
  if (!m || !m.current) return null;
  const def = MISSIONS[m.current];
  return def ? (def.steps[m.step] || null) : null;
}
function setObjective(state, text) {
  if (state.hud) state.hud.objective = text;
  const step = currentStep(state);
  if (state.mission && state.mission.data) {
    state.mission.data.blips = step ? [{ pos: stepPos(step), kind: 'objective', label: text }] : [];
  }
}
export function missionObjective(step) {
  if (step == null) return currentStep(S);
  const m = S && S.mission;
  return (m && m.current) ? (MISSIONS[m.current].steps[step] || null) : null;
}
function spawnGuards(state, count, hp) {
  const step = currentStep(state);
  const base = step ? stepPos(step) : state.player.pos;
  const enemies = [];
  for (let i = 0; i < count; i++) {
    enemies.push({ pos: { x: base.x + (i - count / 2) * 6, y: 0, z: base.z + 8 + i * 3 }, hp, alive: true, missionEnemy: true, state: 'fight' });
  }
  state.mission.data.enemies = enemies;
  state.mission.data.kills = 0;
}
function applyHeatSpike(state, heat) {
  if (!state.wanted) state.wanted = { heat: 0, stars: 0, state: 'clear' };
  state.wanted.heat = Math.max(0, Math.min(100, heat));
  state.wanted.stars = starsFromHeat(state.wanted.heat);
  state.wanted.lastCrimeTick = state.tick || 0;
  state.wanted.noLosTime = 0;
}
function beginStep(state) {
  const step = currentStep(state);
  if (!step) return;
  const data = state.mission.data;
  data.timer = step.timer || 0; data.tailTime = 0; data.lostTime = 0; data.lap = 0; data.checkpointIdx = 0;
  if (step.spawnGuards) spawnGuards(state, step.spawnGuards, state.mission.current === 'M6' ? 80 : 60);
  if (step.checkpoint) data.checkpoint = state.mission.step;
  setObjective(state, step.text);
  if (state.mission.current === 'M3' && state.mission.step === 4) applyHeatSpike(state, 40);
  if (state.mission.current === 'M6' && state.mission.step === 6) applyHeatSpike(state, 60);
}
export function missionStart(name) {
  const st2 = S;
  const def = MISSIONS[name];
  if (!st2 || !def) return false;
  ensure(st2);
  st2.mission.current = name; st2.mission.step = 0; st2.mission.failed = null;
  st2.mission.data = { blips: [], kills: 0, checkpoint: 0, enemies: [] };
  cutscenePlay(def.briefing);
  beginStep(st2);
  return true;
}
export function cutscenePlay(script) {
  const st2 = S;
  if (!st2) return;
  ensure(st2);
  const lines = Array.isArray(script) ? script : [String(script)];
  st2.mission.data.dialogue = { lines, idx: 0 };
  if (st2.hud) { st2.hud.objective = lines[0] || ''; st2.hud.prompt = 'Enter / click to continue'; }
}
function advanceDialogue(state) {
  const d = state.mission.data.dialogue;
  if (!d) return false;
  d.idx++;
  if (d.idx >= d.lines.length) {
    state.mission.data.dialogue = null;
    const step = currentStep(state);
    if (step) setObjective(state, step.text);
    return false;
  }
  if (state.hud) state.hud.objective = d.lines[d.idx];
  return true;
}
function autosave(state) {
  import('./saveStore.js').then((m) => {
    try { if (typeof m.saveAutosave === 'function') m.saveAutosave(state); } catch (e) { }
  }).catch(() => { });
}
export function missionPassed(reward) {
  const st2 = S;
  if (!st2 || !st2.mission.current) return false;
  const def = MISSIONS[st2.mission.current];
  const cash = reward != null ? reward : (def ? def.reward : 0);
  st2.player.cash = (st2.player.cash || 0) + cash;
  st2.mission.completed[st2.mission.current] = true;
  if (!st2.flags) st2.flags = {};
  if (!st2.flags.unlocks) st2.flags.unlocks = [];
  for (const u of (def ? def.unlocks : [])) if (!st2.flags.unlocks.includes(u)) st2.flags.unlocks.push(u);
  if (st2.hud) { st2.hud.objective = 'MISSION PASSED +$' + cash; st2.hud.prompt = 'Autosaved'; }
  if (st2.mission.current === 'M6' && st2.hud) st2.hud.objective = 'Debt cleared. Solmar Bay remembers. +$' + cash;
  const done = st2.mission.current;
  st2.mission.current = null; st2.mission.step = 0; st2.mission.data = { blips: [] };
  autosave(st2);
  return done;
}
export function missionFail(reason) {
  const st2 = S;
  if (!st2) return;
  ensure(st2);
  st2.mission.failed = reason || 'Mission failed';
  if (st2.hud) { st2.hud.objective = 'MISSION FAILED — ' + st2.mission.failed; st2.hud.prompt = 'Enter to retry from checkpoint'; }
  autosave(st2);
}
export function missionRetry() {
  const st2 = S;
  if (!st2) return false;
  ensure(st2);
  const cp = (st2.mission.data && st2.mission.data.checkpoint) || 0;
  st2.mission.step = cp; st2.mission.failed = null;
  st2.mission.data.kills = 0; st2.mission.data.enemies = [];
  if (st2.player) st2.player.health = Math.max(st2.player.health || 100, 60);
  beginStep(st2);
  return true;
}
export function missionBlips() {
  const st2 = S;
  if (!st2) return [];
  ensure(st2);
  return (st2.mission.data && st2.mission.data.blips) || [];
}
function stepDone(state, step, dt) {
  const data = state.mission.data;
  const p = state.player.pos;
  const pos = stepPos(step);
  switch (step.type) {
    case 'goto':
      if (dist2(p, pos) < (step.radius || 10)) {
        if (step.interact) return safe(() => enterExitPressed(), false);
        return true;
      }
      return false;
    case 'enter_vehicle': return !!state.player.vehicle;
    case 'deliver_vehicle': return !!state.player.vehicle && dist2(p, pos) < (step.radius || 10);
    case 'pickup': return dist2(p, pos) < (step.radius || 6) && safe(() => enterExitPressed(), false);
    case 'kill': return (data.kills || 0) >= (step.count || 1);
    case 'survive': data.timer -= dt; return data.timer <= 0;
    case 'escape': return ((state.wanted && state.wanted.stars) || 0) === 0;
    case 'tail': {
      const target = data.targetCar;
      if (!target) return false;
      const d = dist2(p, target.pos);
      if (d >= 25 && d <= 60) { data.tailTime += dt; data.lostTime = 0; }
      else {
        data.lostTime += dt;
        if (data.lostTime > 5) { missionFail('Lost the target'); return false; }
      }
      if (state.hud) state.hud.objective = "Tail Pico's van: " + Math.ceil(Math.max(0, (step.tailTime || 90) - data.tailTime)) + ' s left';
      return data.tailTime >= (step.tailTime || 90);
    }
    case 'race': {
      const cps = step.checkpoints || 4;
      const ang = (data.checkpointIdx / cps) * Math.PI * 2;
      const cp = { x: pos.x + Math.cos(ang) * 60, z: pos.z + Math.sin(ang) * 60 };
      if (dist2(p, cp) < 15) { data.checkpointIdx++; if (data.checkpointIdx >= cps) { data.checkpointIdx = 0; data.lap++; } }
      if (state.hud) state.hud.objective = 'Ridgeline — Lap ' + Math.min((data.lap || 0) + 1, 3) + '/3';
      return (data.lap || 0) >= (step.laps || 3);
    }
    case 'escort': {
      const esc = data.escort;
      if (!esc) return false;
      const dd = dist2(esc.pos, p);
      if (dd > 2) {
        const a = Math.atan2(p.x - esc.pos.x, p.z - esc.pos.z);
        esc.pos.x += Math.sin(a) * Math.min(dd, 3.4 * dt);
        esc.pos.z += Math.cos(a) * Math.min(dd, 3.4 * dt);
      }
      return dist2(p, pos) < (step.radius || 12) && dd < 8;
    }
    default: return false;
  }
}
function checkFails(state, step, dt) {
  const m = state.mission;
  if ((state.player.health || 100) <= 0) { missionFail('Taken out'); return true; }
  if (step && (step.type === 'deliver_vehicle' || step.type === 'enter_vehicle')) {
    const car = state.player.vehicle;
    if (car && typeof car === 'object' && car.damage <= 0) { missionFail('Vehicle destroyed'); return true; }
  }
  if (step && step.timer) {
    m.data.timer -= dt;
    if (m.data.timer <= 0 && step.type === 'goto') { missionFail('Out of time'); return true; }
  }
  return false;
}
export function missionUpdate(dt) {
  const st2 = S;
  if (!st2) return;
  const d = dt || TICK_DT || 1 / 60;
  ensure(st2);
  const m = st2.mission;
  if (!m.current) return;
  if (m.failed) { if (safe(() => consumePressed('Enter'), false)) missionRetry(); return; }
  if (m.data.dialogue) { if (safe(() => consumePressed('Enter'), false)) advanceDialogue(st2); return; }
  const step = currentStep(st2);
  if (!step) { missionPassed(); return; }
  if (checkFails(st2, step, d)) return;
  if (stepDone(st2, step, d)) {
    if (m.current === 'M2' && m.step === 1) applyHeatSpike(st2, 20);
    if (m.current === 'M4' && m.step === 2) {
      try { if (st2.wanted) { st2.wanted.heat = Math.min(100, (st2.wanted.heat || 0) + 15); st2.wanted.stars = starsFromHeat(st2.wanted.heat); } } catch (e) { }
    }
    if (m.current === 'M6' && m.step === 2) {
      m.data.escort = { pos: { x: st2.player.pos.x + 3, y: 0, z: st2.player.pos.z + 3 }, hp: 100 };
    }
    m.step++;
    const next = currentStep(st2);
    if (!next) { missionPassed(); return; }
    beginStep(st2);
  }
}
export function init(state) { S = state; ensure(state); }
export function update(state, dt) { S = state; ensure(state); missionUpdate(dt); }
