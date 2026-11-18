// sim.js — fixed-step 60 Hz core, seeded RNG, actor registry. No wall clock,
// no unseeded RNG: same seed + same inputs -> identical state, every run.
export const TICK = 1 / 60, TAU = Math.PI * 2, SEED = 20261124;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const d2 = (ax, az, bx, bz) => { const x = ax - bx, z = az - bz; return x * x + z * z; };
// mulberry32: small fast seeded PRNG. State is a 32-bit int, advanced per call.
export function mulberry32(a) {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Deterministic 2D hash -> [0,1): stable per (x,z,seed) without stream order.
export function hash2(x, z, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed, 974634211)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next, int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    range: (a, b) => a + next() * (b - a),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
  };
}
// Fixed-step world: accumulator in main.js feeds step() at exactly 60 Hz.
export function createSim(seed = SEED) {
  const sim = {
    seed, rng: makeRng(seed), tick: 0, time: 0, actors: [],
    add(a) { sim.actors.push(a); return a; },
    remove(a) { const i = sim.actors.indexOf(a); if (i >= 0) sim.actors.splice(i, 1); },
    // One fixed tick: advance clock, then every actor with a step(dt,sim).
    step() {
      sim.tick++; sim.time += TICK;
      for (let i = 0; i < sim.actors.length; i++) {
        const a = sim.actors[i];
        if (a.step) a.step(TICK, sim);
      }
    },
  };
  return sim;
}
