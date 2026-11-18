export const FOOT_DIST = 3.2;
export const FOOT_HEIGHT = 1.6;
export const VEHICLE_FAR = 6.5;
export const VEHICLE_NEAR = 4.8;
export const VEHICLE_HOOD = 1.2;
export const AIM_DIST = 1.8;
export const AIM_FOV_DELTA = -10;
export const CAM_LAG = 0.12;
let shakeAmount = 0;
let shakePhase = 0;
export function camLag(pos, target, stiffness, dt) {
  const k = 1 - Math.exp(-(stiffness || 8) * (dt || 1 / 60));
  pos.x += (target.x - pos.x) * k;
  pos.y += (target.y - pos.y) * k;
  pos.z += (target.z - pos.z) * k;
  return pos;
}
export function camSpring(pos, target, dt) {
  return camLag(pos, target, 6, dt);
}
export function screenShake(amount) {
  shakeAmount = Math.max(shakeAmount, amount || 0);
  return shakeAmount;
}
function applyShake(camera, dt) {
  if (shakeAmount <= 0.001) return;
  const s = shakeAmount;
  shakePhase += dt * 37;
  camera.position.x += (Math.sin(shakePhase) * 0.5 + Math.sin(shakePhase * 0.37) * 0.5) * s * 0.12;
  camera.position.y += (Math.cos(shakePhase * 0.83) * 0.5 + Math.sin(shakePhase * 0.51) * 0.5) * s * 0.12;
  shakeAmount = Math.max(0, shakeAmount - dt * 2.2);
}
function behindPos(target, heading, dist, height) {
  return {
    x: target.x - Math.sin(heading) * dist,
    y: (target.y || 0) + height,
    z: target.z - Math.cos(heading) * dist,
  };
}
export function onFootCamUpdate(camera, player, dt, opts) {
  const o = opts || {};
  const heading = o.heading !== undefined ? o.heading : player.heading;
  const desired = behindPos(player.pos, heading, o.dist || FOOT_DIST, o.height || FOOT_HEIGHT);
  const dx = desired.x - player.pos.x;
  const dz = desired.z - player.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.6 && d > 0.0001) {
    desired.x = player.pos.x + (dx / d) * 0.6;
    desired.z = player.pos.z + (dz / d) * 0.6;
  }
  camLag(camera.position, desired, 1 / Math.max(CAM_LAG, 0.01), dt);
  camera.lookAt(player.pos.x, (player.pos.y || 0) + (o.lookY || 1.4), player.pos.z);
  applyShake(camera, dt);
  return camera;
}
export function vehicleCamUpdate(camera, car, dt, opts) {
  const o = opts || {};
  const mode = o.mode || "far";
  const dist = mode === "shot" ? 25 : mode === "hood" ? VEHICLE_HOOD : mode === "near" ? VEHICLE_NEAR : VEHICLE_FAR;
  const height = mode === "shot" ? 5.5 : mode === "hood" ? 1.15 : 2.4;
  const heading = car.heading || 0;
  const pos = car.pos || car;
  const desired = behindPos(pos, heading, dist, height);
  const stiffness = mode === "hood" ? 20 : 5;
  camLag(camera.position, desired, stiffness, dt);
  const la=mode==="shot"?0:8;
  const lookX = pos.x + Math.sin(heading) * la;
  const lookZ = pos.z + Math.cos(heading) * la;
  camera.lookAt(lookX,(pos.y||0)+(mode==="shot"?.3:1),lookZ);
  const speed = car.speed || 0;
  if (camera.fov !== undefined) {
    const targetFov = 60 + Math.min(15, (speed / 48) * 15);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
    if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
  }
  applyShake(camera, dt);
  return camera;
}
export function chaseCamUpdate(camera, target, dt, opts) {
  const o = opts || {};
  const heading = o.heading || 0;
  const desired = behindPos(target.pos || target, heading, o.dist || VEHICLE_FAR, o.height || 2.4);
  camLag(camera.position, desired, 5, dt);
  const t = target.pos || target;
  camera.lookAt(t.x, (t.y || 0) + 1.2, t.z);
  applyShake(camera, dt);
  return camera;
}
export function aimCamUpdate(camera, player, dt, opts) {
  const o = opts || {};
  const heading = o.heading !== undefined ? o.heading : player.heading;
  const back = o.back || AIM_DIST;
  const rx = Math.cos(heading) * 0.55;
  const rz = -Math.sin(heading) * 0.55;
  const desired = {
    x: player.pos.x - Math.sin(heading) * back + rx,
    y: (player.pos.y || 0) + (o.height || 1.55),
    z: player.pos.z - Math.cos(heading) * back + rz,
  };
  camLag(camera.position, desired, 14, dt);
  camera.lookAt(player.pos.x+Math.sin(heading)*(o.ahead||10),(player.pos.y||0)+(o.lookY||1.35),player.pos.z+Math.cos(heading)*(o.ahead||10));
  if (camera.fov !== undefined) {
    const base = o.baseFov || 60;
    const targetFov = base + AIM_FOV_DELTA;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
    if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
  }
  applyShake(camera, dt);
  return camera;
}
