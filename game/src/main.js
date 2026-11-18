// main.js — bootstrap / orchestrator / fixed-step loop (60 Hz, seeded RNG).
// Wiring uses Builder B's ACTUAL interfaces (BUILD-B2-PROGRESS.md); B systems
// are plain state objects stepped explicitly here, never sim.add() (no .step).
import * as THREE from "three";
import { createSim, TICK, SEED } from "./sim.js";
import { createInput } from "./input.js";
import { createCameraRig } from "./camera.js";
import { buildRoadGraph } from "./roadgraph.js";
import { generateCity } from "./cityGenerator.js";
import { createRenderer } from "./render.js";
import { makeWindowAtlas, buildCityMeshes, makePerson, makeCar } from "./assets.js";
import { parseShotParams, applyShot, shotReady } from "./shots.js";
import { createVehiclePool, spawnVehicle, updateVehicle, vehicleSpeedKmh, nearestVehicle, canEnter, exitVehicle } from "./vehicles.js";
import { createTraffic, spawnTrafficCar, updateTraffic, trafficTarget, trafficCount } from "./traffic.js";
import { createPeds, spawnPed, spawnPedPair, updatePeds, pedTarget, queryNear, pedReact, damagePed } from "./peds.js";
import { createPolice, spawnPoliceCruiser, policeRoster, updatePolice, heliState, checkArrest, clearPolice } from "./police.js";
import { createWanted, addHeat, setHeat, updateWantedHeat, clearWanted } from "./wanted.js";
import { createLoadout, selectSlot, cycleSlot, startReload, fireWeapon, updateCombat, ammoLine, takeEvents, unlockSmg } from "./combat.js";
import { GIVERS, createMissionRunner, availableMissions, startMission, currentStep, objectiveText, nextStepText, stageText, advanceDialogue, updateMission, takeMissionEvents } from "./missions.js";
import { saveGame, loadLatest } from "./saveStore.js";
import { createHud, setShotMode, showToast, showDialogue, hideDialogue, addScorePopup, showEndCard, hideEndCard, updateHud } from "./hudOverlay.js";
import { createAudio, ensureAudio, setInVehicle, toggleRadio, stationInfo } from "./audio.js";

const canvas = document.getElementById("game-canvas");
const hudRoot = document.getElementById("hud");
const splash = document.getElementById("splash");
const WALK = 2.2, SPRINT = 5.6;
// Mission markers (runner steps carry no coords; 10 m radius). Pier marker
// is z -800: the bay barrier is -822, so -860 is unreachable.
const MARKERS = {
  "M1:0": [40, -790], "M1:2": [-80, 620], "M1:3": [-80, 620],
  "M2:0": [-560, 240], "M2:3": [-600, 280], "M2:4": [-600, 280],
  "M3:0": [120, 600], "M3:3": [-600, 280],
  "M4:0": [0, -100], "M4:1": [300, -800], "M4:4": [560, 420],
  "M5:0": [560, 420], "M5:2": [560, 420],
  "M6:0": [-560, 240], "M6:2": [-560, 240], "M6:3": [-560, 240],
  "M6:4": [-80, 620], "M6:5": [-80, 620],
};
const CAR_COLORS = { Mico: 0x4f7ac9, Viajero: 0xb3402f, Furia2: 0xd4a017, Terraza: 0x4f4f6b, Bruto: 0x8a8a7a, Enforcer: 0x1c2733, Caballero: 0xe8c84f };

function boot() {
  const shot = parseShotParams(location.search);
  const seed = shot ? shot.seed : SEED;
  const sim = createSim(seed);
  const rngFn = sim.rng.next;
  const graph = buildRoadGraph(sim.rng);
  const city = generateCity(sim.rng, graph);
  const input = createInput(canvas);
  const rig = createCameraRig();
  const view = createRenderer(canvas, city);
  const atlas = makeWindowAtlas();
  const cityGrp = buildCityMeshes(city, atlas);
  view.scene.add(cityGrp);
  const player = {
    pos: [0, 0, -780], heading: 0, hp: 100, armour: 50, cash: 12450,
    respect: 64, stamina: 100, speed: 0, onFoot: true, vehicle: null,
    mesh: makePerson(0x2a6fd6),
  };
  const pp = player.pos; // never reassigned; restore/respawn mutate elements
  view.scene.add(player.mesh);
  const playerCar = makeCar(0xd4a017); playerCar.visible = false; view.scene.add(playerCar); // Furia 2 gold, not Viajero red
  // Player's Dockside 9, visible in the aim shot (round 1: no weapon read).
  {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.09, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.4, metalness: 0.6 }));
    gun.position.set(-0.25, 1.25, 0.3); player.mesh.add(gun);
  }
  const pool = createVehiclePool(rngFn);
  const traffic = createTraffic(rngFn);
  const peds = createPeds(rngFn);
  const police = createPolice(rngFn);
  const loadout = createLoadout(rngFn);
  const wanted = createWanted();
  const runner = createMissionRunner();
  const audio = createAudio();
  const hud = createHud(hudRoot, advanceStep);
  const pBody = { x: 0, z: 0, speed: 0, inVehicle: false, hp: 100, heading: 0, heat: 0 };
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const toast = m => showToast(hud, m);
  const pop = (t, k) => addScorePopup(hud, t, k);
  const state = {
    sim, seed, shot: shot ? shot.name : null, time: "17:40",
    district: "Palmera Row", player, playerPos: pp, heading: 0,
    inVehicle: false, aiming: false, lights: true, speed: 0,
    wanted, mission: runner, heli: null,
    prompt: "", hitmarker: false, muzzle: false,
    lamps: city.props.lamps.slice(0, 64),
    sight: false, stars: 0, roster: [], kills: 0,
    lastDrift: -10, lastGunHeat: -10, lastFailWhy: "", lastFailAt: -10, lastArrest: -10,
    mStepKey: "", stepStart: 0, escapeSeen: false, race: { laps: 0, away: false },
    tailVan: null,
  };
  // Heli as [x, z] WITH .active/.spotLOS props: render.js reads heli[0]/[1],
  // hudOverlay reads heli.active/.spotLOS. One value serves both.
  function heliArr(x, z, spotLOS) { const h = [x, z]; h.active = true; h.spotLOS = !!spotLOS; return h; }
  // Road query for traffic + police. route(rngFn) -> spawn point near player;
  // route(x, z, heading[, dist]) -> point `dist` (default 30) m ahead along the
  // best-aligned link. Returns {x, z, heading, light, dist, blocked, flee}.
  function route(x, z, heading, dist) {
    if (typeof x === "function") {
      const r = x;
      for (let i = 0; i < 12; i++) {
        const n = graph.nodes[Math.floor(r() * graph.nodes.length)];
        if (!n || !n.links.length) continue;
        const dd = Math.hypot(n.x - pp[0], n.z - pp[2]);
        if (dd > 25 && dd < 220) {
          const t = byId.get(n.links[0].to);
          return { x: n.x, z: n.z, heading: t ? Math.atan2(t.x - n.x, t.z - n.z) : 0, light: 0, dist: 0, blocked: false, flee: false };
        }
      }
      const n = graph.nearest(pp[0], pp[2]);
      return n ? { x: n.x, z: n.z, heading: 0, light: 0, dist: 0, blocked: false, flee: false } : null;
    }
    const d = dist || 30;
    const n = graph.nearest(x, z);
    if (!n || !n.links.length) return { x, z, heading, light: 0, dist: d, blocked: false, flee: false };
    let bx = 0, bz = 1, bd = -2;
    for (const l of n.links) {
      const t = byId.get(l.to); if (!t) continue;
      const dx = t.x - n.x, dz = t.z - n.z, L = Math.hypot(dx, dz) || 1;
      const dot = (dx / L) * Math.sin(heading) + (dz / L) * Math.cos(heading);
      if (dot > bd) { bd = dot; bx = dx / L; bz = dz / L; }
    }
    return { x: x + bx * d, z: z + bz * d, heading: Math.atan2(bx, bz), light: graph.lightState(n.id, sim.time), dist: d, blocked: false, flee: false };
  }
  let shownDlg = null, shownBeat = -1;
  function syncDialogue() {
    const d = runner.dialogue;
    if (!d) { if (shownDlg) { hideDialogue(hud); shownDlg = null; shownBeat = -1; } return; }
    if (d !== shownDlg || runner.beat !== shownBeat) {
      shownDlg = d; shownBeat = runner.beat;
      const g = GIVERS[d.speaker] || { color: "#f5c518", init: "??" };
      showDialogue(hud, d.speaker, [d.lines[runner.beat] || ""], g.color, g.init);
    }
  }
  function advanceStep() {
    if (state.shot || !runner.dialogue) return;
    advanceDialogue(runner);
    syncDialogue();
  }
  function nearestPed(maxD) {
    const list = queryNear(peds, pp[0], pp[2], maxD || 35);
    let best = null, bd = 1e9;
    for (const p of list) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - pp[0], p.z - pp[2]);
      if (d < bd) { bd = d; best = { ped: p, dist: d }; }
    }
    return best;
  }
  function missionCtx() {
    const step = currentStep(runner);
    const t = step ? step.t : "";
    let targetDist = 0, targetVisible = false;
    if (t === "tail" && state.tailVan) {
      targetDist = Math.hypot(state.tailVan.x - pp[0], state.tailVan.z - pp[2]);
      targetVisible = targetDist <= 120;
    } else if (t === "kill") {
      const near = nearestPed(120);
      if (near) { targetDist = near.dist; targetVisible = true; }
    }
    const mk = runner.active ? MARKERS[runner.active + ":" + runner.step] : null;
    const escaped = step && step.t === "escape" && wanted.stars === 0 && (state.escapeSeen || (sim.time - state.stepStart > 20));
    return {
      nearMarker: mk ? Math.hypot(pp[0] - mk[0], pp[2] - mk[1]) < 10 : false,
      inVehicle: state.inVehicle, vehicleType: player.vehicle ? player.vehicle.type : null,
      targetDist, targetVisible, kills: state.kills, laps: state.race.laps,
      finished: state.race.laps >= 3, place: state.race.laps >= 3 ? 1 : 0,
      escaped, heat: wanted.heat, dead: player.hp <= 0,
      vehicleDead: player.vehicle ? !!player.vehicle.dead : false,
      outOfBounds: Math.hypot(pp[0], pp[2]) > 1000, time: sim.time,
    };
  }
  function spawnGuards(x, z, n, hp) {
    for (let i = 0; i < n; i++) {
      const g = spawnPed(peds, x + (i - 1) * 5, z + (i % 2) * 6, state.district);
      g.hp = hp;
    }
  }
  function onStepChange() {
    state.stepStart = sim.time; state.escapeSeen = false;
    state.race = { laps: 0, away: false };
    const step = currentStep(runner);
    if (!step) return;
    if (runner.active === "M2" && runner.step === 1 && !state.tailVan) {
      const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
      state.tailVan = spawnVehicle(pool, "Bruto", pp[0] + fx * 40, pp[2] + fz * 40, player.heading, { occupied: true });
    }
    if (step.t === "kill") spawnGuards(runner.active === "M4" ? 300 : -560, runner.active === "M4" ? -800 : 240, step.count || 1, step.hp || 60);
  }
  function autosave() { try { saveGame(collectSave(), "auto"); } catch { /* storage may be unavailable */ } }
  function handleMissionEvent(ev) {
    if (ev.type === "dialogue") { syncDialogue(); return; }
    if (ev.type === "step") { toast(objectiveText(runner)); return; }
    if (ev.type === "passed") {
      player.cash += ev.reward || 0;
      if (ev.id === "M2") unlockSmg(loadout);
      toast("Mission passed +$" + (ev.reward || 0) + " — Autosaved");
      autosave();
      const avail = availableMissions(runner);
      if (avail.length) startMission(runner, avail[0]);
      syncDialogue();
      return;
    }
    if (ev.type === "fail") {
      if (ev.why !== state.lastFailWhy || sim.time - state.lastFailAt > 5) {
        state.lastFailWhy = ev.why; state.lastFailAt = sim.time;
        toast("Mission failed: " + (ev.why || "retry"));
      }
      autosave();
      return;
    }
    if (ev.type === "heat") setHeat(wanted, ev.heat);
  }
  function endRun(kind, sub) {
    const loss = Math.min(5000, Math.round(player.cash * 0.1));
    player.cash -= loss;
    clearWanted(wanted);
    clearPolice(police, pool);
    if (player.vehicle) { player.vehicle = null; state.inVehicle = false; player.onFoot = true; }
    player.hp = 100; pp[0] = 0; pp[2] = -780; player.heading = 0; player.speed = 0;
    showEndCard(hud, kind, sub);
    setTimeout(() => hideEndCard(hud), 4000); // UI timer only, never sim time
    autosave();
  }
  function tryInteract() {
    if (state.inVehicle) {
      const v = player.vehicle;
      if (!v) { state.inVehicle = false; player.onFoot = true; return; }
      const ex = exitVehicle(v);
      if (ex.ok) {
        state.inVehicle = false; player.onFoot = true; player.vehicle = null;
        pp[0] = v.x + 2; pp[2] = v.z; player.heading = v.heading; player.speed = 0;
        setInVehicle(audio, false);
      } else toast(ex.why || "Slow down to exit");
      return;
    }
    const car = nearestVehicle(pool, pp[0], pp[2], 2.5);
    if (car) {
      const chk = canEnter(car, Math.hypot(car.x - pp[0], car.z - pp[2]), player.speed);
      if (!chk.ok) {
        toast({ locked: "Locked", moving: "Moving — wait for it to stop", "too far": "Too far" }[chk.why] || "Cannot enter");
        return;
      }
      const wasOcc = car.occupied, wasPol = car.arch && car.arch.police;
      car.occupied = true; car.parked = false;
      state.inVehicle = true; player.onFoot = false; player.vehicle = car;
      pp[0] = car.x; pp[2] = car.z; player.heading = car.heading; player.speed = car.speed || 0;
      setInVehicle(audio, true);
      if (wasPol) addHeat(wanted, "stealPolice", state.sight);
      else if (wasOcc) addHeat(wanted, "carjack", state.sight);
      return;
    }
    if (runner.dialogue) advanceStep();
  }
  function hudState() {
    const radio = stationInfo(audio);
    const veh = player.vehicle;
    const staged = state.shot ? state.vehicle : null;
    const step = currentStep(runner);
    let timer = "";
    if (step && step.timer) {
      const left = Math.max(0, Math.ceil(step.timer - runner.timer));
      timer = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    }
    let prompt = "";
    if (!state.shot && !state.inVehicle) {
      const car = nearestVehicle(pool, pp[0], pp[2], 2.5);
      if (car) prompt = "E Enter " + car.arch.name;
    }
    return {
      district: state.district, time: state.time,
      heat: Math.round(wanted.heat), stars: wanted.stars,
      heatRising: wanted.heatRising, sight: state.sight,
      hp: player.hp, armour: player.armour, respect: player.respect,
      cash: player.cash, cashDelta: "", stamina: player.stamina,
      weapon: { selected: loadout.slot, ammoLine: ammoLine(loadout), locked: loadout.unlocked.map(u => !u) },
      speedKmh: staged ? staged.speed * 3.6 : (veh ? vehicleSpeedKmh(veh) : 0),
      vehicleName: staged ? staged.name : (veh ? veh.arch.name : ""),
      damage: staged ? staged.damage : (veh ? veh.damage : 100),
      gear: staged ? staged.gear : (veh ? veh.gear : "D"),
      inVehicle: state.inVehicle,
      mission: state.shot
        ? { stage: state.mission.stage || "", objective: state.mission.objective || "", next: "", timer: "" }
        : { stage: stageText(runner), objective: objectiveText(runner), next: nextStepText(runner), timer },
      police: state.shot
        ? (state.policeUnits || []).map(u => ({ id: u.id, tactic: u.tactic, distance: u.dist, threat: Math.max(1, 100 - (u.dist || 0)) }))
        : (state.roster || []),
      heli: state.heli ? { active: !!state.heli.active, spotLOS: !!state.heli.spotLOS } : { active: false, spotLOS: false },
      radio: { name: radio.name, track: radio.track, signal: radio.signal, on: radio.on },
      prompt: state.shot ? (state.prompt || "") : prompt,
      hitmarker: !!state.hitmarker, muzzle: !!state.muzzle,
      mapAngle: player.heading * 180 / Math.PI,
    };
  }
  function collectSave() {
    return {
      version: 1, seed,
      pos: { x: pp[0], z: pp[2], heading: player.heading },
      hp: player.hp, cash: player.cash, heat: Math.round(wanted.heat),
      weapons: { slot: loadout.slot, reserve: [0, loadout.reserve[1], loadout.reserve[2]], unlocked: loadout.unlocked.slice() },
      vehicle: player.vehicle ? player.vehicle.type : null,
      missions: { done: runner.done, flags: runner.flags },
      contacts: [], tokens: [], settings: { radio: audio.on, shadows: true },
    };
  }
  // render.js draws no vehicles/peds, so main.js syncs one mesh per live
  // vehicle/ped. The player's own car uses the separate playerCar mesh.
  const carMeshes = new Map(), pedMeshes = new Map();
  function syncMeshes() {
    for (const v of pool.list) {
      let m = carMeshes.get(v);
      if (!m) { m = makeCar(CAR_COLORS[v.type] || 0x8a8a7a, { police: !!(v.arch && v.arch.police) }); view.scene.add(m); carMeshes.set(v, m); }
      m.visible = v !== player.vehicle;
      if (m.visible) { m.position.set(v.x, 0, v.z); m.rotation.y = v.heading; }
    }
    for (const [v, m] of carMeshes) if (!pool.list.includes(v)) { view.scene.remove(m); carMeshes.delete(v); }
    for (const p of peds.list) {
      let m = pedMeshes.get(p);
      if (!m) { m = makePerson(parseInt(p.outfit.slice(1), 16) || 0x8a8a7a); view.scene.add(m); pedMeshes.set(p, m); }
      m.visible = !p.dead;
      if (m.visible) { m.position.set(p.x, 0, p.z); m.rotation.y = p.heading; }
    }
    for (const [p, m] of pedMeshes) if (!peds.list.includes(p)) { view.scene.remove(m); pedMeshes.delete(p); }
  }
  // --- shot staging helpers (frozen diorama: tick() moves nothing in shot
  // mode, so everything staged here is exactly what the capture sees) ---
  const _M4 = new THREE.Matrix4(), _Q0 = new THREE.Quaternion(),
    _V0 = new THREE.Vector3(), _S0 = new THREE.Vector3();
  function stageBox(x, z, w, h, d, color, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    m.position.set(x, h / 2, z); m.scale.set(w, h, d); m.rotation.y = ry || 0;
    m.castShadow = true; view.scene.add(m); return m;
  }
  function stageBeam(x, z, tx, tz) { // translucent searchlight cone, apex at cruiser roof
    const dx = tx - x, dz = tz - z, len = Math.hypot(dx, 2, dz) || 1;
    const c = new THREE.Mesh(new THREE.ConeGeometry(6, 1, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfffbe0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    c.position.set((x + tx) / 2, 1, (z + tz) / 2);
    c.scale.set(1, len, 1);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-dx / len, 2 / len, -dz / len));
    view.scene.add(c); return c;
  }
  const clearedLamps = new Set();
  function clearAxis(ox, oz, dx, dz, maxD) {
    // Zero-scale lamp instances within 2.5 m of the camera ray so no pole
    // bisects the frame (round-1 shot 2). Mesh index == props.lamps index.
    const lampMesh = cityGrp.userData && cityGrp.userData.lampMesh;
    if (!lampMesh) return;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    city.props.lamps.forEach((p, i) => {
      const ax = p.x - ox, az = p.z - oz;
      const t = ax * dx + az * dz;
      if (t < -5 || t > maxD) return;
      if (Math.abs(ax * dz - az * dx) > 2.5) return;
      _M4.compose(_V0.set(p.x, 3, p.z), _Q0, _S0.set(0, 0, 0));
      lampMesh.setMatrixAt(i, _M4);
      clearedLamps.add(p.x + "," + p.z);
    });
    lampMesh.instanceMatrix.needsUpdate = true;
  }
  // Point d m along the view dir, lat m to the right (view dir (vx,vz) has
  // right vector (-vz,vx) in xz). For chase the view dir is -forward.
  function viewPt(d, lat, vx, vz) {
    const rx = -vz, rz = vx;
    return [pp[0] + vx * d + rx * lat, pp[2] + vz * d + rz * lat];
  }
  function stagePed(x, z, st, heading) {
    const p = spawnPed(peds, x, z, state.district);
    if (st) p.state = st; if (heading != null) p.heading = heading; p.timer = 999;
    return p;
  }
  function stageCar(type, x, z, heading, opts) {
    return spawnVehicle(pool, type, x, z, heading, { occupied: true, ...(opts || {}) });
  }
  // Round-2 lesson: a building in the camera corridor hides the player
  // (shot 4) or the landmark (shot 3 pier). Rank candidate spawns by
  // blocker count and take the minimum — the old pass/fail check failed
  // EVERY candidate (halfW too narrow, and it counted the target itself),
  // so the fallbacks silently defaulted to the worst spot.
  function corridorCount(ox, oz, vx, vz, len, halfW, ignore) {
    let n = 0;
    for (const b of city.buildings) {
      if (ignore && b === ignore) continue;
      const ax = b.x - ox, az = b.z - oz;
      const t = Math.max(0, Math.min(len, ax * vx + az * vz));
      const px = ox + vx * t, pz = oz + vz * t;
      if (Math.hypot(b.x - px, b.z - pz) < Math.max(b.w, b.d) / 2 + halfW) n++;
    }
    return n;
  }
  function corridorClear(ox, oz, vx, vz, len, halfW, ignore) {
    return corridorCount(ox, oz, vx, vz, len, halfW, ignore) === 0;
  }
  function spotClear(x, z) {
    for (const b of city.buildings) {
      if (Math.hypot(b.x - x, b.z - z) < Math.max(b.w, b.d) / 2 + 2) return false;
    }
    return true;
  }
  if (shot) applyShot(state, shot);
  if (shot) {
    setShotMode(hud, true);
    traffic.mode = shot.name;
    if (shot.name === "chase") {
      // Coast arterial z=-820, driving east: camera sits east looking west,
      // water (-z) on the frame's right, cruisers beyond the player in the
      // view direction (round 1: they were behind the camera by capture).
      pp[0] = 300; pp[2] = -820; player.heading = Math.PI / 2;
      const car = spawnVehicle(pool, "Furia2", pp[0], pp[2], player.heading, { occupied: true });
      player.vehicle = car; state.inVehicle = true; player.onFoot = false;
      // Cruisers 18 m / 26 m ahead in frame, offset across lanes, facing the
      // camera (east) so light bars read. Frozen: they cannot ram past.
      spawnPoliceCruiser(police, pool, 282, -817, Math.PI / 2, "PURSUIT");
      spawnPoliceCruiser(police, pool, 274, -823.5, Math.PI / 2, "RAMMING");
      // Heli above-right: 45 m ahead in view (-x), 22 m to the right (-z),
      // clear of the sun disc (~31 deg right of the camera axis).
      state.heli = heliArr(255, -842, true);
      // Traffic ahead in adjacent lanes (7 cars, fronts toward camera).
      const civ = ["Mico", "Viajero", "Terraza", "Caballero", "Mico", "Viajero", "Bruto"];
      [[18, -3.2], [26, 3.2], [34, -3.2], [44, 3.2], [54, -3.2], [64, 3.2], [75, -3.2]].forEach(([d, lat], i) => {
        stageCar(civ[i % civ.length], 300 - d, -820 + lat, i % 2 ? -Math.PI / 2 : Math.PI / 2);
      });
      // Fleeing peds on both sidewalks (north sidewalk flees north, etc.).
      for (let i = 0; i < 10; i++) {
        const north = i % 2 === 0;
        stagePed(292 - i * 6, -820 + (north ? -8.5 : 8.5), "flee", north ? Math.PI : 0);
      }
      const g = GIVERS.Nia;
      showDialogue(hud, "Nia", [state.dialogue.text || ""], g.color, g.init);
      for (const p of state.popups || []) pop(p.text, p.kind);
      clearAxis(313, -820, -1, 0, 90);
    } else if (shot.name === "play") {
      // Port Lumen: player south of the Lumen Spire, facing it, so the
      // Spire + cyan beacon anchor the frame up the boulevard. Try far
      // first: the beacon crown (~76 m) only clears the frame top at
      // ~210 m+; nearer candidates keep the tower dominant if far fails.
      const sp = city.landmarks.spire;
      let placed = false, best = 1e9;
      for (const d of [220, 150, 100, 60, 48]) {
        for (const dx of [0, 15, -15]) {
          const cx = Math.max(-950, Math.min(950, sp.x + dx));
          const cz = Math.max(sp.z + d, -800);
          const y = Math.atan2(sp.x - cx, sp.z - cz);
          const ux = Math.sin(y), uz = Math.cos(y);
          const dist = Math.hypot(sp.x - cx, sp.z - cz);
          if (!spotClear(cx, cz)) continue;
          // Ignore the Spire itself: the sightline ENDS at it (round 2
          // counted the target as a blocker, so every candidate failed).
          const n = corridorCount(cx - ux * 9, cz - uz * 9, ux, uz, dist - 10, 12, sp);
          if (n < best) {
            best = n;
            pp[0] = cx; pp[2] = cz; rig.yaw = y; player.heading = y; placed = true;
            if (n === 0) break;
          }
        }
        if (placed && best === 0) break;
      }
      if (!placed) {
        pp[0] = Math.max(-950, Math.min(950, sp.x + 10));
        pp[2] = Math.max(sp.z + 48, -800);
        rig.yaw = Math.atan2(sp.x - pp[0], sp.z - pp[2]);
        player.heading = rig.yaw;
      }
      const vx = Math.sin(rig.yaw), vz = Math.cos(rig.yaw);
      // Mico 4 m ahead, offset right so the player never overlaps it.
      const [mx, mz] = viewPt(4, 1.2, vx, vz);
      spawnVehicle(pool, "Mico", mx, mz, rig.yaw + 0.15, { parked: true });
      // Parked cars along both curbs + market stalls + ped pairs.
      [[9, -5.5, "Mico"], [14, 5.5, "Viajero"], [20, -5.5, "Terraza"], [26, 5.5, "Caballero"]].forEach(([d, lat, t]) => {
        const [x, z] = viewPt(d, lat, vx, vz);
        spawnVehicle(pool, t, x, z, rig.yaw + (lat > 0 ? 0.05 : -0.05), { parked: true });
      });
      [[11, 7], [16, -7]].forEach(([d, lat]) => {
        const [x, z] = viewPt(d, lat, vx, vz);
        stageBox(x, z, 3, 1.6, 2, 0xe8b94c, rig.yaw);
      });
      for (let i = 0; i < 5; i++) {
        const [x, z] = viewPt(7 + i * 3, i % 2 ? -4 : 4, vx, vz);
        spawnPedPair(peds, x, z, state.district).forEach(p => { p.timer = 999; });
      }
      for (let i = 0; i < 6; i++) {
        const [x, z] = viewPt(6 + i * 3, i % 2 ? 8 : -8, vx, vz);
        stagePed(x, z, "wander", rig.yaw + (i % 2 ? 0.5 : -0.5));
      }
      const g = GIVERS.Nia;
      showDialogue(hud, "Nia", [state.dialogue.text || ""], g.color, g.init);
      const [cx, cz] = [pp[0] - vx * 9, pp[2] - vz * 9];
      clearAxis(cx, cz, vx, vz, 60);
    } else if (shot.name === "mission") {
      // Solmar Pier: aim the camera AT the pier deck (300,-895), not due
      // north — the Lumen Spire building sits at (302,-849) dead on the
      // north axis and hides the pier from due south (round 2). Diagonal
      // approaches from the east go around it. Rank by blocker count.
      let best = 1e9, bx = 300, bz = -815, byaw = Math.PI;
      for (const [cx, cz] of [[340, -850], [320, -850], [360, -840], [300, -815], [280, -815], [260, -835], [200, -830], [240, -815]]) {
        if (!spotClear(cx, cz)) continue;
        const y = Math.atan2(300 - cx, -895 - cz);
        const ux = Math.sin(y), uz = Math.cos(y);
        const n = corridorCount(cx - ux * 9, cz - uz * 9, ux, uz, 120, 12, null);
        if (n < best) { best = n; bx = cx; bz = cz; byaw = y; if (n === 0) break; }
      }
      pp[0] = bx; pp[2] = bz; player.heading = byaw; rig.yaw = byaw;
      state.aiming = true;
      selectSlot(loadout, 1); loadout.mag[1] = 8; // staged "Dockside 9 8/60"
      const vx = Math.sin(byaw), vz = Math.cos(byaw);
      [[8, -2], [10, 2.5]].forEach(([d, lat]) => {
        const [x, z] = viewPt(d, lat, vx, vz);
        const g = spawnPed(peds, x, z, state.district);
        g.hp = 60; g.state = "cower"; g.timer = 999; g.heading = 0;
      });
      // Crates as foreground cover between player and guards + one container
      // further out (round 2: the 14 m container read as a blue wall).
      [[6, -2.5], [6.5, 2.8]].forEach(([d, lat]) => {
        const [x, z] = viewPt(d, lat, vx, vz);
        stageBox(x, z, 1.8, 1.8, 1.8, 0x8a6d3b, 0.3);
      });
      {
        const [x, z] = viewPt(18, -8, vx, vz);
        stageBox(x, z, 6, 2.6, 2.6, 0x2f6db3, 0);
      }
      for (let i = 0; i < 5; i++) {
        const [x, z] = viewPt(5 + i * 1.5, i % 2 ? 6 : -6, vx, vz);
        stagePed(x, z, "cower", 0);
      }
      state.hitmarker = true; state.muzzle = true;
      clearAxis(pp[0] - vx * 9, pp[2] - vz * 9, vx, vz, 60);
    } else if (shot.name === "depot") {
      // Solis Freight Depot: player at the yard's south edge facing into the
      // container rows; Yard 9 crane at the frame's right edge. Yaw aims at
      // the midpoint of yard centre (-610,295) and crane (-560,240) so both
      // sit inside the frame. Rank candidates by blocker count (round 2:
      // halfW 4 let an off-axis building hide the player entirely).
      let placed = false, best = 1e9;
      for (const [cx, cz] of [[-640, 250], [-620, 240], [-660, 250], [-600, 240], [-640, 230], [-620, 255], [-640, 270]]) {
        const y = Math.atan2(-590 - cx, 270 - cz);
        const ux = Math.sin(y), uz = Math.cos(y);
        if (!spotClear(cx, cz)) continue;
        const n = corridorCount(cx - ux * 9, cz - uz * 9, ux, uz, 55, 12, null);
        if (n < best) {
          best = n;
          pp[0] = cx; pp[2] = cz; rig.yaw = y; player.heading = y; placed = true;
          if (n === 0) break;
        }
      }
      if (!placed) {
        pp[0] = -640; pp[2] = 250;
        rig.yaw = Math.atan2(50, 20); player.heading = rig.yaw;
      }
      const vx = Math.sin(rig.yaw), vz = Math.cos(rig.yaw);
      state.heli = null; // M6 caps at 3 stars: NO helicopter, ever
      [[8, -2.5], [10, 2], [13, -6], [15, 3]].forEach(([d, lat]) => {
        const [x, z] = viewPt(d, lat, vx, vz);
        const g = spawnPed(peds, x, z, state.district);
        g.hp = 80; g.state = "cower"; g.timer = 999; g.heading = rig.yaw + Math.PI;
      });
      // Tomo NPC (rust outfit) near the player + yard peds in cover.
      {
        const [x, z] = viewPt(4.5, -2.5, vx, vz);
        const t = stagePed(x, z, "chat", rig.yaw + Math.PI);
        t.outfit = "#c96a4f";
      }
      // Yard peds on the apron (z<=267) and in the row gap (z 279-281):
      // both bands are clear of every container in the yard grid.
      [[-635, 266], [-622, 267], [-650, 262], [-612, 266],
       [-636, 280], [-618, 281], [-648, 279], [-606, 280]].forEach(([x, z], i) => {
        stagePed(x, z, i % 2 ? "cower" : "wander", rig.yaw);
      });
      // Extra container stacks on the south apron (clear of the city grid
      // rows at z 272+, so no box-in-box interpenetration).
      [[-630, 262, 0xb3402f, 2.6], [-606, 258, 0x2f6db3, 5.2], [-585, 264, 0x3f8f5f, 2.6]].forEach(([x, z, c, h]) => {
        stageBox(x, z, 6, h, 2.6, c, 0);
      });
      // Cruisers in the yard with sweeping searchlight beams (no heli).
      // Both on the open apron, CLEAR of the staged stacks: round 3 put C1
      // at (-605,258) — exactly inside the blue container stack, invisible.
      [[-622, 252, "SEARCHLIGHT"], [-590, 255, "PURSUIT"]].forEach(([x, z, tac]) => {
        spawnPoliceCruiser(police, pool, x, z, Math.atan2(pp[0] - x, pp[2] - z), tac);
        stageBeam(x, z, -615, 288);
      });
      const [cx, cz] = [pp[0] - vx * 9, pp[2] - vz * 9];
      clearAxis(cx, cz, vx, vz, 60);
    }
  }
  {
    const PTYPES = ["Mico", "Viajero", "Terraza", "Bruto", "Caballero", "Furia2"];
    let parked = 0;
    for (const s of city.props.parked) {
      if (parked >= 6) break;
      if (Math.hypot(s.x - pp[0], s.z - pp[2]) > 400) continue;
      spawnVehicle(pool, PTYPES[parked % PTYPES.length], s.x, s.z, rngFn() * Math.PI * 2, { parked: true });
      parked++;
    }
    // Shot mode stages its own cars; the generic extra Mico would land in
    // frame next to the staged Mico / player car.
    if (!shot) spawnVehicle(pool, "Mico", pp[0] + 4, pp[2] + 8, 0, { parked: true });
  }
  // Restore save (live play only — shots are staged fresh). Corrupt save
  // -> New Game, never crash. B's loadLatest() returns manual-then-auto.
  if (!shot) {
    try {
      const s = loadLatest();
      if (s) {
        if (s.pos) { pp[0] = s.pos.x || 0; pp[2] = s.pos.z || 0; player.heading = s.pos.heading || 0; }
        player.hp = typeof s.hp === "number" ? s.hp : 100;
        player.cash = typeof s.cash === "number" ? s.cash : player.cash;
        if (typeof s.heat === "number") setHeat(wanted, s.heat);
        if (s.weapons) {
          loadout.slot = s.weapons.slot || 0;
          loadout.reserve = [Infinity, (s.weapons.reserve && s.weapons.reserve[1]) ?? 60, (s.weapons.reserve && s.weapons.reserve[2]) ?? 60];
          if (s.weapons.unlocked) loadout.unlocked = s.weapons.unlocked;
          if (loadout.unlocked[2]) loadout.mag[2] = 30;
        }
        if (s.missions) { runner.done = s.missions.done || {}; runner.flags = s.missions.flags || {}; }
        if (s.vehicle) spawnVehicle(pool, s.vehicle, pp[0] + 4, pp[2] + 2, player.heading, { parked: true });
      }
    } catch { /* fall back to New Game */ }
    const avail = availableMissions(runner);
    if (!runner.active && avail.length) startMission(runner, avail[0]);
  }
  canvas.addEventListener("pointerdown", () => ensureAudio(audio), { once: true });
  const cam = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 3000);
  let acc = 0, last = 0, frames = 0, paused = false;
  function tick() {
    if (!state.shot) { state.muzzle = false; state.hitmarker = false; }
    const mv = input.move(), pad = input.pad();
    const mx = mv.x + (pad ? pad.x : 0), my = mv.y + (pad ? pad.y : 0);
    const look = input.look();
    rig.applyLook(look.x, look.y, input.held("aim") || state.aiming);
    // In shot mode the staged aim pose survives (round 1: this line reset
    // state.aiming every tick, so the aim camera never engaged).
    if (!state.shot) state.aiming = input.held("aim");
    if (input.pressed("pause")) paused = !paused; // B's HUD has no pause UI; tick just freezes
    if (paused) { input.consume(); return; }
    for (const [k, f, a] of [["w1", selectSlot, 0], ["w2", selectSlot, 1], ["w3", selectSlot, 2], ["wheelUp", cycleSlot, 1], ["wheelDown", cycleSlot, -1]]) if (input.pressed(k)) f(loadout, a);
    if (input.pressed("radio")) toggleRadio(audio);
    if (input.pressed("lights")) state.lights = !state.lights;
    if (input.pressed("cam")) rig.cycleVeh();
    if (input.pressed("interact")) tryInteract();
    if (input.pressed("reload")) startReload(loadout);
    if (input.pressed("advance")) advanceStep();
    if (!audio.started && (input.pressed("interact") || input.held("fire") || input.held("aim"))) ensureAudio(audio);
    if (state.inVehicle && player.vehicle) {
      const v = player.vehicle;
      updateVehicle(v, { throttle: my, steer: mx, handbrake: input.held("jump") }, TICK);
      pp[0] = v.x; pp[2] = v.z; player.heading = v.heading; player.speed = v.speed;
      if (v.dead) {
        state.inVehicle = false; player.onFoot = true; player.vehicle = null;
        player.speed = 0; setInVehicle(audio, false);
        toast("Vehicle destroyed");
      } else if (v.drift > 0.6 && sim.time - state.lastDrift > 2) {
        state.lastDrift = sim.time;
        pop("+250 DRIFT", "drift");
      }
    } else {
      const sp = mv.sprint && player.stamina > 0 ? SPRINT : WALK;
      if (mv.sprint && (mx || my)) player.stamina = Math.max(0, player.stamina - TICK * 12.5);
      else player.stamina = Math.min(100, player.stamina + TICK * 20);
      const h = rig.yaw;
      const fx = Math.sin(h), fz = Math.cos(h);
      const dx = fx * my + fz * mx, dz = fz * my - fx * mx;
      const len = Math.hypot(dx, dz) || 1;
      pp[0] += (dx / len) * sp * TICK * (mx || my ? 1 : 0);
      pp[2] += (dz / len) * sp * TICK * (mx || my ? 1 : 0);
      if (mx || my) player.heading = Math.atan2(dx, dz);
      player.speed = (mx || my ? sp : 0);
      // Shot-mode spawns may stand on the beach north of the coast road
      // (mission pier approach); the live water clamp must not teleport them.
      if (!state.shot && pp[2] < city.water.edge - 2) {
        pp[2] = city.water.edge; player.hp = Math.max(1, player.hp - 5);
        toast("Pulled from the water");
      }
      if (player.hp < 40) player.hp = Math.min(40, player.hp + TICK * 0.5);
    }
    updateCombat(loadout, TICK);
    pBody.x = pp[0]; pBody.z = pp[2]; pBody.speed = player.speed;
    pBody.inVehicle = state.inVehicle; pBody.hp = player.hp; pBody.heading = player.heading; pBody.heat = wanted.heat;
    // SHOT MODE IS A FROZEN DIORAMA (round-1 root cause): traffic, peds and
    // police all move at 14-44 m/s, so in the ~13 s of sim time before
    // __shotReady they drive/walk out of frame (cruisers rammed past the
    // camera, traffic left, peds wandered off). Everything a shot needs is
    // staged explicitly below; the sim only advances the clock here.
    if (!state.shot) {
      const mode = state.shot || "roam";
      traffic.mode = mode; traffic.district = state.district;
      let n = 0, alive = peds.list.filter(p => !p.dead).length;
      while (trafficCount(traffic) < trafficTarget(traffic) && n++ < 4) spawnTrafficCar(traffic, pool, route, state.district);
      n = 0;
      const pTarget = pedTarget(mode);
      while (alive < pTarget && n++ < 4) {
        const a = rngFn() * Math.PI * 2, r = 20 + rngFn() * 80;
        const x = pp[0] + Math.cos(a) * r, z = pp[2] + Math.sin(a) * r;
        if (Math.abs(x) > 980 || Math.abs(z) > 980) continue;
        if (mode === "play" && n % 2 === 0) { spawnPedPair(peds, x, z, state.district); alive += 2; }
        else { spawnPed(peds, x, z, state.district); alive++; }
      }
      const tEv = [];
      updateTraffic(traffic, pool, route, pBody, TICK, tEv);
      for (const e of tEv) if (e.type === "nearMiss") pop("+150 NEAR MISS", "nearMiss");
      const pEv = [];
      updatePeds(peds, pBody, TICK, pEv);
      for (const e of pEv) {
        if (e.type === "pedHit") {
          if (e.lethal) { state.kills++; addHeat(wanted, "killPed", state.sight); }
          else addHeat(wanted, "hitPed", state.sight);
        }
      }
      const polRes = updatePolice(police, pool, pBody, wanted.heat, TICK, route);
      state.sight = polRes.sight; state.stars = polRes.stars;
      state.roster = policeRoster(police, pBody);
      updateWantedHeat(wanted, TICK, state.sight);
      state.stars = wanted.stars;
    }
    if (!state.shot) {
      const hs = heliState(police);
      state.heli = hs.active ? heliArr(hs.x, hs.z, hs.spotLOS) : null;
    }
    if (!state.inVehicle && input.held("fire")) {
      const near = nearestPed(35);
      const tgt = near ? { dist: near.dist, hp: near.ped.hp, apply: dmg => damagePed(peds, near.ped, dmg) } : null;
      const res = fireWeapon(loadout, state.aiming, tgt, near ? near.dist : 35);
      if (!res.blocked) {
        let shotFired = false, hit = false;
        for (const e of takeEvents(loadout)) {
          if (e.type === "muzzle") shotFired = true;
          if (e.type === "hitmarker") hit = true;
        }
        if (shotFired) {
          state.muzzle = true;
          pedReact(peds, { x: pp[0], z: pp[2], radius: 30, type: "gunfire" });
          if (sim.time - state.lastGunHeat > 5) { state.lastGunHeat = sim.time; addHeat(wanted, "gunfire", state.sight); }
        }
        if (hit) {
          state.hitmarker = true;
          if (near && near.ped.dead) { state.kills++; addHeat(wanted, "killPed", state.sight); }
        }
        if (res.empty) { toast("Out of ammo — press R"); startReload(loadout); }
      }
    }
    if (!state.shot && runner.active) {
      const k = runner.active + ":" + runner.step;
      if (k !== state.mStepKey) { state.mStepKey = k; onStepChange(); }
      if (runner.active === "M2" && runner.step === 1 && state.tailVan) {
        updateVehicle(state.tailVan, { throttle: 0.15, steer: 0, handbrake: false }, TICK);
      }
      const step = currentStep(runner);
      if (runner.active === "M5" && step && step.t === "race") {
        const d0 = Math.hypot(pp[0] - 560, pp[2] - 420);
        if (d0 < 20 && state.race.away) { state.race.laps++; state.race.away = false; }
        if (d0 > 300) state.race.away = true;
      }
      if (step && step.t === "escape" && wanted.heat > 0) state.escapeSeen = true;
      updateMission(runner, missionCtx(), TICK);
      for (const ev of takeMissionEvents(runner)) handleMissionEvent(ev);
      syncDialogue();
    }
    if (!state.inVehicle && player.hp < 20 && checkArrest(police, pBody) && sim.time - state.lastArrest > 5) {
      state.lastArrest = sim.time;
      endRun("arrested", "ARRESTED — the patrol caught up with Rafe");
    } else if (player.hp <= 0 && sim.time - state.lastArrest > 5) {
      state.lastArrest = sim.time;
      endRun("takenOut", "TAKEN OUT — Rafe wakes up at the safehouse");
    }
    setInVehicle(audio, state.inVehicle);
    state.playerPos = pp; state.heading = player.heading; state.speed = player.speed;
    // In shot mode the STAGED district wins (round 1: this overwrite
    // relabelled shots 1/3/4 "Port Lumen" every tick).
    if (!state.shot) state.district = city.districtAt(pp[0], pp[2]);
    state.lamps = city.props.lamps
      .filter(l => !clearedLamps.has(l.x + "," + l.z))
      .map(l => ({ ...l, d: (l.x - pp[0]) ** 2 + (l.z - pp[2]) ** 2 }))
      .sort((a, b) => a.d - b.d).slice(0, 5);
    sim.step();
    input.consume();
  }
  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) last = t;
    acc += Math.min((t - last) / 1000, 0.25); last = t;
    while (acc >= TICK) { tick(); acc -= TICK; }
    const pose = rig.update(TICK, {
      pos: pp, heading: player.heading, speed: player.speed,
      inVehicle: state.inVehicle, aiming: state.aiming, shot: state.shot, time: sim.time,
    });
    cam.position.set(...pose.pos); cam.lookAt(...pose.look);
    if (Math.abs(cam.fov - pose.fov) > 0.1) { cam.fov = pose.fov; cam.updateProjectionMatrix(); }
    player.mesh.position.set(pp[0], pp[1], pp[2]);
    player.mesh.rotation.y = player.heading;
    player.mesh.visible = !state.inVehicle;
    if (state.inVehicle && player.vehicle) {
      playerCar.visible = true;
      playerCar.position.set(player.vehicle.x || pp[0], 0, player.vehicle.z || pp[2]);
      // Drift angle is mesh-only in the chase shot: tick() copies the
      // vehicle heading into player.heading, which steers the chase camera —
      // a +0.3 rad drift on the physics heading rotated the whole camera
      // 17 deg and pushed the sun disc to the frame corner (round 2).
      playerCar.rotation.y = (player.vehicle.heading || player.heading) + (state.shot === "chase" ? 0.3 : 0);
    } else playerCar.visible = false;
    syncMeshes();
    view.update(state);
    view.render(cam);
    updateHud(hud, hudState());
    if (++frames === 2 && splash) splash.remove();
    if (state.shot && frames === 30) shotReady(window, 24);
    // Safety net: re-fire the one-shot staged effects just before the
    // __shotReady latch (frame ~54), in case the boot-time pop already
    // faded or a flag was cleared — shot mode holds them (no CSS fade,
    // no tick clear) so they survive to capture.
    if (state.shot && frames === 50) {
      if (hud.popups && !hud.popups.children.length) for (const p of state.popups || []) pop(p.text, p.kind);
      if (state.shot === "mission") { state.hitmarker = true; state.muzzle = true; }
    }
  }
  requestAnimationFrame(frame);
  return { state, sim, save: () => saveGame(collectSave(), "manual") };
}
try {
  const game = boot();
  window.__game = game;
  window.__shotReady = false;
} catch (err) {
  if (splash) splash.innerHTML = "<div><h1>SOLMAR BAY</h1><p>Could not start: " + String(err.message || err) + "</p></div>";
  console.error(err);
}
export { boot };
