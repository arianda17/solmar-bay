import { simSeed, simSetWanted } from "./sim.js";
import { spawnPointForDistrict } from "./cityGenerator.js";
import { nearestLanePoint } from "./roadgraph.js";
let currentShot = null;
let currentSeed = 1;
let framesRendered = 0;
let lightingReady = false;
const SETTLE_FRAMES = 30;
export const SHOT_NAMES = ["chase", "play", "mission", "depot"];
export function urlShotParam() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  return q.get("shot");
}
export function urlSeedParam() {
  if (typeof window === "undefined") return 1;
  const q = new URLSearchParams(window.location.search);
  const s = parseInt(q.get("seed") || "1", 10);
  return Number.isFinite(s) ? s : 1;
}
export function shotStage(name, seed, stageFn) {
  currentShot = name;
  currentSeed = seed;
  framesRendered = 0;
  lightingReady = false;
  if (typeof window !== "undefined") window.__shotReady = false;
  if (typeof stageFn === "function") stageFn(name, seed);
  return { name, seed };
}
export function shotFrameRendered() {
  framesRendered += 1;
  if (framesRendered >= SETTLE_FRAMES) lightingReady = true;
  if (lightingReady && typeof window !== "undefined") window.__shotReady = true;
  return framesRendered;
}
export function shotReady() {
  if (typeof window !== "undefined") return window.__shotReady === true;
  return lightingReady && framesRendered >= SETTLE_FRAMES;
}
export function shotConfig(name, seed) {
  const configs = {
    chase: {
      state: "playing", district: "palmera-row", wanted: 3,
      objective: "Lose the patrol", vehicle: "viajero", speed: 26,
      cops: 0, helicopter: false, camera: "vehicle-far",
    },
    play: {
      state: "playing", district: "port-lumen", wanted: 0,
      objective: "Go to the safehouse", vehicle: null, speed: 0,
      cops: 0, helicopter: false, camera: "foot",
    },
    mission: {
      state: "mission", district: "palmera-row", wanted: 2,
      objective: "Eliminate the guards 1/2", vehicle: null, speed: 0,
      cops: 1, helicopter: false, camera: "aim",
    },
    depot: {
      state: "mission", district: "brisa-yards", wanted: 3,
      objective: "Clear the depot — free Tomo", vehicle: null, speed: 0,
      cops: 1, helicopter: false, camera: "aim",
    },
  };
  return configs[name] || configs.play;
}
export function stageShotIntoState(state, name, seed) {
  const cfg = shotConfig(name, seed);
  simSeed(state, seed);
  const spawn = spawnPointForDistrict(cfg.district);
  if (name === "mission") { spawn.x = 650; spawn.z = 890; spawn.heading = 0; }
  else {
    const lp = nearestLanePoint({ x: spawn.x, z: spawn.z }, seed);
    if (lp) { spawn.x = lp.x; spawn.z = lp.z; spawn.heading = Math.atan2(lp.dirX, lp.dirZ); }
    if (name === "chase" && Math.cos(spawn.heading) < 0) spawn.heading += Math.PI;
    if (name === "play") spawn.heading = Math.PI;
    if(name==="depot"){spawn.x+=Math.sin(spawn.heading)*12;spawn.z+=Math.cos(spawn.heading)*12;}
  }
  state.player.pos.x = spawn.x;
  state.player.pos.z = spawn.z;
  state.player.heading = spawn.heading;
  state.player.onFoot = cfg.vehicle === null;
  state.player.speed = cfg.speed || 0;
  state.mission.current = cfg.state === "mission" ? (name === "depot" ? "M6" : "M4") : state.mission.current;
  state.mission.step = cfg.state === "mission" ? 2 : 0;
  state.hud.objective = cfg.objective;
  simSetWanted(state, cfg.wanted, cfg.wanted === 0 ? "clear" : "active");
  state.actors.cops = [];
  for (let i = 0; i < cfg.cops; i++) {
    state.actors.cops.push({
      id: "cop-" + i, archetype: "enforcer",
      pos: { x: spawn.x - Math.sin(spawn.heading) * (15 + i * 5), y: 0, z: spawn.z - Math.cos(spawn.heading) * (15 + i * 5) },
      heading: spawn.heading, speed: cfg.speed || 0, siren: true,
    });
  }
  state.actors.cars = [];
  const rng = state.rng;
  const nT=name==="chase"?8:10;
  for (let i = 0; i < nT; i++) {
    const ahead=name==="mission"?25+rng()*40:12+rng()*55;
    state.actors.cars.push({
      id: "traffic-" + i, archetype: ["mico", "viajero", "terraza", "furia"][Math.floor(rng() * 4)],
      pos: { x: spawn.x + (rng() - 0.5) * 40 + Math.sin(spawn.heading) * ahead, y: 0, z: spawn.z + (rng() - 0.5) * 40 + Math.cos(spawn.heading) * ahead },
      heading: spawn.heading + (rng() - 0.5) * 0.4, speed: 8 + rng() * 8,
      color: [0xc0392b, 0x2e6fb0, 0xd8d8d8, 0x3a3a3a][Math.floor(rng() * 4)],
    });
  }
  if (name === "chase") {
    const spots = [[15, -4], [19, 2.5], [30, 0]];
    for (let i = 0; i < 3; i++) {
      const back = spots[i][0], lat = spots[i][1];
      const cx = spawn.x - Math.sin(spawn.heading) * back + Math.cos(spawn.heading) * lat;
      const cz = spawn.z - Math.cos(spawn.heading) * back - Math.sin(spawn.heading) * lat;
      const car = { id: "cruiser-" + i, archetype: "enforcer", pos: { x: cx, y: 0, z: cz }, heading: spawn.heading, speed: 0, damage: 100, color: "#1a1a2e", police: true, siren: true };
      state.actors.cars.push(car);
      for (let j = 0; j < 2; j++) state.actors.cops.push({ id: "cop-" + i + "-" + j, pos: { x: cx, y: 0, z: cz }, heading: spawn.heading, hp: 100, carId: car.id, onFoot: false, state: "pursue", stateTime: 0 });
    }
  }
  state.actors.peds = [];
  for (let i = 0; i < 16; i++) {
    const guard = (name === "mission" || name === "depot") && i < 2;
    const ahead = guard ? 4.5 + i * 2 : (rng() - 0.5) * 40;
    const side = guard ? (i === 0 ? -3 : 3) : (rng() - 0.5) * 40;
    state.actors.peds.push({
      id: "ped-" + i, type: "civilian",
      pos: { x: spawn.x + Math.sin(spawn.heading) * ahead + Math.cos(spawn.heading) * side, y: 0, z: spawn.z + Math.cos(spawn.heading) * ahead - Math.sin(spawn.heading) * side },
      heading: guard ? spawn.heading + Math.PI : rng() * Math.PI * 2, speed: 1.2 + rng() * 0.4,
      palette: { skin: 0xc89878, shirt: guard ? 0x1a1a1a : [0x3e6fb0, 0xb03e3e, 0x3e9a5a, 0xd8c84a][i % 4], pants: 0x2c3240 },
      state: guard ? "cower" : cfg.name === "chase" || name === "chase" ? "flee" : name === "mission" ? "cower" : "wander",
    });
  }
  if (cfg.vehicle) {
    state.player.vehicle = {
      archetype: cfg.vehicle, color: 0x2e6fb0,
      pos: { x: spawn.x, y: 0, z: spawn.z }, heading: spawn.heading, speed: cfg.speed || 0, damage: 82,
    };
    state.player.onFoot = false;
  }
  if ((name === "mission" || name === "depot") && state.combat) {
    state.combat.slot = "pistol";
    state.combat.ammo = { pistol: 8, smg: 30 };
    state.combat.reserve = { pistol: 60, smg: 60 };
  }
  if (name === "play") state.hud.prompt = "E Enter Mico";
  return cfg;
}
