// assets.js — procedural geometry + canvas textures. One window atlas,
// shared box geometry, InstancedMesh for every repeated prop. No file loads.
import * as THREE from "three";
import { hash2 } from "./sim.js";
export const SUN = 0xffb74d, SKY_TOP = 0x1e3a5f, SKY_MID = 0xff8c42, SKY_LOW = 0xffb347;
export const FOG = 0x2e3a4c, LIT_WIN = 0xffb74d, SHOP_WIN = 0xffd54f;
export const NEON = [0xff4da6, 0x4fd1c5, 0xc084fc];
// One canvas window atlas: dark glass + lit variants; facades sample it.
export function makeWindowAtlas() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#1a2332"; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const lit = hash2(x, y, 5) < 0.15;
    g.fillStyle = lit ? "#ffb74d" : (hash2(x, y, 9) < 0.5 ? "#232f42" : "#161e2c");
    g.fillRect(x * 16 + 2, y * 16 + 2, 12, 12);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const box = new THREE.BoxGeometry(1, 1, 1);
const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05 });
const emit = (c, i) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i });
// Instanced placement helper: fills matrices from {x,z} list with scale/rot.
export function instanced(list, geo, material, place) {
  const m = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  const E = new THREE.Euler();
  list.forEach((p, i) => {
    const [sx, sy, sz, ry] = place(p, i);
    E.set(0, ry, 0); Q.setFromEuler(E); P.set(p.x, sy / 2, p.z); S.set(sx, sy, sz);
    M.compose(P, Q, S); m.setMatrixAt(i, M);
  });
  m.instanceMatrix.needsUpdate = true; m.castShadow = false; m.receiveShadow = true;
  return m;
}
// Full city group: buildings (window-atlas facades + lit emissive windows),
// neon, awnings, rooftop props, palms, lamps, hydrants, bins, stalls,
// barriers, containers, billboards. District-tinted ground handled in render.js.
export function buildCityMeshes(city, atlas) {
  const grp = new THREE.Group();
  const facade = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.8 });
  const litMat = emit(LIT_WIN, 3.5), shopMat = emit(SHOP_WIN, 6);
  const neonMats = NEON.map(c => emit(c, 7));
  for (const b of city.buildings) {
    const mesh = new THREE.Mesh(box, facade);
    mesh.position.set(b.x, b.h / 2, b.z); mesh.scale.set(b.w, b.h, b.d);
    mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh);
    // Lit-window strip: emissive plane on the sun-facing facade, seeded 12-18%.
    if (b.lit > 0.12) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.7, b.h * 0.55), b.h > 14 ? shopMat : litMat);
      win.position.set(b.x, b.h * 0.55, b.z + b.d / 2 + 0.06); grp.add(win);
    }
    if (b.neon) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), neonMats[b.id % 3]);
      n.position.set(b.x, Math.min(b.h - 1, 8), b.z + b.d / 2 + 0.08); grp.add(n);
    }
    if (b.awning) {
      const a = new THREE.Mesh(box, mat(b.district === "Palmera Row" ? 0xffd4a3 : b.district === "Cerro Verde" ? 0xa8d8b8 : 0x9fb3c8));
      a.position.set(b.x, 3.1, b.z + b.d / 2 + 0.4); a.scale.set(b.w * 0.6, 0.25, 0.9); grp.add(a);
    }
    for (let r = 0; r < b.roof; r++) { // rooftop props: HVAC / tank / mast
      const p = new THREE.Mesh(box, mat(r % 2 ? 0x8a5a4a : 0x6b7a8a));
      p.position.set(b.x + (r - 1) * b.w * 0.22, b.h + 0.7, b.z);
      p.scale.set(1.6, 1.4, 1.6); grp.add(p);
    }
  }
  for (const c of city.containers) {
    const m = new THREE.Mesh(box, mat(c.c));
    m.position.set(c.x, c.h / 2, c.z); m.scale.set(6, c.h, 2.6);
    m.castShadow = true; grp.add(m);
  }
  const P = city.props;
  grp.add(instanced(P.palms, new THREE.CylinderGeometry(0.18, 0.3, 7, 6), mat(0x6b4a2f), () => [1, 7, 1, 0]));
  const lampMesh = instanced(P.lamps, new THREE.CylinderGeometry(0.09, 0.12, 6, 6), mat(0x2a2f38), () => [1, 6, 1, 0]);
  grp.add(lampMesh);
  grp.userData.lampMesh = lampMesh; // main.js zero-scales lamps on the shot axis
  grp.add(instanced(P.hydrants, box, mat(0xc0392b), () => [0.5, 0.9, 0.5, 0]));
  grp.add(instanced(P.bins, box, mat(0x3a4a3a), () => [0.7, 1, 0.7, 0]));
  grp.add(instanced(P.stalls, box, mat(0xe8b94c), () => [3, 1.1, 2, 0]));
  grp.add(instanced(P.barriers, box, mat(0xff8c00), () => [2, 1, 0.2, 0]));
  grp.add(instanced(P.crates, box, mat(0x8a6d3b), () => [1.8, 1.8, 1.8, 0]));
  // Parked cars: district-typed shells from the car pool colours.
  grp.add(instanced(P.parked, box, mat(0x7a7f8a), (p, i) => [4.2, 1.4, 1.9, p.r * 6.28]));
  // Parked-car cabins (glass): the bare shells read as flat slabs without them.
  {
    const cab = new THREE.InstancedMesh(box, mat(0x9fb8c8), Math.max(1, P.parked.length));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3();
    const E = new THREE.Euler();
    P.parked.forEach((p, i) => {
      E.set(0, p.r * 6.28, 0); Q.setFromEuler(E); Pv.set(p.x, 1.55, p.z); S.set(2.2, 0.6, 1.7);
      M.compose(Pv, Q, S); cab.setMatrixAt(i, M);
    });
    cab.instanceMatrix.needsUpdate = true; grp.add(cab);
  }
  // Yard 9 gantry crane (Brisa Yards landmark — round 1 had no crane mesh).
  if (city.landmarks && city.landmarks.crane) {
    const cr = city.landmarks.crane, craneMat = mat(0xb3402f);
    for (const sx of [-6, 6]) {
      const leg = new THREE.Mesh(box, craneMat);
      leg.position.set(cr.x + sx, 21, cr.z); leg.scale.set(1.2, 42, 1.2); grp.add(leg);
    }
    const beam = new THREE.Mesh(box, craneMat);
    beam.position.set(cr.x, 41, cr.z); beam.scale.set(18, 2, 2); grp.add(beam);
    const cable = new THREE.Mesh(box, mat(0x222222));
    cable.position.set(cr.x + 4, 36, cr.z); cable.scale.set(0.2, 10, 0.2); grp.add(cable);
    const hook = new THREE.Mesh(box, mat(0xc8a03c));
    hook.position.set(cr.x + 4, 30.5, cr.z); hook.scale.set(1.4, 1.4, 1.4); grp.add(hook);
  }
  // Lumen Spire cyan beacon: glowing crown + light pillar (shot 2 anchor).
  for (const b of city.buildings) {
    if (!b.spire) continue;
    const crown = new THREE.Mesh(box, emit(0x4fd1c5, 6));
    crown.position.set(b.x, b.h + 1, b.z); crown.scale.set(2, 2, 2); grp.add(crown);
    const pillar = new THREE.Mesh(box, emit(0x4fd1c5, 2.5));
    pillar.position.set(b.x, b.h + 14, b.z); pillar.scale.set(0.8, 26, 0.8); grp.add(pillar);
  }
  // Solmar Pier deck + pavilion over the bay (shot 3 anchor — round 1 had
  // no pier geometry, only a landmark coordinate).
  if (city.landmarks && city.landmarks.pier) {
    const pier = city.landmarks.pier;
    const deck = new THREE.Mesh(box, mat(0x7a5a38));
    deck.position.set(pier.x, 0.4, -895); deck.scale.set(36, 0.8, 70); grp.add(deck);
    const pav = new THREE.Mesh(box, mat(0xc96a4f));
    pav.position.set(pier.x, 3, -872); pav.scale.set(10, 5, 8); grp.add(pav);
    for (let i = 0; i < 6; i++) {
      const post = new THREE.Mesh(box, mat(0x5a4230));
      post.position.set(pier.x - 15 + (i % 2) * 30, 0, -870 - Math.floor(i / 2) * 22);
      post.scale.set(1, 3, 1); grp.add(post);
    }
  }
  // Billboards: 10 along arterials, procedural geometric panels, max 1/frame.
  const bb = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, x = Math.cos(a) * 480, z = Math.sin(a) * 480;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.4), emit([0xff4da6, 0x4fd1c5, 0xffb74d][i % 3], 1.2));
    panel.position.set(x, 7, z); panel.lookAt(0, 7, 0); bb.add(panel);
    const post = new THREE.Mesh(box, mat(0x333333));
    post.position.set(x, 3, z); post.scale.set(0.4, 6, 0.4); bb.add(post);
  }
  grp.add(bb);
  return grp;
}
// Player + ped + car shells (simple, readable at 720p; no loaded models).
export function makePerson(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(box, mat(color)); body.scale.set(0.5, 0.9, 0.3); body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xd9a986)); head.position.y = 1.75; g.add(head);
  const legs = new THREE.Mesh(box, mat(0x2a2f38)); legs.scale.set(0.44, 0.6, 0.26); legs.position.y = 0.3; g.add(legs);
  return g;
}
export function makeCar(color, opts) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(box, mat(color)); body.scale.set(4.2, 0.9, 1.9); body.position.y = 0.65; body.castShadow = true; g.add(body);
  // Glass cabin (light blue-grey, not near-black) + wheels: round 1 the car
  // read as merged black boxes — no wheels, black cabin, dark body.
  const cab = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.25, metalness: 0.35 }));
  cab.scale.set(2.2, 0.7, 1.7); cab.position.set(-0.2, 1.4, 0); g.add(cab);
  const wheelMat = mat(0x14161a);
  for (const [wx, wz] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
    const w = new THREE.Mesh(box, wheelMat);
    w.scale.set(0.7, 0.7, 0.25); w.position.set(wx, 0.35, wz); g.add(w);
  }
  const hl = new THREE.Mesh(box, emit(0xfffde7, 3)); hl.scale.set(0.15, 0.25, 1.7); hl.position.set(2.12, 0.6, 0); g.add(hl);
  const tl = new THREE.Mesh(box, emit(0xe33b3b, 3)); tl.scale.set(0.15, 0.25, 1.7); tl.position.set(-2.12, 0.6, 0); g.add(tl);
  // Police light bar (red/blue, emissive) so cruisers read as cruisers.
  if (opts && opts.police) {
    const barR = new THREE.Mesh(box, emit(0xe33b3b, 6)); barR.scale.set(0.7, 0.18, 0.7); barR.position.set(-0.2, 1.85, 0.45); g.add(barR);
    const barB = new THREE.Mesh(box, emit(0x3b82e3, 6)); barB.scale.set(0.7, 0.18, 0.7); barB.position.set(-0.2, 1.85, -0.45); g.add(barB);
  }
  return g;
}
