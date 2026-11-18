import * as THREE from "three";
const texCache = new Map();
export function windowAtlasTexture() {
  if (texCache.has("windows")) return texCache.get("windows");
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#20242c";
  g.fillRect(0, 0, 256, 256);
  const rng = (() => { let a = 12345; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  for (let y = 8; y < 248; y += 24) {
    for (let x = 8; x < 248; x += 24) {
      const lit = rng() < 0.45;
      g.fillStyle = lit ? (rng() < 0.7 ? "#ffd98a" : "#9fd8ff") : "#14181f";
      g.fillRect(x, y, 14, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set("windows", tex);
  return tex;
}
export function laneMarkingTexture() {
  if (texCache.has("lanes")) return texCache.get("lanes");
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#3a3d42";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#d8c84a";
  g.fillRect(60, 0, 4, 48);
  g.fillRect(60, 80, 4, 48);
  g.fillStyle = "#e8e8e8";
  g.fillRect(4, 0, 3, 128);
  g.fillRect(121, 0, 3, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set("lanes", tex);
  return tex;
}
export function buildingMesh(lot, rng) {
  const h = lot.height || 12;
  const geo = new THREE.BoxGeometry(lot.w, h, lot.d);
  const mat = new THREE.MeshStandardMaterial({ color: lot.color || 0x9fb4c8, roughness: 0.9, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(lot.x, h / 2, lot.z);
  mesh.rotation.y = lot.rot || 0;
  mesh.userData.lot = lot;
  const winMat = new THREE.MeshStandardMaterial({ map: windowAtlasTexture(), emissive: 0x332200, emissiveMap: windowAtlasTexture(), emissiveIntensity: 0.35, roughness: 0.8 });
  const band = new THREE.Mesh(new THREE.BoxGeometry(lot.w + 0.1, h * 0.92, lot.d + 0.1), winMat);
  band.position.set(lot.x, h / 2, lot.z);
  band.rotation.y = lot.rot || 0;
  const group = new THREE.Group();
  group.add(mesh);
  group.add(band);
  return group;
}
export function carMesh(archetype, color) {
  const group = new THREE.Group();
  const sizes = {
    mico: [1.7, 0.55, 3.4], viajero: [1.8, 0.6, 4.4], furia: [1.9, 0.5, 4.2],
    terraza: [1.9, 0.8, 4.6], bruto: [2.0, 0.85, 5.0], enforcer: [1.9, 0.65, 4.6], taxi: [1.8, 0.6, 4.4],
  };
  const s = sizes[archetype] || sizes.viajero;
  const bodyMat = new THREE.MeshStandardMaterial({ color: color || 0xc0392b, roughness: 0.35, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.2, metalness: 0.4 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(s[0] * 0.85, 0.5, s[2] * 0.45), cabinMat);
  cabin.position.set(0, 1.05, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wheelPos = [[-s[0] / 2, 0.34, s[2] / 2 - 0.7], [s[0] / 2, 0.34, s[2] / 2 - 0.7], [-s[0] / 2, 0.34, -s[2] / 2 + 0.7], [s[0] / 2, 0.34, -s[2] / 2 + 0.7]];
  for (const p of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(p[0], p[1], p[2]);
    group.add(w);
  }
  if (archetype === "enforcer") {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 0.9 }));
    bar.position.set(0, 1.35, -0.2);
    group.add(bar);
  }
  if (archetype === "taxi") {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0x554400 }));
    sign.position.set(0, 1.35, -0.2);
    group.add(sign);
  }
  group.userData.archetype = archetype;
  return group;
}
export function pedMesh(type, palette) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: (palette && palette.skin) || 0xc89878, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: (palette && palette.shirt) || 0x3e6fb0, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: (palette && palette.pants) || 0x2c3240, roughness: 0.9 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
  head.position.y = 1.62;
  group.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26), shirt);
  torso.position.y = 1.12;
  group.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.2), pants);
  legL.position.set(-0.12, 0.4, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.2), pants);
  legR.position.set(0.12, 0.4, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.62, 0.13), shirt);
  armL.position.set(-0.29, 1.12, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.62, 0.13), shirt);
  armR.position.set(0.29, 1.12, 0);
  group.add(armR);
  group.userData.type = type || "civilian";
  return group;
}
export function roadMesh(lane) {
  const len = lane.length || 40;
  const w = lane.width || 8;
  const geo = new THREE.PlaneGeometry(w, len);
  const mat = new THREE.MeshStandardMaterial({ map: laneMarkingTexture(), roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = lane.heading || 0;
  mesh.position.set(lane.x || 0, 0.02, lane.z || 0);
  return mesh;
}
export function sidewalkMesh() {
  const geo = new THREE.PlaneGeometry(2.4, 20);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.06;
  return mesh;
}
export function debrisMesh() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), mat);
    m.position.set((i % 3) * 0.3 - 0.3, 0.1, Math.floor(i / 3) * 0.3 - 0.15);
    m.rotation.set(i, i * 0.7, i * 0.3);
    group.add(m);
  }
  return group;
}
export function smokeSprite() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, "rgba(200,200,200,0.7)");
  grad.addColorStop(1, "rgba(200,200,200,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  return new THREE.Sprite(mat);
}
export function bloodPuff(particles) {
  const group = new THREE.Group();
  const n = particles || 8;
  const mat = new THREE.MeshBasicMaterial({ color: 0x8a8f96 });
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat);
    const a = (i / n) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.3, 0.4 + (i % 3) * 0.12, Math.sin(a) * 0.3);
    group.add(m);
  }
  return group;
}
