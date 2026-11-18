import { radioStep } from './input.js';
let S = null;
let ctx = null;
let master = null, musicBus = null, sfxBus = null, engineBus = null;
let gestureBound = false;
let engineOsc = null, engineOsc2 = null, engineFilter = null, engineGain = null;
let sirenOsc = null, sirenLfo = null, sirenGain = null;
let sirenOn = false;
let radioTimer = null;
let radioStepIdx = 0;
let nextNoteTime = 0;
let lastShotTick = -1;
let lastHitTick = -1;
const STATIONS = [
  {
    name: 'Coastline FM', bpm: 102,
    chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [48, 52, 55]],
    bass: [33, 29, 31, 24], lead: [69, 72, 76, 74, 72, 69, 67, 64],
  },
  {
    name: 'Yard Pulse', bpm: 116,
    chords: [[45, 48, 52], [43, 46, 50], [41, 45, 48], [44, 47, 51]],
    bass: [33, 33, 31, 29], lead: [57, 60, 62, 60, 57, 55, 53, 55],
  },
];
function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function ensure(state) {
  if (!state.audio) {
    state.audio = { station: 0, stationName: STATIONS[0].name, radioOn: false, volume: 0.8 };
  }
  if (state.audio.station == null) state.audio.station = 0;
  if (!state.audio.stationName) state.audio.stationName = STATIONS[state.audio.station || 0].name;
  return state.audio;
}
function safe(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}
export function audioInit() {
  if (ctx) {
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { } }
    return ctx;
  }
  try {
    const AC = (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.35; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    engineBus = ctx.createGain(); engineBus.gain.value = 0.0; engineBus.connect(master);
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 60;
    engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sawtooth'; engineOsc2.frequency.value = 63;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
    engineGain = ctx.createGain(); engineGain.gain.value = 0.5;
    engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain); engineGain.connect(engineBus);
    engineOsc.start(); engineOsc2.start();
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'square'; sirenOsc.frequency.value = 800;
    sirenLfo = ctx.createOscillator(); sirenLfo.type = 'sine'; sirenLfo.frequency.value = 0.6;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 350;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain); sirenGain.connect(sfxBus);
    sirenOsc.start(); sirenLfo.start();
    startRadioScheduler();
  } catch (e) { ctx = null; }
  return ctx;
}
function bindGesture() {
  if (gestureBound) return;
  gestureBound = true;
  const go = () => { audioInit(); };
  try {
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', go, { once: true });
      document.addEventListener('keydown', go, { once: true });
    }
    if (typeof window !== 'undefined') window.addEventListener('pointerdown', go, { once: true });
  } catch (e) { }
}
function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
function blip(freq, dur, type, gain, when) {
  if (!ctx) return;
  try {
    const t = when || ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { }
}
function noiseBurst(dur, filterFreq, gain, when) {
  if (!ctx) return;
  try {
    const t = when || ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur + 0.05);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  } catch (e) { }
}
export function engineDrone(rpm) {
  if (!ctx || !engineOsc) return;
  try {
    const r = Math.max(0, Math.min(1, rpm || 0));
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(50 + r * 140, t, 0.05);
    engineOsc2.frequency.setTargetAtTime(53 + r * 148, t, 0.05);
    engineFilter.frequency.setTargetAtTime(300 + r * 900, t, 0.08);
    engineGain.gain.setTargetAtTime(0.25 + r * 0.35, t, 0.08);
  } catch (e) { }
}
export function tireScreech(slip) {
  if (!ctx || !slip) return;
  noiseBurst(0.25, 1800, Math.min(0.25, slip * 0.2));
}
export function sirenWail() {
  if (!ctx || !sirenGain) return;
  try {
    sirenGain.gain.setTargetAtTime(0.12, ctx.currentTime, 0.3);
    sirenOn = true;
  } catch (e) { }
}
function sirenOff() {
  if (!ctx || !sirenGain) return;
  try { sirenGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.3); } catch (e) { }
  sirenOn = false;
}
export function gunshot(weapon) {
  if (!ctx) return;
  if (weapon === 'smg') { noiseBurst(0.09, 2400, 0.35); blip(160, 0.07, 'square', 0.15); }
  else if (weapon === 'pistol') { noiseBurst(0.14, 1800, 0.4); blip(110, 0.1, 'square', 0.2); }
  else { noiseBurst(0.08, 900, 0.2); }
}
export function muzzleFlashLight() {
  if (!ctx) return;
  blip(2400, 0.03, 'sine', 0.05);
}
export function radioTune(station) {
  const st = S;
  if (!st) return null;
  const a = ensure(st);
  const idx = typeof station === 'number' ? station : (a.station + 1) % STATIONS.length;
  a.station = ((idx % STATIONS.length) + STATIONS.length) % STATIONS.length;
  a.stationName = STATIONS[a.station].name;
  radioStepIdx = 0;
  return STATIONS[a.station].name;
}
function scheduleRadioBar() {
  if (!ctx) return;
  const st = S;
  if (!st) return;
  const a = ensure(st);
  if (!a.radioOn) return;
  const station = STATIONS[a.station];
  const spb = 60 / station.bpm;
  const stepDur = spb / 2; // 8th notes
  while (nextNoteTime < ctx.currentTime + 0.25) {
    const i = radioStepIdx % 16;
    const bar = Math.floor(radioStepIdx / 16) % 4;
    const chord = station.chords[bar];
    const t = Math.max(nextNoteTime, ctx.currentTime);
    if (i % 4 === 0) blip(midi(station.bass[bar]), stepDur * 1.8, 'triangle', 0.22, t);
    if (i === 0) for (const n of chord) blip(midi(n), spb * 3.5, 'sine', 0.05, t);
    if (i % 2 === 0) {
      const lead = station.lead[(i / 2) % station.lead.length];
      blip(midi(lead), stepDur * 0.9, 'square', 0.045, t);
    }
    noiseBurst(0.03, 6000, 0.03, t);
    radioStepIdx++;
    nextNoteTime += stepDur;
  }
}
function startRadioScheduler() {
  if (radioTimer || typeof setInterval === 'undefined') return;
  nextNoteTime = ctx ? ctx.currentTime + 0.1 : 0;
  radioTimer = setInterval(() => {
    try { scheduleRadioBar(); } catch (e) { }
  }, 120);
}
export function ambienceBed(district) {
  if (!ctx) return;
  try {
    const g = ctx.createGain();
    g.gain.value = district === 'Palmera Row' ? 0.05 : 0.03;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2);
    src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    src.stop(ctx.currentTime + 2);
  } catch (e) { }
}
export function uiBlip() {
  blip(880, 0.06, 'sine', 0.12);
}
export function wantedJingle() {
  if (!ctx) return;
  blip(523, 0.12, 'sine', 0.15);
  setTimeout(() => blip(659, 0.12, 'sine', 0.15), 120);
  setTimeout(() => blip(784, 0.2, 'sine', 0.15), 240);
}
export function init(state) {
  S = state;
  ensure(state);
  bindGesture();
}
export function update(state, dt) {
  void dt;
  S = state;
  const a = ensure(state);
  bindGesture();
  const inVehicle = !!(state.player && state.player.vehicle);
  if (safe(() => radioStep(), false)) {
    if (inVehicle) radioTune();
    uiBlip();
  }
  a.radioOn = inVehicle;
  if (!ctx) return;
  const car = (state.player && state.player.vehicle && typeof state.player.vehicle === 'object') ? state.player.vehicle : null;
  const top = car ? 48 : 1;
  const rpm = car ? Math.abs(car.speed || 0) / top : 0;
  engineDrone(rpm);
  if (engineBus) {
    try { engineBus.gain.setTargetAtTime(car ? 0.5 : 0.0, ctx.currentTime, 0.1); } catch (e) { }
  }
  const cops = (state.actors && state.actors.cops) || [];
  let near = false;
  for (const cop of cops) {
    const dx = cop.pos.x - state.player.pos.x, dz = cop.pos.z - state.player.pos.z;
    if (dx * dx + dz * dz < 60 * 60) { near = true; break; }
  }
  if (near && !sirenOn) sirenWail();
  else if (!near && sirenOn) sirenOff();
  if (state.combat && state.combat.lastShot && state.combat.lastShot.tick !== lastShotTick) {
    lastShotTick = state.combat.lastShot.tick;
    if (!state.combat.lastShot.dry) gunshot(state.combat.lastShot.weapon);
    else blip(1200, 0.04, 'square', 0.08); // dry-fire click
  }
  if (state.hud && state.hud.hitmarkerTick != null && state.hud.hitmarkerTick !== lastHitTick) {
    lastHitTick = state.hud.hitmarkerTick;
    if (lastHitTick >= 0) blip(1400, 0.05, 'sine', 0.15);
  }
  const dlg = state.mission && state.mission.data && state.mission.data.dialogue;
  const stars = (state.wanted && state.wanted.stars) || 0;
  const duck = (dlg || stars >= 3) ? 0.5 : 1;
  if (musicBus) {
    try { musicBus.gain.setTargetAtTime(0.35 * duck, ctx.currentTime, 0.2); } catch (e) { }
  }
}
