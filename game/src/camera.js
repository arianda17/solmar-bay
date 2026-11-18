// camera.js — follow / aim / vehicle / shot rigs. Pure math: update() returns
// a pose {pos, look, fov}; main.js applies it to the THREE camera. No RNG,
// no wall clock; shake decays deterministically per tick.
import { clamp, lerp, TICK } from "./sim.js";
export const FOOT_DIST = 3.2, FOOT_H = 1.6; // locked live-play on-foot values
export const SHOT_FOOT_DIST = 12; // shot mode (v1 polisher): player ~13% frame
export const AIM_DIST = 1.8, AIM_FOV = 45; // over-shoulder aim, FOV -10
export const VEH_FAR = 6.5, VEH_NEAR = 4.8, VEH_HOOD = 1.2;
const BASE_FOV = 60;
export function createCameraRig() {
  const rig = {
    mode: "foot", // foot | aim | vehicle | cine | shotFoot | shotChase | shotAim | shotDepot
    yaw: 0, pitch: 0.12, shake: 0, vehMode: 0, // 0 far, 1 near, 2 hood
    px: 0, py: 2, pz: 0, lx: 0, ly: 1, lz: -1, // smoothed pos/look
    addShake(a) { rig.shake = Math.min(rig.shake + a, 0.6); },
    cycleVeh() { rig.vehMode = (rig.vehMode + 1) % 3; },
    update(dt, s) {
      // s: {pos:[x,y,z], heading, speed, inVehicle, aiming, shot}
      const k = 1 - Math.pow(0.0001, dt); // ~0.12 s damped lag
      let dist = FOOT_DIST, h = FOOT_H, fov = BASE_FOV, back = 0, lat = 0;
      let lookAhead = 6, lookY = 1.2;
      if (s.shot === "chase") {
        // Cover: car 12-18% of frame width (round 1: 20-23% at 9.5 m).
        dist = 13; h = 3.0; fov = 62; back = 1; lookAhead = 8; lookY = 1.0;
      } else if (s.shot) {
        // Shot foot/aim/depot: 9 m back (round 1: 12 m gave a ~8-10% figure,
        // target ~13%), pitched down so sky <= 25% and the street reads.
        dist = 9; h = 2.4; lookAhead = 8; lookY = 0.9;
        if (s.shot === "mission") { fov = 50; lat = 1.4; } // over-shoulder
      } else if (s.inVehicle) {
        dist = rig.vehMode === 2 ? VEH_HOOD : rig.vehMode === 1 ? VEH_NEAR : VEH_FAR;
        h = rig.vehMode === 2 ? 1.2 : 2.2;
        fov = BASE_FOV + clamp(s.speed / 48, 0, 1) * 15; // 60 -> 75 with speed
        back = 1;
      } else if (s.aiming) { dist = AIM_DIST; h = 1.55; fov = AIM_FOV; }
      const yaw = s.inVehicle || s.shot === "chase" ? s.heading + Math.PI : rig.yaw;
      const cx = Math.sin(yaw), cz = Math.cos(yaw);
      // Lateral offset (mission over-shoulder): camera + look shift right so
      // the player sits left-of-centre and the aim line reads. Right vector
      // in xz for view dir (cx,cz) is (-cz,cx).
      const rx = -cz * lat, rz = cx * lat;
      // Camera sits behind the heading (or behind rig yaw on foot).
      const tx = s.pos[0] - cx * dist + rx, tz = s.pos[2] - cz * dist + rz;
      const ty = s.pos[1] + h;
      rig.px = lerp(rig.px, tx, k); rig.py = lerp(rig.py, ty, k); rig.pz = lerp(rig.pz, tz, k);
      // Look slightly ahead of the player, pitched down so sky <= 25% of frame.
      const lx = s.pos[0] + cx * lookAhead + rx, lz = s.pos[2] + cz * lookAhead + rz, ly = s.pos[1] + lookY;
      rig.lx = lerp(rig.lx, lx, k); rig.ly = lerp(rig.ly, ly, k); rig.lz = lerp(rig.lz, lz, k);
      rig.shake = Math.max(0, rig.shake - dt * 1.4);
      const sh = rig.shake * rig.shake;
      const wob = Math.sin(s.time * 47) * sh * 0.12;
      return {
        pos: [rig.px + wob, rig.py + wob * 0.6, rig.pz],
        look: [rig.lx, rig.ly, rig.lz], fov,
        // Push-in floor: never closer than 0.6 m to the player (collision).
        minDist: 0.6,
      };
    },
    // Mouse-look deltas: yaw wraps, pitch clamped; aim sensitivity x0.85.
    applyLook(dx, dy, aiming) {
      const s = aiming ? 0.0021 : 0.0025; // 0.0025 * 0.85 aim
      rig.yaw -= dx * s;
      rig.pitch = clamp(rig.pitch + dy * s, -0.5, 0.55);
    },
  };
  return rig;
}
export { TICK };
