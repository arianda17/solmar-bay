export const SAVE_KEY = 'solmar_bay_save_v1';
export const SAVE_VERSION = 1;
function storage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (e) { }
  return null;
}
export function saveVersion() { return SAVE_VERSION; }
export function saveWrite(key, value) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch (e) { return false; }
}
export function saveRead(key) {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
export function saveSlot(key) { return saveRead(key || SAVE_KEY); }
export function saveExists() {
  const store = storage();
  if (!store) return false;
  try { return store.getItem(SAVE_KEY) != null; } catch (e) { return false; }
}
export function saveGame(state) {
  if (!state) return null;
  const p = state.player || {};
  const car = (p.vehicle && typeof p.vehicle === 'object') ? p.vehicle : null;
  const data = {
    version: SAVE_VERSION,
    seed: state.seed,
    player: {
      pos: p.pos ? { x: p.pos.x, y: p.pos.y || 0, z: p.pos.z } : { x: 0, y: 0, z: 0 },
      heading: p.heading || 0,
      health: p.health == null ? 100 : p.health,
      stamina: p.stamina == null ? 100 : p.stamina,
      cash: p.cash || 0,
    },
    combat: state.combat ? {
      slot: state.combat.slot || 'fists',
      ammo: { ...(state.combat.ammo || { pistol: 10, smg: 30 }) },
      reserve: { ...(state.combat.reserve || { pistol: 60, smg: 60 }) },
    } : { slot: 'fists', ammo: { pistol: 10, smg: 30 }, reserve: { pistol: 60, smg: 60 } },
    wanted: state.wanted ? { heat: state.wanted.heat || 0, stars: state.wanted.stars || 0 } : { heat: 0, stars: 0 },
    vehicle: car ? {
      archetype: car.archetype, pos: { ...car.pos }, heading: car.heading || 0, damage: car.damage || 0,
    } : null,
    missions: {
      completed: { ...(state.mission && state.mission.completed ? state.mission.completed : {}) },
      current: (state.mission && state.mission.current) || null,
    },
    contacts: (state.flags && state.flags.unlocks) ? [...state.flags.unlocks] : [],
    collectibles: (state.flags && state.flags.tokens) ? [...state.flags.tokens] : [],
    settings: (state.settings) ? { ...state.settings } : {},
    savedTick: state.tick || 0,
  };
  saveWrite(SAVE_KEY, data);
  return data;
}
export function saveAutosave(state) {
  try { return saveGame(state); } catch (e) { return null; }
}
export function loadGame(state) {
  const data = saveRead(SAVE_KEY);
  if (!data || typeof data !== 'object') return null;
  if (data.version == null || data.version > SAVE_VERSION) return null;
  if (!state) return data;
  try {
    if (data.seed != null) state.seed = data.seed;
    const p = state.player || {};
    if (data.player) {
      if (data.player.pos) p.pos = { x: data.player.pos.x, y: data.player.pos.y || 0, z: data.player.pos.z };
      if (data.player.heading != null) p.heading = data.player.heading;
      if (data.player.health != null) p.health = data.player.health;
      if (data.player.stamina != null) p.stamina = data.player.stamina;
      if (data.player.cash != null) p.cash = data.player.cash;
    }
    if (data.combat && state.combat) {
      state.combat.slot = data.combat.slot || state.combat.slot;
      if (data.combat.ammo) state.combat.ammo = { ...state.combat.ammo, ...data.combat.ammo };
      if (data.combat.reserve) state.combat.reserve = { ...state.combat.reserve, ...data.combat.reserve };
    }
    if (data.wanted && state.wanted) {
      state.wanted.heat = data.wanted.heat || 0;
      state.wanted.stars = data.wanted.stars || 0;
      state.wanted.state = data.wanted.stars ? 'responding' : 'clear';
    }
    if (data.missions && state.mission) {
      state.mission.completed = { ...(data.missions.completed || {}) };
      state.mission.current = null;
      state.mission.step = 0;
      state.mission.data = { blips: [] };
    }
    if (Array.isArray(data.contacts)) {
      if (!state.flags) state.flags = {};
      state.flags.unlocks = [...data.contacts];
    }
    if (Array.isArray(data.collectibles)) {
      if (!state.flags) state.flags = {};
      state.flags.tokens = [...data.collectibles];
    }
    if (data.settings) state.settings = { ...state.settings, ...data.settings };
    if (data.vehicle && state.actors && Array.isArray(state.actors.cars)) {
      state.flags.pendingVehicle = data.vehicle;
    }
    return data;
  } catch (e) { return null; }
}
function onContinueClick(event) {
  try {
    const t = event && event.target;
    if (!t || typeof t.closest !== 'function') return;
    const btn = t.closest("[data-act='continue']");
    if (!btn) return;
    if (!saveExists()) return;
    const solmar = (typeof window !== 'undefined') ? window.__solmar : null;
    if (!solmar || typeof solmar.state !== 'function') return;
    const live = solmar.state();
    if (!live) return;
    loadGame(live);
    if (live.hud) live.hud.prompt = 'Save loaded — welcome back to Solmar Bay';
  } catch (e) { }
}
if (typeof document !== 'undefined' && document && document.addEventListener) {
  try { document.addEventListener('click', onContinueClick, true); } catch (e) { }
}
let saveBtnBound = false;
export function init(state) {
  void state;
}
export function update(state, dt) {
  void dt;
  if (typeof document === 'undefined' || !document) return;
  try {
    const pause = document.getElementById('hud-pause');
    if (!pause) return;
    const visible = pause.style.display !== 'none' && pause.offsetParent !== null;
    if (!visible) { saveBtnBound = false; return; }
    if (saveBtnBound || document.getElementById('solmar-save-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'solmar-save-btn';
    btn.setAttribute('data-act', 'save');
    btn.textContent = 'Save Game';
    btn.addEventListener('click', () => {
      try {
        saveGame(state);
        if (state.hud) state.hud.prompt = 'Game saved';
      } catch (e) { }
    });
    pause.appendChild(btn);
    saveBtnBound = true;
  } catch (e) { }
}
