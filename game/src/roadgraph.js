// roadgraph.js — road network: nodes/edges/lanes, A* astarRoute, traffic
// lights. City 2 km x 2 km, centre (0,0) bayfront roundabout. Deterministic
// from the seeded stream: same seed -> same graph.
import { clamp, hash2 } from "./sim.js";
export const HALF = 1000; // city half-size (m)
const GREEN = 12, ALLRED = 2; // timed lights: 12 s green, 2 s all-red
// 7 arterials (4-lane, 12 m), ~40 collectors (2-lane, 8 m), locals 6 m.
export function buildRoadGraph(rng) {
  const nodes = [], edges = [], byId = new Map();
  const addNode = (x, z, kind) => {
    const n = { id: nodes.length, x, z, kind, links: [] };
    nodes.push(n); byId.set(n.id, n); return n;
  };
  const link = (a, b, kind, w) => {
    const e = { a: a.id, b: b.id, kind, w, len: Math.hypot(b.x - a.x, b.z - a.z) };
    edges.push(e); a.links.push({ to: b.id, e }); b.links.push({ to: a.id, e });
    return e;
  };
  // Arterial spine: coast road along x at z=-820 (bayfront), ring + radials.
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    ring.push(addNode(Math.sin(t) * 620, Math.cos(t) * 620, "round"));
  }
  for (let i = 0; i < 8; i++) link(ring[i], ring[(i + 1) % 8], "arterial", 12);
  const coast = [addNode(-900, -820, "art"), addNode(0, -820, "art"), addNode(900, -820, "art")];
  link(coast[0], coast[1], "arterial", 12); link(coast[1], coast[2], "arterial", 12);
  link(coast[1], ring[0], "arterial", 12);
  // Grid collectors every ~250 m with seeded jitter, locals fill between.
  const grid = [];
  for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
    if (gx === 0 && gz === 0) continue;
    const jx = (hash2(gx, gz, 7) - 0.5) * 60, jz = (hash2(gx, gz, 11) - 0.5) * 60;
    grid.push(addNode(gx * 250 + jx, gz * 250 + jz, Math.abs(gx) + Math.abs(gz) <= 2 ? "collector" : "local"));
  }
  const near = (x, z) => { let best = null, bd = 1e9; for (const n of nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } } return best; };
  for (let i = 0; i < grid.length; i++) for (let j = i + 1; j < grid.length; j++) {
    const a = grid[i], b = grid[j];
    const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
    if ((dx < 290 && dz < 30) || (dz < 290 && dx < 30)) link(a, b, a.kind === "collector" || b.kind === "collector" ? "collector" : "local", a.kind === "collector" ? 8 : 6);
  }
  for (const g of grid) { const r = near(g.x, g.z); if (r !== g && !g.links.some(l => l.to === r.id)) link(g, r, "collector", 8); }
  // 2 roundabouts (Port Lumen centre, Palmera Row south) + 3 overpasses.
  const rounds = [{ x: 0, z: 0, r: 42 }, { x: 120, z: 640, r: 34 }];
  const overs = [{ x: -420, z: -300 }, { x: 380, z: 180 }, { x: -120, z: 520 }];
  // Traffic lights at arterial/collector intersections, phase from node id.
  const lights = nodes.filter(n => n.kind === "art" || n.kind === "collector").map(n => ({
    node: n.id, phase: (n.id * 7) % (GREEN + ALLRED), green: GREEN, allRed: ALLRED,
  }));
  const g = {
    nodes, edges, lights, rounds, overs,
    nearest(x, z) { return near(x, z); },
    // Light state at sim time t: 0 green, 1 all-red, 2 red for this approach.
    lightState(id, t) {
      const L = lights.find(l => l.node === id);
      if (!L) return 0;
      const c = (t + L.phase) % (GREEN + ALLRED);
      return c < GREEN ? 0 : 1;
    },
    // A*: node ids -> node list. No route -> null (caller falls back to straight line).
    astarRoute(a, b) {
      const open = [{ id: a, f: 0, g: 0, from: -1 }], came = new Map(), gs = new Map([[a, 0]]);
      const H = n => { const u = byId.get(n), v = byId.get(b); return Math.hypot(u.x - v.x, u.z - v.z); };
      while (open.length) {
        let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
        const cur = open.splice(bi, 1)[0];
        if (cur.id === b) {
          const path = [byId.get(b)]; let c = b;
          while (came.has(c)) { c = came.get(c); path.unshift(byId.get(c)); }
          return path;
        }
        for (const l of byId.get(cur.id).links) {
          const ng = gs.get(cur.id) + l.e.len;
          if (ng < (gs.get(l.to) ?? 1e9)) {
            gs.set(l.to, ng); came.set(l.to, cur.id);
            open.push({ id: l.to, f: ng + H(l.to), g: ng, from: cur.id });
          }
        }
      }
      return null;
    },
    // Lane offset point on edge a->b at distance s, lane side -1/1.
    lanePoint(e, s, side) {
      const a = byId.get(e.a), b = byId.get(e.b);
      const t = clamp(s / e.len, 0, 1);
      const dx = b.x - a.x, dz = b.z - a.z, L = e.len || 1;
      const nx = -dz / L, nz = dx / L, off = side * e.w * 0.25;
      return [a.x + dx * t + nx * off, a.z + dz * t + nz * off];
    },
  };
  return g;
}
export { clamp };
