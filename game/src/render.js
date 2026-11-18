import * as THREE from "three";
import { buildingMesh, carMesh, pedMesh, roadMesh, sidewalkMesh } from "./assets.js";
import { districtFor } from "./cityGenerator.js";
let renderer = null;
let scene = null;
let sunLight = null;
let hemiLight = null;
let drawCalls = 0;
let triangles = 0;
const MAX_DRAW_CALLS = 900;
const MAX_TRIANGLES = 1500000;
const MAX_DYNAMIC_LIGHTS = 8;
export function lightingSetup(sceneObj) {
  sunLight = new THREE.DirectionalLight(0xffb36b, 2.6);
  sunLight.position.set(-160, 90, 60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -60;
  sunLight.shadow.camera.right = 60;
  sunLight.shadow.camera.top = 60;
  sunLight.shadow.camera.bottom = -60;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 400;
  sunLight.shadow.bias = -0.0004;
  sceneObj.add(sunLight);
  sceneObj.add(sunLight.target);
  hemiLight = new THREE.HemisphereLight(0x8fb8dd, 0x8a6a4a, 0.85);
  sceneObj.add(hemiLight);
  const amb = new THREE.AmbientLight(0xffd9a0, 0.25);
  sceneObj.add(amb);
  return { sun: sunLight, hemi: hemiLight, ambient: amb };
}
export function sceneBuild(city) {
  scene = new THREE.Scene();
  const gc=document.createElement("canvas"),gx=gc.getContext("2d"),gr=gx.createLinearGradient(0,0,0,150);
  gr.addColorStop(0,"#ff8f4d");gr.addColorStop(.6,"#ffc98a");gr.addColorStop(1,"#f7c489");
  gx.fillStyle=gr;gx.fillRect(0,0,300,150);
  const gt=new THREE.CanvasTexture(gc);gt.colorSpace=THREE.SRGBColorSpace;scene.background=gt;
  scene.fog = new THREE.Fog(0xf7c489, 260, 900);
  lightingSetup(scene);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x6f7a5a, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  const beachMat = new THREE.MeshStandardMaterial({ color: 0xe8d29a, roughness: 1 });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(2000, 100), beachMat);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.0, 955);
  beach.receiveShadow = true;
  scene.add(beach);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2e7f9e, roughness: 0.25, metalness: 0.35 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2000, 160), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, 1030);
  scene.add(water);
  const chunks = city.chunks || [];
  let built = 0;
  for (const chunk of chunks) {
    for (const b of chunk.buildings || []) {
      if (built >= 420) break;
      const mesh = buildingMesh(b, null);
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(mesh);
      built += 1;
    }
    for (const p of chunk.props || []) {
      if (p.kind === "palm") {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.22, 5, 6),
          new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }),
        );
        trunk.position.set(p.x, 2.5, p.z);
        trunk.castShadow = true;
        scene.add(trunk);
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(1.8, 1.6, 7),
          new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 1 }),
        );
        crown.position.set(p.x, 5.6, p.z);
        scene.add(crown);
      } else if (p.kind === "lamp") {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 5.4, 6),
          new THREE.MeshStandardMaterial({ color: 0x333a42, roughness: 0.6, metalness: 0.5 }),
        );
        pole.position.set(p.x, 2.7, p.z);
        scene.add(pole);
      } else if (p.kind === "container") {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(6, 2.6, 2.4),
          new THREE.MeshStandardMaterial({ color: 0xa34d2d, roughness: 0.8 }),
        );
        box.position.set(p.x, 1.3, p.z);
        box.rotation.y = p.rot || 0;
        box.castShadow = true;
        scene.add(box);
      }
    }
  }
  const graph = city.roadGraph;
  if (graph) {
    for (const e of graph.edges) {
      const a = graph.nodeById.get(e.a);
      const b = graph.nodeById.get(e.b);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 4) continue;
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      const mesh = roadMesh({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, length: len, width: e.kind === "arterial" ? 12 : e.kind === "collector" ? 8 : 6, heading });
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
  const spire = new THREE.Mesh(
    new THREE.BoxGeometry(26, 70, 26),
    new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.25, metalness: 0.5 }),
  );
  spire.position.set(-40, 35, 620);
  spire.castShadow = true;
  scene.add(spire);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x33e8ff, emissive: 0x33e8ff, emissiveIntensity: 2.2 }),
  );
  beacon.position.set(-40, 71, 620);
  scene.add(beacon);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.2, 120),
    new THREE.MeshStandardMaterial({ color: 0x9a7a54, roughness: 0.95 }),
  );
  pier.position.set(650, 0.6, 960);
  scene.add(pier);
  return scene;
}
export function getScene() { return scene; }
export function getRenderer() { return renderer; }
export function createRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}
export function instancedMeshUpdate(mesh, instances) {
  if (!mesh || !instances) return 0;
  const count = Math.min(instances.length, mesh.count);
  for (let i = 0; i < count; i++) {
    const it = instances[i];
    const m = new THREE.Matrix4();
    m.makeRotationY(it.heading || 0);
    m.setPosition(it.x || 0, it.y || 0, it.z || 0);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = count;
  return count;
}
export function drawCallBudget() {
  if (!renderer) return { drawCalls: 0, triangles: 0, lights: 0, withinBudget: true };
  const info = renderer.info;
  drawCalls = info.render.calls;
  triangles = info.render.triangles;
  return {
    drawCalls,
    triangles,
    lights: MAX_DYNAMIC_LIGHTS,
    withinBudget: drawCalls <= MAX_DRAW_CALLS && triangles <= MAX_TRIANGLES,
  };
}
export function fogUpdate(camera) {
  if (!scene || !scene.fog) return;
  scene.fog.near = 260;
  scene.fog.far = 900;
}
export function shadowCameraFollow(player) {
  if (!sunLight || !player) return;
  const p = player.pos || player;
  sunLight.position.set(p.x - 160, 90, p.z + 60);
  sunLight.target.position.set(p.x, 0, p.z);
  sunLight.target.updateMatrixWorld();
}
export function rendererInfo() {
  const b = drawCallBudget();
  return { drawCalls: b.drawCalls, triangles: b.triangles, lights: b.lights, withinBudget: b.withinBudget, shadowMapSize: 2048, shadowRange: 120 };
}
export function renderFrame(sceneObj, camera, tick) {
  if (!renderer || !sceneObj || !camera) return false;
  shadowCameraFollow({ pos: camera.userData && camera.userData.playerPos ? camera.userData.playerPos : { x: 0, y: 0, z: 0 } });
  fogUpdate(camera);
  renderer.render(sceneObj, camera);
  return true;
}
export function addCarToScene(car) {
  if (!scene) return null;
  const mesh = carMesh(car.archetype || "viajero", car.color || 0xc0392b);
  mesh.position.set(car.pos.x, 0, car.pos.z);
  mesh.rotation.y = car.heading || 0;
  mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(mesh);
  car.mesh = mesh;
  return mesh;
}
export function addPedToScene(ped) {
  if (!scene) return null;
  const mesh = pedMesh(ped.type || "civilian", ped.palette);
  mesh.position.set(ped.pos.x, 0, ped.pos.z);
  mesh.rotation.y = ped.heading || 0;
  mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(mesh);
  ped.mesh = mesh;
  return mesh;
}
export function districtTint(x, z) {
  return districtFor(x, z).id;
}
