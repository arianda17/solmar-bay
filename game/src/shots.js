// shots.js — screenshot staging. Exactly 4 shots, 1280x720, golden hour
// 17:40, deterministic seeds. Cover = chase, NEVER a title screen.
// Files: 1-chase.jpg, 2-play.jpg, 3-mission.jpg, 4-depot.jpg.
// Shot-mode foot camera is the v1 polisher value (12 m back, player ~13% of
// frame height) — live-play camera stays 3.2 m / 1.6 m (see camera.js).
export const SHOTS = {
  chase: {
    file: "1-chase.jpg", seed: 20261124, wanted: 4, heat: 80,
    district: "Palmera Row", place: "arterial by Solmar Pier / Sunflare Hotel",
    desc: "Cover: player car mid-drift, 2 cruisers 15-20 m behind, heli + spotlight above-right, beach edge right, ~10 HUD systems.",
    traffic: 24, peds: 20, vehicle: "Furia 2", objective: "Lose the patrol",
  },
  play: {
    file: "2-play.jpg", seed: 20261125, wanted: 0, heat: 0,
    district: "Port Lumen", place: "Tidewheel Promenade, Lumen Spire in distance",
    desc: "On foot: Rafe mid-stride toward parked Mico, 'E Enter Mico' prompt, peds in pairs, market stalls.",
    traffic: 14, peds: 28, vehicle: "Mico", objective: "Steal the Mico",
  },
  mission: {
    file: "3-mission.jpg", seed: 20261126, wanted: 2, heat: 40,
    district: "Palmera Row", place: "Solmar Pier, M4 'The Drop'",
    desc: "Over-shoulder aim: guards in cover, hitmarker + muzzle flash, 'Eliminate the guards 1/2', ammo 'Dockside 9 8/60'.",
    traffic: 10, peds: 12, vehicle: null, objective: "Eliminate the guards 1/2",
  },
  depot: {
    file: "4-depot.jpg", seed: 20261127, wanted: 3, heat: 60,
    district: "Brisa Yards", place: "Solis Freight Depot, M6 \"Captain's Debt\"",
    desc: "Depot: containers, guards in cover, 'Clear the depot', exactly 3 stars, NO helicopter (M6 cap), cruiser searchlights sweeping.",
    traffic: 12, peds: 16, vehicle: null, objective: "Clear the depot",
  },
};
export const SHOT_FILES = ["1-chase.jpg", "2-play.jpg", "3-mission.jpg", "4-depot.jpg"];
// ?shot=<name>&seed=<n> — seed param overrides the staged seed if given.
export function parseShotParams(search) {
  const q = new URLSearchParams(search || "");
  const name = q.get("shot");
  if (!name || !SHOTS[name]) return null;
  const s = SHOTS[name];
  const seed = Number.parseInt(q.get("seed") || "", 10);
  return { name, ...s, seed: Number.isFinite(seed) ? seed : s.seed };
}
// Staged state overrides for a shot: wanted/heat, densities, HUD strings.
// Dialogue never auto-advances in shot mode (frozen beat, deterministic).
export function applyShot(state, shot) {
  state.shot = shot.name;
  state.seed = shot.seed;
  state.wanted.heat = shot.heat;
  state.wanted.stars = shot.wanted;
  state.density = { traffic: shot.traffic, peds: shot.peds };
  state.mission.objective = shot.objective;
  state.mission.stage = shot.name === "chase" ? "STAGE 2/3" : shot.name === "mission" ? "STAGE 2/3" : shot.name === "depot" ? "STAGE 3/3" : "STAGE 1/3";
  state.wanted.heatRising = shot.name === "chase" || shot.name === "depot"; // stars flash
  state.dialogue = state.dialogue || {};
  state.dialogue.frozen = true; // no 4 s auto-advance in shot mode
  state.time = "17:40";
  state.district = shot.district;
  if (shot.name === "chase") {
    state.vehicle = { name: shot.vehicle, speed: 32, damage: 82, gear: "D" };
    state.inVehicle = true;
    state.heli = { active: true, spotlight: true }; // 4 stars: heli valid
    state.popups = [{ text: "+250 DRIFT", kind: "drift" }];
    state.dialogue = { ...state.dialogue, speaker: "Nia", text: "Lose them on the coast road, Rafe. Don't scratch the paint." };
    state.policeUnits = [
      { id: 7, tactic: "PURSUIT", dist: 18 }, { id: 3, tactic: "RAMMING", dist: 22 },
      { id: 9, tactic: "ROADBLOCK", dist: 118 },
    ];
  } else if (shot.name === "play") {
    state.inVehicle = false;
    state.prompt = "E Enter Mico";
    state.dialogue = { ...state.dialogue, speaker: "Nia", text: "Pico's van is two blocks north. Tail it to the depot." };
  } else if (shot.name === "mission") {
    state.inVehicle = false; state.aiming = true;
    state.weapon = { name: "Dockside 9", mag: 8, reserve: 60 };
    state.policeUnits = [{ id: 5, tactic: "PURSUIT", dist: 64 }];
    state.hitmarker = true; state.muzzle = true;
  } else if (shot.name === "depot") {
    state.inVehicle = false;
    state.heli = null; // M6 caps at 3 stars: NO helicopter, ever
    state.policeUnits = [
      { id: 2, tactic: "PURSUIT", dist: 48 }, { id: 6, tactic: "SEARCHLIGHT", dist: 72 },
      { id: 11, tactic: "ROADBLOCK", dist: 140 },
    ];
  }
  return state;
}
// Latch: set window.__shotReady only after the scene has settled and lit
// (N rendered frames + lighting ready). Capture harness waits on this flag.
export function shotReady(win, frames = 24) {
  let n = 0;
  const tick = () => {
    if (++n >= frames) { win.__shotReady = true; return; }
    win.requestAnimationFrame(tick);
  };
  win.requestAnimationFrame(tick);
}
