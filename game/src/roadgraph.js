import { mulberry32, hashSeed } from "./sim.js";
export const LIGHT_GREEN_TICKS = 12 * 60;
export const LIGHT_RED_TICKS = 2 * 60;
let graphCache = null;
let graphSeed = -1;
export function getRoadGraph(seed) {
  if (graphCache && graphSeed === seed) return graphCache;
  const rng = mulberry32(seed);
  const nodes = [];
  const edges = [];
  const nodeById = new Map();
  function addNode(x, z, kind) {
    const id = nodes.length;
    const n = { id, x, z, kind: kind || "junction", edges: [] };
    nodes.push(n);
    nodeById.set(id, n);
    return n;
  }
  const arterialZ = [-700, -420, -150, 120, 380, 620, 860];
  const arterialX = [-800, -480, -160, 160, 480, 800];
  const grid = [];
  for (let iz = 0; iz < arterialZ.length; iz++) {
    grid[iz] = [];
    for (let ix = 0; ix < arterialX.length; ix++) {
      const jx = arterialX[ix] + (rng() - 0.5) * 40;
      const jz = arterialZ[iz] + (rng() - 0.5) * 40;
      grid[iz][ix] = addNode(jx, jz, "arterial");
    }
  }
  function link(a, b, kind, lanes, speed) {
    const e = { a: a.id, b: b.id, kind, lanes, speed, length: Math.hypot(b.x - a.x, b.z - a.z) };
    edges.push(e);
    a.edges.push(edges.length - 1);
    b.edges.push(edges.length - 1);
    return e;
  }
  for (let iz = 0; iz < arterialZ.length; iz++) {
    for (let ix = 0; ix < arterialX.length; ix++) {
      if (ix + 1 < arterialX.length) link(grid[iz][ix], grid[iz][ix + 1], "arterial", 4, 20);
      if (iz + 1 < arterialZ.length) link(grid[iz][ix], grid[iz + 1][ix], "arterial", 4, 20);
    }
  }
  for (let i = 0; i < 40; i++) {
    const iz = Math.floor(rng() * (arterialZ.length - 1));
    const ix = Math.floor(rng() * (arterialX.length - 1));
    const mx = (arterialX[ix] + arterialX[ix + 1]) / 2 + (rng() - 0.5) * 60;
    const mz = (arterialZ[iz] + arterialZ[iz + 1]) / 2 + (rng() - 0.5) * 60;
    const mid = addNode(mx, mz, "collector");
    link(grid[iz][ix], mid, "collector", 2, 14);
    link(mid, grid[iz + 1][ix + 1], "collector", 2, 14);
  }
  for (let i = 0; i < 120; i++) {
    const base = nodes[Math.floor(rng() * grid.length * grid[0].length)];
    const ang = rng() * Math.PI * 2;
    const len = 40 + rng() * 90;
    const leaf = addNode(base.x + Math.cos(ang) * len, base.z + Math.sin(ang) * len, "local");
    leaf.x = Math.max(-980, Math.min(980, leaf.x));
    leaf.z = Math.max(-980, Math.min(900, leaf.z));
    link(base, leaf, "local", 2, 12);
  }
  const roundabouts = [
    { x: 0, z: 0, r: 26 },
    { x: 620, z: 700, r: 22 },
  ];
  for (const rb of roundabouts) {
    const ring = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ring.push(addNode(rb.x + Math.cos(a) * rb.r, rb.z + Math.sin(a) * rb.r, "roundabout"));
    }
    for (let k = 0; k < 8; k++) link(ring[k], ring[(k + 1) % 8], "roundabout", 2, 10);
  }
  graphCache = { nodes, edges, nodeById, roundabouts, seed };
  graphSeed = seed;
  return graphCache;
}
export function nearestNode(pos, seed) {
  const g = getRoadGraph(seed === undefined ? 20261124 : seed);
  let best = g.nodes[0];
  let bestD = Infinity;
  for (const n of g.nodes) {
    const d = (n.x - pos.x) * (n.x - pos.x) + (n.z - pos.z) * (n.z - pos.z);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}
export function nearestLanePoint(pos, seed) {
  const g = getRoadGraph(seed === undefined ? 20261124 : seed);
  let best = null;
  let bestD = Infinity;
  for (const e of g.edges) {
    const a = g.nodeById.get(e.a);
    const b = g.nodeById.get(e.b);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((pos.x - a.x) * dx + (pos.z - a.z) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = (px - pos.x) * (px - pos.x) + (pz - pos.z) * (pz - pos.z);
    if (d < bestD) { bestD = d; best = { x: px, z: pz, edge: e, t, dirX: dx / Math.sqrt(len2), dirZ: dz / Math.sqrt(len2) }; }
  }
  return best;
}
export function lanePath(from, to, seed) {
  const pts = [];
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const steps = Math.max(1, Math.ceil(len / 10));
  for (let i = 0; i <= steps; i++) {
    pts.push({ x: from.x + (dx * i) / steps, z: from.z + (dz * i) / steps });
  }
  return pts;
}
export function intersectionLight(node, tick) {
  const cycle = LIGHT_GREEN_TICKS * 2 + LIGHT_RED_TICKS * 2;
  const phase = (tick + node.id * 137) % cycle;
  const nsGreen = node.id % 2 === 0;
  if (phase < LIGHT_GREEN_TICKS) return nsGreen ? "ns-green" : "ew-green";
  if (phase < LIGHT_GREEN_TICKS + LIGHT_RED_TICKS) return "all-red";
  if (phase < LIGHT_GREEN_TICKS * 2 + LIGHT_RED_TICKS) return nsGreen ? "ew-green" : "ns-green";
  return "all-red";
}
export function roadBlockPositions(stars, playerPos, seed) {
  const g = getRoadGraph(seed === undefined ? 20261124 : seed);
  const count = stars >= 5 ? 3 : stars >= 3 ? 2 : 1;
  const out = [];
  const rng = mulberry32(hashSeed(seed === undefined ? 20261124 : seed, 7, 11));
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = 120 + rng() * 60;
    const p = { x: playerPos.x + Math.cos(ang) * dist, z: playerPos.z + Math.sin(ang) * dist };
    const lp = nearestLanePoint(p, seed === undefined ? 20261124 : seed);
    if (lp) out.push({ x: lp.x, z: lp.z });
  }
  return out;
}
export function randomLanePointNear(pos, minR, maxR, seed) {
  const sd = seed === undefined ? 20261124 : seed;
  const g = getRoadGraph(sd);
  const rng = mulberry32(hashSeed(sd, Math.floor(pos.x / 50), Math.floor(pos.z / 50)));
  for (let tries = 0; tries < 24; tries++) {
    const e = g.edges[Math.floor(rng() * g.edges.length)];
    const a = g.nodeById.get(e.a);
    const b = g.nodeById.get(e.b);
    const t = rng();
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const d = Math.hypot(x - pos.x, z - pos.z);
    if (d >= minR && d <= maxR) return { x, z, edge: e };
  }
  const lp = nearestLanePoint(pos, sd);
  return lp ? { x: lp.x, z: lp.z, edge: lp.edge } : { x: pos.x, z: pos.z, edge: null };
}
export function astarRoute(fromNode, toNode, seed) {
  const g = getRoadGraph(seed === undefined ? 20261124 : seed);
  const start = typeof fromNode === "number" ? g.nodeById.get(fromNode) : fromNode;
  const goal = typeof toNode === "number" ? g.nodeById.get(toNode) : toNode;
  if (!start || !goal) return null;
  if (start.id === goal.id) return [start];
  if (start.id === undefined || goal.id === undefined || !g.nodeById.get(start.id) || !g.nodeById.get(goal.id)) return [start, goal];
  const open = [start.id];
  const came = new Map();
  const gScore = new Map([[start.id, 0]]);
  const fScore = new Map([[start.id, Math.hypot(goal.x - start.x, goal.z - start.z)]]);
  const closed = new Set();
  function h(n) { return Math.hypot(goal.x - n.x, goal.z - n.z); }
  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if ((fScore.get(open[i]) || Infinity) < (fScore.get(open[bestIdx]) || Infinity)) bestIdx = i;
    }
    const curId = open.splice(bestIdx, 1)[0];
    if (curId === goal.id) {
      const path = [];
      let c = curId;
      while (c !== undefined) { path.unshift(g.nodeById.get(c)); c = came.get(c); }
      return path;
    }
    closed.add(curId);
    const cur = g.nodeById.get(curId);
    for (const ei of cur.edges) {
      const e = g.edges[ei];
      const nid = e.a === curId ? e.b : e.a;
      if (closed.has(nid)) continue;
      const tentative = (gScore.get(curId) || 0) + e.length;
      if (tentative < (gScore.get(nid) || Infinity)) {
        came.set(nid, curId);
        gScore.set(nid, tentative);
        fScore.set(nid, tentative + h(g.nodeById.get(nid)));
        if (!open.includes(nid)) open.push(nid);
      }
    }
  }
  return [start, goal];
}
