// render.js — three.js layer: sunset sky dome, fog, sun + 8-slot light pool,
// district ground kit, shadows. No postFX (swiftshader-safe). Emissive
// carries all glow that is not one of the 8 dynamic lights.
import * as THREE from "three";
import { SKY_TOP, SKY_MID, SKY_LOW, FOG, SUN } from "./assets.js";
import { DISTRICTS } from "./cityGenerator.js";
import { clamp } from "./sim.js";
const MAX_LIGHTS = 8; // 5 streetlamps + 1 heli spotlight + 2 headlights
export function createRenderer(canvas, city) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(1280, 720, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG, 0.00030); // near 60 m, far ~320 m
  // 3-stop gradient dome, vertex colours, cooler east side. No texture.
  // Stops compressed to y 0..0.4 so the gradient reads inside the narrow
  // sky band a pitched-down camera actually shows (round 1: the 0..0.9
  // spread left only flat orange in frame). Pink feather hugs the sun disc.
  const skyGeo = new THREE.SphereGeometry(1400, 24, 12);
  const top = new THREE.Color(SKY_TOP), mid = new THREE.Color(SKY_MID), low = new THREE.Color(SKY_LOW);
  const east = new THREE.Color(0x2a4a70), pink = new THREE.Color(0xffc6a3);
  const sunDir = new THREE.Vector3(-900, 240, -450).normalize(); // west, over the bay
  const pos = skyGeo.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 1400, x = pos.getX(i) / 1400, z = pos.getZ(i) / 1400;
    const t = clamp(y / 0.4, 0, 1);
    let c = low.clone().lerp(mid, clamp(t * 2, 0, 1)).lerp(top, clamp(t * 2 - 1, 0, 1));
    if (x > 0) c.lerp(east, clamp(x * 0.5, 0, 0.5)); // east cooler (sun is west)
    const dot = x * sunDir.x + y * sunDir.y + z * sunDir.z;
    if (dot > 0.90) c.lerp(pink, clamp((dot - 0.90) / 0.10, 0, 1) * 0.6);
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  // Sun disc + halo (round 1 had no disc mesh at all — the sun was only a
  // light). Placed on the sun azimuth, follows the player like the dome.
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(55, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false }));
  const sunHalo = new THREE.Mesh(new THREE.CircleGeometry(150, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc6a3, fog: false, transparent: true, opacity: 0.22, depthWrite: false }));
  scene.add(sunDisc); scene.add(sunHalo);
  // Sun: 20 deg above horizon, azimuth west over the bay. One shadow caster.
  const sun = new THREE.DirectionalLight(SUN, 1.6);
  sun.position.set(900, 330, -500); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 10, far: 2000 });
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0x8fa8c8, 0x4a5d70, 0.85)); // cool shadows (0.85: lifts the low-sun ground out of black)
  // Dynamic pool: 5 lamp points + heli spot + 2 headlight spots.
  const pool = [];
  for (let i = 0; i < 5; i++) { const l = new THREE.PointLight(0xffd54f, 0.8, 14, 2); scene.add(l); pool.push(l); }
  const heliSpot = new THREE.SpotLight(0xffffff, 1.8, 95, 0.35, 0.85, 1.2);
  scene.add(heliSpot); scene.add(heliSpot.target); pool.push(heliSpot);
  const headL = new THREE.SpotLight(0xffffff, 1.1, 28, 0.38, 0.5, 1.5);
  const headR = new THREE.SpotLight(0xffffff, 1.1, 28, 0.38, 0.5, 1.5);
  scene.add(headL, headL.target, headR, headR.target); pool.push(headL, headR);
  // Ground kit: district-tinted road + sidewalk + curb planes per chunk.
  // No single flat plane: roads are dark strips on tinted district ground.
  const ground = new THREE.Group();
  const gmat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
  // District ground: slight emissive lift so the low (13 deg) sun does not
  // leave it black — round-2 shots 3/4 foregrounds were near-black slabs.
  const dmat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, emissive: 0x2a241c, emissiveIntensity: 0.55 });
  for (const [name, cx, cz, rad, , , , tint] of DISTRICTS) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(rad, 24), dmat(tint));
    g.rotation.x = -Math.PI / 2; g.position.set(cx, -0.05, cz); g.receiveShadow = true; ground.add(g);
  }
  const roadMat = gmat(0x46464e);
  const walkMat = gmat(0x5a564a); // sidewalks: lighter strips flanking roads
  for (let i = -3; i <= 3; i++) { // arterial/coast strips + grid roads
    const r = new THREE.Mesh(new THREE.PlaneGeometry(2000, 12), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(0, 0, i * 250); r.receiveShadow = true; ground.add(r);
    const r2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 2000), roadMat);
    r2.rotation.x = -Math.PI / 2; r2.position.set(i * 250, 0, 0); r2.receiveShadow = true; ground.add(r2);
    for (const s of [-7.5, 7.5]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2000, 3), walkMat);
      w.rotation.x = -Math.PI / 2; w.position.set(0, 0.01, i * 250 + s); w.receiveShadow = true; ground.add(w);
      const w2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 2000), walkMat);
      w2.rotation.x = -Math.PI / 2; w2.position.set(i * 250 + s, 0.01, 0); w2.receiveShadow = true; ground.add(w2);
    }
  }
  // Dashed centre lines: coast road (z -820) + two grid arterials.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
  for (let x = -960; x < 960; x += 12) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.35), dashMat);
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.02, -820); ground.add(d);
    const d2 = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.35), dashMat);
    d2.rotation.x = -Math.PI / 2; d2.position.set(x, 0.02, -750); ground.add(d2);
  }
  for (let z = -960; z < 960; z += 12) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 6), dashMat);
    d.rotation.x = -Math.PI / 2; d.position.set(250, 0.02, z); ground.add(d);
  }
  // Crosswalks at real intersections, 0.6 m stripes x 5 m long (round 1:
  // the 10 m stripes sat 4 m from the spawn and read as an oversized slab).
  for (const [cx, cz] of [[260, -820], [60, -750]]) {
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 5), dashMat);
      s.rotation.x = -Math.PI / 2; s.position.set(cx - 2.5 + i * 1.0, 0.02, cz); ground.add(s);
    }
  }
  // Puddle hints (dense districts) + oil slicks (Brisa Yards): emissive only.
  const pud = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: 0x1a2a3a, emissiveIntensity: 0.3, roughness: 0.4 });
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1.5 + (i % 3), 10), pud);
    p.rotation.x = -Math.PI / 2; p.position.set(-400 + i * 110, 0.03, -700 + (i % 2) * 60); ground.add(p);
  }
  scene.add(ground);
  // Water: bay plane west/south of the seawall, warm sunset reflection tint.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 300),
    new THREE.MeshStandardMaterial({ color: 0x274b63, emissive: 0xcc6a2a, emissiveIntensity: 0.45, roughness: 0.25 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.4, -1010); scene.add(water);
  // Helicopter mesh + visible spotlight cone (round 1: the heli was only a
  // light + HUD pill — no mesh, no beam — so the cover showed no helicopter).
  const heliMat = new THREE.MeshStandardMaterial({ color: 0x22303e, roughness: 0.6 });
  const heliGrp = new THREE.Group();
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 1.8), heliMat);
  heliGrp.add(heliBody);
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.5), heliMat);
  heliTail.position.set(-3.0, 0.3, 0); heliGrp.add(heliTail);
  const heliStripe = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.25, 1.85),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xf5c518, emissiveIntensity: 1.2 }));
  heliStripe.position.y = 0.2; heliGrp.add(heliStripe);
  const heliRotor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.06, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }));
  heliRotor.position.y = 0.95; heliGrp.add(heliRotor);
  const heliDisc = new THREE.Mesh(new THREE.CircleGeometry(4, 20),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  heliDisc.rotation.x = -Math.PI / 2; heliDisc.position.y = 0.95; heliGrp.add(heliDisc);
  heliGrp.visible = false; scene.add(heliGrp);
  const heliCone = new THREE.Mesh(new THREE.ConeGeometry(9, 24, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfffbe0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  heliCone.visible = false; scene.add(heliCone);
  return {
    renderer, scene, sun, pool, heliSpot, headL, headR,
    // Per-frame: sun follows player (120 m shadow camera), 5 nearest lamps
    // take the point slots, heli spot + headlights track their owners.
    update(state) {
      const [px, , pz] = state.playerPos;
      sun.position.set(px - 900, 240, pz - 450); // west over the bay, ~13 deg
      sun.target.position.set(px, 0, pz); sun.target.updateMatrixWorld();
      sky.position.set(px, 0, pz); // dome follows player, never reached
      sunDisc.position.set(px + sunDir.x * 1300, sunDir.y * 1300, pz + sunDir.z * 1300);
      sunDisc.lookAt(px, 0, pz);
      sunHalo.position.copy(sunDisc.position);
      sunHalo.lookAt(px, 0, pz);
      const lamps = state.lamps || [];
      for (let i = 0; i < 5; i++) {
        const L = lamps[i];
        if (L) { pool[i].position.set(L.x, 6, L.z); pool[i].intensity = 0.8; }
        else pool[i].intensity = 0;
      }
      // Heli mesh + spotlight cone track the staged/live heli (y 18).
      const heliOn = !!(state.heli && state.heli.active && typeof state.heli[0] === "number");
      heliGrp.visible = heliOn; heliCone.visible = heliOn;
      if (heliOn) {
        const hx = state.heli[0], hz = state.heli[1];
        heliGrp.position.set(hx, 18, hz);
        heliGrp.rotation.y = Math.atan2(px - hx, pz - hz);
        heliSpot.position.set(hx, 18, hz);
        heliSpot.target.position.set(px, 0, pz); heliSpot.target.updateMatrixWorld();
        heliSpot.intensity = 1.8;
        const dx = hx - px, dz = hz - pz, len = Math.hypot(dx, 18, dz);
        heliCone.position.set((hx + px) / 2, 9, (hz + pz) / 2);
        heliCone.scale.set(1, len / 24, 1);
        heliCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(dx / len, 18 / len, dz / len));
      } else heliSpot.intensity = 0;
      const on = state.inVehicle && state.lights;
      for (const [spot, side] of [[headL, -0.7], [headR, 0.7]]) {
        spot.intensity = on ? 1.1 : 0;
        if (on) {
          const h = state.heading, fx = Math.sin(h), fz = Math.cos(h);
          spot.position.set(px + fx * 2.1 + Math.cos(h) * side, 0.7, pz + fz * 2.1 - Math.sin(h) * side);
          spot.target.position.set(px + fx * 20, 0, pz + fz * 20);
          spot.target.updateMatrixWorld();
        }
      }
    },
    render(cam) { renderer.render(scene, cam); },
  };
}
