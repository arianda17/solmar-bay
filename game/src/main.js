import * as THREE from "three";
import { createSim, simTick, simSetWanted, TICK_DT, DEFAULT_SEED } from "./sim.js";
import { buildRoadGraph, generateChunk, districtFor, spawnPointForDistrict, buildingColliders } from "./cityGenerator.js";
import { nearestLanePoint } from "./roadgraph.js";
import { sceneBuild, createRenderer, renderFrame as renderSceneFrame, addCarToScene, addPedToScene, rendererInfo } from "./render.js";
import { carMesh, pedMesh } from "./assets.js";
import { inputAttach, inputUpdate, consumePressed, moveIntent, handbrake, sprint, enterExitPressed, aimPressed, pointerLockToggle, lookDelta } from "./input.js";
import { onFootCamUpdate, vehicleCamUpdate, aimCamUpdate, chaseCamUpdate, screenShake } from "./camera.js";
import { shotStage, shotReady, shotFrameRendered, urlShotParam, urlSeedParam, stageShotIntoState, shotConfig } from "./shots.js";
export const GAME_MODES = ["title", "playing", "on-foot", "driving", "mission", "arrested", "taken-out", "paused"];
let state = null;
let scene = null;
let camera = null;
let renderer = null;
let canvas = null;
let hudRoot = null;
let mode = "title";
let modeBeforePause = "playing";
let camHeading = 0;
let camPitch = 0.12;
let camMode = "far";
let accumulator = 0;
let lastFrameTime = 0;
let running = false;
let systems = {};
let shotModeName = null;
let shotSeed = 1;
let playerMesh = null;
let carMeshes = new Map();
let pedMeshes = new Map();
let prevPlayerPos = { x: 0, y: 0, z: 0 };
let parkedCars = [];
let lastPressed = new Set();
let minimapCanvas = null;
let titleOrbit = 0;
const SYSTEM_FILES = [
  ["vehicles", "./vehicles.js"], ["traffic", "./traffic.js"], ["peds", "./peds.js"],
  ["police", "./police.js"], ["wanted", "./wanted.js"], ["combat", "./combat.js"],
  ["missions", "./missions.js"], ["hudOverlay", "./hudOverlay.js"], ["audio", "./audio.js"],
  ["saveStore", "./saveStore.js"],
];
const SYSTEM_ORDER = ["input", "vehicles", "traffic", "peds", "police", "wanted", "combat", "missions", "camera", "hudOverlay", "audio", "render"];
async function loadSystems() {
  for (const [name, path] of SYSTEM_FILES) {
    try {
      const mod = await import(path);
      systems[name] = mod;
    } catch (err) { /* system not landed yet; core game runs without it */ }
  }
}
function buildCity(seed) {
  const roadGraph = buildRoadGraph(seed);
  const chunks = [];
  for (let cx = -4; cx <= 4; cx++) {
    for (let cz = -4; cz <= 4; cz++) chunks.push(generateChunk(cx, cz, seed));
  }
  const colliders = [];
  for (const c of chunks) colliders.push(...buildingColliders(c));
  return { roadGraph, chunks, colliders, seed };
}
function buildHudShell() {
  if (!hudRoot) return;
  hudRoot.innerHTML = "";
  const mk = (tag, id, cls) => {
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (cls) el.className = cls;
    hudRoot.appendChild(el);
    return el;
  };
  minimapCanvas = mk("canvas", "minimap", "hud-minimap");
  minimapCanvas.width = 180;
  minimapCanvas.height = 180;
  mk("div", "wanted-stars", "hud-stars");
  mk("div", "hud-objective", "hud-objective");
  mk("div", "hud-location", "hud-location");
  mk("div", "hud-status", "hud-status");
  mk("div", "hud-vehicle", "hud-vehicle");
  mk("div", "hud-prompt", "hud-prompt");
  mk("div", "hud-toasts", "hud-toasts");
  mk("div", "hud-title", "hud-title");
  mk("div", "hud-pause", "hud-pause");
  mk("div", "hud-card", "hud-card");
}
function starsText(n) {
  let s = "";
  for (let i = 0; i < 5; i++) s += i < n ? "★" : "☆";
  return s;
}
function drawMinimap() {
  if (!minimapCanvas || !state) return;
  const g = minimapCanvas.getContext("2d");
  const R = 90;
  g.clearRect(0, 0, 180, 180);
  g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2);
  g.fillStyle = "rgba(20,28,36,0.82)"; g.fill();
  g.save();
  g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
  const range = 320;
  const px = (x) => R + ((x - state.player.pos.x) / range) * R;
  const pz = (z) => R + ((z - state.player.pos.z) / range) * R;
  g.fillStyle = "rgba(46,127,158,0.9)";
  g.fillRect(0, pz(920), 180, 180);
  const graph = state.world.roadGraph;
  if (graph) {
    g.strokeStyle = "rgba(230,230,230,0.75)";
    g.lineWidth = 1.5;
    for (const e of graph.edges) {
      const a = graph.nodeById.get(e.a);
      const b = graph.nodeById.get(e.b);
      if (Math.abs(a.x - state.player.pos.x) > range + 100 || Math.abs(a.z - state.player.pos.z) > range + 100) continue;
      g.beginPath(); g.moveTo(px(a.x), pz(a.z)); g.lineTo(px(b.x), pz(b.z)); g.stroke();
    }
  }
  g.fillStyle = "#ffd23e";
  g.beginPath(); g.arc(px(state.player.pos.x + 60), pz(state.player.pos.z - 80), 5, 0, Math.PI * 2); g.fill();
  for (const cop of state.actors.cops) {
    g.fillStyle = "#3e9df0";
    g.beginPath(); g.arc(px(cop.pos.x), pz(cop.pos.z), 4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "#ffffff";
  g.beginPath();
  const h = state.player.heading;
  g.moveTo(R + Math.sin(h) * 9, R + Math.cos(h) * 9);
  g.lineTo(R + Math.sin(h + 2.5) * 7, R + Math.cos(h + 2.5) * 7);
  g.lineTo(R + Math.sin(h - 2.5) * 7, R + Math.cos(h - 2.5) * 7);
  g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 2;
  g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.stroke();
}
function drawHud() {
  if (!hudRoot || !state) return;
  const q = (id) => document.getElementById(id);
  const stars = q("wanted-stars");
  if (stars) {
    stars.textContent = starsText(state.wanted.stars);
    stars.style.color = state.wanted.stars > 0 ? "#ffb13e" : "#cfd8dc";
  }
  const obj = q("hud-objective");
  if (obj) obj.textContent = state.hud.objective || (state.mission.current ? state.mission.current : "Explore Solmar Bay");
  const loc = q("hud-location");
  if (loc) {
    const d = districtFor(state.player.pos.x, state.player.pos.z);
    loc.textContent = d.name + "  ·  17:40";
  }
  const st = q("hud-status");
  if (st) {
    const hp = Math.round(state.player.health);
    const stam = Math.round(state.player.stamina);
    st.innerHTML = "HP " + hp + "  <span class='bar'><span style='width:" + hp + "%'></span></span>  ST " + stam + "  ·  $" + state.player.cash.toLocaleString("en-US");
  }
  const veh = q("hud-vehicle");
  if (veh) {
    if (state.player.vehicle) {
      const kmh = Math.round(Math.abs(state.player.speed) * 3.6);
      veh.textContent = (state.player.vehicle.archetype || "car").toUpperCase() + "  " + kmh + " km/h  ·  damage " + Math.round(state.player.vehicle.damage || 100) + "%";
    } else {
      const c = state.combat || {}, s = c.slot || "fists";
      veh.textContent = s === "pistol" ? "Dockside 9 " + ((c.ammo || {}).pistol || 0) + "/" + ((c.reserve || {}).pistol || 0) : s === "smg" ? "Kite-45 " + ((c.ammo || {}).smg || 0) + "/" + ((c.reserve || {}).smg || 0) : "Fists";
    }
  }
  const pr = q("hud-prompt");
  if (pr) pr.textContent = state.hud.prompt || "";
  drawMinimap();
}
function drawTitle() {
  const t = document.getElementById("hud-title");
  if (!t) return;
  let hasSave = false;
  try { hasSave = !!localStorage.getItem("solmar_bay_save_v1"); } catch (e) {}
  const chrome = ["minimap", "wanted-stars", "hud-objective", "hud-location", "hud-status", "hud-vehicle", "hud-prompt", "hud-toasts", "solmar-weapon", "solmar-radio", "solmar-speed"];
  for (const id of chrome) { const el = document.getElementById(id); if (el) el.style.display = mode === "title" ? "none" : ""; }
  if (mode === "title") {
    t.innerHTML = "<h1>SOLMAR BAY</h1><p>Heat, chrome, and second chances on the coast.</p>"
      + "<p><button data-act='new'>New Game</button> <button data-act='continue'" + (hasSave ? "" : " disabled style='opacity:.45'") + ">Continue</button></p>"
      + "<p class='controls'>WASD move · Shift sprint · Space jump / handbrake · E enter car · RMB aim · LMB fire · R reload · 1/2/3 weapons · Q radio · M map · C camera · Esc pause</p>";
    t.style.display = "block";
    t.onclick = (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      if (act === "new" || (act === "continue" && hasSave)) startPlaying();
    };
  } else {
    t.style.display = "none";
  }
}
function spawnParkedCars() {
  parkedCars = [];
  const rng = state.rng;
  const spots = ["mico", "viajero", "terraza", "bruto", "furia", "viajero", "mico", "terraza"];
  for (let i = 0; i < 8; i++) {
    const lp = nearestLanePoint({ x: state.player.pos.x + (rng() - 0.5) * 160, z: state.player.pos.z + (rng() - 0.5) * 160 }, state.seed);
    if (!lp) continue;
    const car = {
      id: "parked-" + i, archetype: spots[i % spots.length],
      pos: { x: lp.x + 5, y: 0, z: lp.z + 3 }, heading: Math.atan2(lp.dirX, lp.dirZ),
      speed: 0, damage: 100, color: [0xc0392b, 0x2e6fb0, 0xd8d8d8, 0x3a3a3a, 0x7a4a9a][i % 5],
    };
    parkedCars.push(car);
    addCarToScene(car);
  }
}
function nearestParkedCar(maxD) {
  let best = null;
  let bestD = maxD;
  for (const c of parkedCars) {
    const d = Math.hypot(c.pos.x - state.player.pos.x, c.pos.z - state.player.pos.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
export function enterVehicle(car) {
  if (!car || !state) return false;
  state.player.vehicle = car;
  state.player.onFoot = false;
  state.player.pos.x = car.pos.x;
  state.player.pos.z = car.pos.z;
  state.player.heading = car.heading;
  state.player.speed = 0;
  mode = "driving";
  state.hud.prompt = "";
  if (car.mesh) car.mesh.visible = true;
  return true;
}
export function exitVehicle() {
  if (!state || !state.player.vehicle) return false;
  if (Math.abs(state.player.speed) >= 4) {
    state.hud.prompt = "Slow down to exit";
    return false;
  }
  const car = state.player.vehicle;
  state.player.pos.x = car.pos.x - Math.sin(car.heading + Math.PI / 2) * 2.2;
  state.player.pos.z = car.pos.z - Math.cos(car.heading + Math.PI / 2) * 2.2;
  state.player.vehicle = null;
  state.player.onFoot = true;
  state.player.speed = 0;
  mode = "on-foot";
  return true;
}
function stepOnFoot(dt) {
  const p = state.player;
  const intent = moveIntent();
  const sprinting = sprint() && p.stamina > 0 && intent.y > 0;
  state.flags.sprinting = sprinting;
  if (sprinting) p.stamina = Math.max(0, p.stamina - dt * 12.5);
  const speed = sprinting ? 5.6 : 2.2;
  const sin = Math.sin(camHeading);
  const cos = Math.cos(camHeading);
  const mx = intent.x * cos - intent.y * sin;
  const mz = intent.x * sin + intent.y * cos;
  p.pos.x += mx * speed * dt;
  p.pos.z += mz * speed * dt;
  if (intent.x !== 0 || intent.y !== 0) p.heading = Math.atan2(mx, mz);
  p.speed = Math.hypot(mx, mz) * speed;
  if (lastPressed.has("Space") && p.grounded) { p.vy = 3.2; p.grounded = false; }
  if (!p.grounded) {
    p.vy -= 9.8 * dt;
    p.pos.y += p.vy * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
  }
  const near = nearestParkedCar(2.0);
  state.hud.prompt = near ? "E Enter " + (near.archetype === "mico" ? "Mico" : near.archetype === "viajero" ? "Viajero" : near.archetype) : "";
  if (lastPressed.has("KeyE") && near) {
    enterVehicle(near);
  }
}
function stepDriving(dt) {
  const p = state.player;
  const car = p.vehicle;
  if (!car) { mode = "on-foot"; return; }
  const intent = moveIntent();
  const topSpeed = { mico: 34, viajero: 38, furia: 48, terraza: 33, bruto: 32, enforcer: 44 }[car.archetype] || 36;
  const accel = intent.y > 0 ? 7.5 : intent.y < 0 ? -11 : 0;
  car.speed += accel * dt;
  if (intent.y === 0) car.speed *= Math.max(0, 1 - dt * 0.8);
  if (handbrake()) { car.speed *= Math.max(0, 1 - dt * 2.4); car.heading += intent.x * dt * 1.6 * Math.sign(car.speed || 1); }
  else {
    const steer = intent.x * Math.min(1, 0.35 + 8 / (Math.abs(car.speed) + 4));
    car.heading += steer * dt * (car.speed / 6);
  }
  if (car.speed > topSpeed) car.speed = topSpeed;
  if (car.speed < -12) car.speed = -12;
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  p.pos.x = car.pos.x;
  p.pos.z = car.pos.z;
  p.heading = car.heading;
  p.speed = car.speed;
  if (car.damage <= 0) { car.speed = 0; state.hud.prompt = "Vehicle disabled"; }
  if (lastPressed.has("KeyE")) exitVehicle();
  if (car.mesh) {
    car.mesh.position.set(car.pos.x, 0, car.pos.z);
    car.mesh.rotation.y = car.heading;
  }
}
export function fixedStepSim(dt) {
  if (!state) return;
  prevPlayerPos.x = state.player.pos.x;
  prevPlayerPos.y = state.player.pos.y;
  prevPlayerPos.z = state.player.pos.z;
  simTick(state, dt);
  const look = lookDelta();
  camHeading -= look.dx * 0.0028;
  camPitch = Math.max(-0.5, Math.min(0.6, camPitch + look.dy * 0.0022));
  const pressedSet = consumePressed();
  lastPressed = pressedSet;
  if (pressedSet.has("KeyC")) camMode = camMode === "far" ? "near" : camMode === "near" ? "hood" : "far";
  if (pressedSet.has("Escape")) { togglePause(); return; }
  if (mode === "playing" || mode === "on-foot" || mode === "driving" || mode === "mission") {
    if (state.player.onFoot) stepOnFoot(dt);
    else stepDriving(dt);
  }
  for (const name of SYSTEM_ORDER) {
    const mod = systems[name];
    if (mod && typeof mod.update === "function") {
      try { mod.update(state, dt); } catch (err) { /* a system must never kill the loop */ }
    }
  }
  if (state.flags.arrestRequested && mode !== "arrested") { state.flags.arrestRequested = false; handleArrested(); }
  if (state.player.health <= 0 && mode !== "taken-out") handleTakenOut();
}
export function renderFrame() {
  if (!renderer || !scene || !camera) return false;
  const p = state.player;
  const alpha=shotModeName?1:accumulator/TICK_DT;
  const ix = prevPlayerPos.x + (p.pos.x - prevPlayerPos.x) * Math.min(1, Math.max(0, alpha));
  const iz = prevPlayerPos.z + (p.pos.z - prevPlayerPos.z) * Math.min(1, Math.max(0, alpha));
  const interp = { x: ix, y: p.pos.y, z: iz };
  camera.userData = camera.userData || {};
  camera.userData.playerPos = p.pos;
  const dt = TICK_DT;
  if (mode === "title") {
    titleOrbit += dt * 0.05;
    camera.position.set(650 + Math.sin(titleOrbit) * 90, 42, 700 + Math.cos(titleOrbit) * 60);
    camera.lookAt(650, 4, 900);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  } else if ((aimPressed() || shotModeName === "mission" || shotModeName === "depot") && p.onFoot) {
    const ao={heading:camHeading};
    if(shotModeName){ao.back=12;ao.height=3;ao.lookY=.1;ao.ahead=2;}
    aimCamUpdate(camera, { pos: interp, heading: camHeading }, dt, ao);
  } else if (!p.onFoot && p.vehicle) {
    vehicleCamUpdate(camera, { pos: interp, heading: p.heading, speed: p.speed }, dt, { mode: shotModeName === "chase" ? "shot" : camMode });
  } else {
    const fo={heading:camHeading};
    if(shotModeName==="play"){fo.dist=12;fo.height=3.2;fo.lookY=.2;}
    onFootCamUpdate(camera, { pos: interp, heading: camHeading }, dt, fo);
  }
  if (playerMesh) {
    playerMesh.position.set(interp.x, interp.y, interp.z);
    playerMesh.rotation.y = p.heading;
    playerMesh.visible = mode !== "title";
  }
  const ok = renderSceneFrame(scene, camera, state.tick);
  if (shotModeName) shotFrameRendered();
  drawHud();
  return ok;
}
function loopFrame(now) {
  if (!running) return;
  requestAnimationFrame(loopFrame);
  if (!lastFrameTime) lastFrameTime = now;
  let elapsed = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (elapsed > 0.25) elapsed = 0.25;
  accumulator += elapsed;
  let guard = 0;
  while (accumulator >= TICK_DT && guard < 5) {
    if (mode !== "paused" && mode !== "title" && !shotModeName) fixedStepSim(TICK_DT);
    else if (mode === "title") { state.tick += 1; }
    else if (mode === "paused" && consumePressed().has("Escape")) togglePause();
    accumulator -= TICK_DT;
    guard += 1;
  }
  renderFrame();
}
export function startLoop() {
  if (running) return;
  running = true;
  lastFrameTime = 0;
  requestAnimationFrame(loopFrame);
}
export function showTitle() {
  mode = "title";
  state.hud.objective = "";
  drawTitle();
}
export function startPlaying() {
  mode = state.mission.current ? "mission" : "playing";
  if (state.player.onFoot) mode = "on-foot";
  drawTitle();
  const t = document.getElementById("hud-title");
  if (t) t.style.display = "none";
}
export function startMission(name) {
  if (!state) return false;
  state.mission.current = name;
  state.mission.step = 0;
  state.mission.data = {};
  mode = "mission";
  const mod = systems.missions;
  if (mod && typeof mod.missionStart === "function") {
    try { mod.missionStart(name); } catch (err) { /* fall through to local state */ }
  }
  state.hud.objective = "Mission: " + name;
  return true;
}
export function handleTakenOut() {
  mode = "taken-out";
  const lost = Math.min(5000, Math.floor(state.player.cash * 0.1));
  state.player.cash -= lost;
  simSetWanted(state, 0, "clear");
  const card = document.getElementById("hud-card");
  if (card) {
    card.innerHTML = "<h1>TAKEN OUT</h1><p>Lost $" + lost + ". Respawning at the safehouse.</p><p><button data-act='respawn'>Respawn</button></p>";
    card.style.display = "block";
    card.onclick = () => { respawnAtSafehouse(); };
  }
  const mod = systems.saveStore;
  if (mod && typeof mod.saveAutosave === "function") { try { mod.saveAutosave(state); } catch (err) {} }
}
export function handleArrested() {
  mode = "arrested";
  const lost = Math.min(5000, Math.floor(state.player.cash * 0.1));
  state.player.cash -= lost;
  simSetWanted(state, 0, "clear");
  const card = document.getElementById("hud-card");
  if (card) {
    card.innerHTML = "<h1>ARRESTED</h1><p>Lost $" + lost + ". Released at the police station.</p><p><button data-act='respawn'>Continue</button></p>";
    card.style.display = "block";
    card.onclick = () => { respawnAtSafehouse(); };
  }
}
function respawnAtSafehouse() {
  const spawn = spawnPointForDistrict("cerro-verde");
  state.player.pos.x = spawn.x;
  state.player.pos.z = spawn.z;
  state.player.heading = spawn.heading;
  state.player.health = 100;
  state.player.vehicle = null;
  state.player.onFoot = true;
  state.player.speed = 0;
  const card = document.getElementById("hud-card");
  if (card) card.style.display = "none";
  mode = "on-foot";
}
export function togglePause() {
  if (mode === "paused") {
    mode = modeBeforePause;
    const p = document.getElementById("hud-pause");
    if (p) p.style.display = "none";
    return false;
  }
  if (mode === "title" || mode === "taken-out" || mode === "arrested") return false;
  modeBeforePause = mode;
  mode = "paused";
  const p = document.getElementById("hud-pause");
  if (p) {
    p.innerHTML = "<h1>PAUSED</h1><p><button data-act='resume'>Resume</button> <button data-act='title'>Quit to Title</button></p>";
    p.style.display = "block";
    p.onclick = (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      if (act === "resume") togglePause();
      if (act === "title") { p.style.display = "none"; showTitle(); }
    };
  }
  return true;
}
export function setShotMode(name, seed) {
  shotModeName = name;
  shotSeed = seed === undefined ? 1 : seed;
  if (!state) return null;
  shotStage(name, shotSeed, null);
  const cfg = stageShotIntoState(state, name, shotSeed);
  if (cfg.vehicle) {
    parkedCars = [];
    const car = state.player.vehicle;
    addCarToScene(car);
    parkedCars.push(car);
  }
  if (name === "title") { showTitle(); }
  else { mode = cfg.state === "mission" ? "mission" : "playing"; if (state.player.onFoot) mode = "on-foot"; else mode = "driving"; }
  spawnParkedCars();
  for (const c of state.actors.cops) if (!c.carId) addCarToScene(c);
  for (const c of state.actors.cars) addCarToScene(c);
  for (const pd of state.actors.peds) addPedToScene(pd);
  camHeading = state.player.heading;
  const sp = state.player.pos, sh = state.player.heading;
  const sx = Math.sin(sh), sz = Math.cos(sh);
  if (cfg.camera === "vehicle-far") camera.position.set(sp.x - sx * 25, 5.5, sp.z - sz * 25);
  else if (cfg.camera === "aim") camera.position.set(sp.x - sx * 12 + Math.cos(sh) * 0.55, 3, sp.z - sz * 12 - Math.sin(sh) * 0.55);
  else if (cfg.camera === "foot") camera.position.set(sp.x - sx * 12, 3.2, sp.z - sz * 12);
  if (name === "play") {
    const mico = { id: "staged-mico", archetype: "mico", pos: { x: sp.x + sx * 4 + Math.cos(sh) * 3, y: 0, z: sp.z + sz * 4 - Math.sin(sh) * 3 }, heading: sh, speed: 0, damage: 100, color: 0xc0392b };
    parkedCars.push(mico);
    addCarToScene(mico);
  }
  drawTitle();
  return cfg;
}
export function initGame(options) {
  const opts = options || {};
  const seed = opts.seed === undefined ? DEFAULT_SEED : opts.seed;
  canvas = document.getElementById("game-canvas");
  hudRoot = document.getElementById("hud");
  state = createSim(seed);
  const city = buildCity(seed);
  state.world.roadGraph = city.roadGraph;
  state.world.districts = districtFor(0, 0);
  state.world.colliders = city.colliders;
  state.world.city = city;
  try {
    renderer = createRenderer(canvas);
  } catch (err) {
    const splash = document.getElementById("splash");
    if (splash) splash.textContent = "Solmar Bay needs WebGL to render. Please open this page in desktop Chrome with hardware acceleration enabled.";
    return null;
  }
  scene = sceneBuild(city);
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1500);
  camera.position.set(0, 8, -20);
  const spawn = spawnPointForDistrict("port-lumen");
  state.player.pos.x = spawn.x;
  state.player.pos.z = spawn.z;
  state.player.heading = spawn.heading;
  camHeading = spawn.heading;
  playerMesh = pedMesh("player", { skin: 0xc89878, shirt: 0x2e6f8e, pants: 0x2c3240 });
  playerMesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(playerMesh);
  inputAttach(canvas);
  buildHudShell();
  spawnParkedCars();
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);
  onResize();
  canvas.addEventListener("click", () => {
    if (mode !== "title") pointerLockToggle(canvas);
  });
  loadSystems();
  const shot = opts.shot || urlShotParam();
  const sseed = opts.shotSeed || urlSeedParam();
  if (shot) {
    setShotMode(shot, sseed);
  } else {
    showTitle();
  }
  drawHud();
  startLoop();
  window.__solmar = { state: () => state, mode: () => mode, rendererInfo };
  return { state, scene, camera, renderer };
}
export function getState() { return state; }
export function getMode() { return mode; }
