import { mulberry32, hashSeed, DEFAULT_SEED } from "./sim.js";
import { getRoadGraph } from "./roadgraph.js";
export const DISTRICTS = [
  { id: "port-lumen", name: "Port Lumen", minX: -350, maxX: 350, minZ: 500, maxZ: 920, density: 1.2, landmark: "Lumen Spire" },
  { id: "brisa-yards", name: "Brisa Yards", minX: -1000, maxX: -350, minZ: 300, maxZ: 920, density: 0.6, landmark: "Yard 9 Crane" },
  { id: "alto-mar", name: "Alto Mar", minX: -1000, maxX: -300, minZ: -1000, maxZ: 300, density: 0.8, landmark: "Mirador Crest" },
  { id: "palmera-row", name: "Palmera Row", minX: 350, maxX: 1000, minZ: 500, maxZ: 920, density: 1.2, landmark: "Solmar Pier" },
  { id: "cerro-verde", name: "Cerro Verde", minX: -300, maxX: 400, minZ: -1000, maxZ: 500, density: 1.0, landmark: "Mercado Verde" },
  { id: "las-salinas", name: "Las Salinas", minX: 400, maxX: 1000, minZ: -1000, maxZ: 500, density: 0.5, landmark: "Salinas Water Tower" },
];
export function districtFor(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) return d;
  }
  return DISTRICTS[0];
}
export function buildRoadGraph(seed) {
  return getRoadGraph(seed === undefined ? DEFAULT_SEED : seed);
}
const CHUNK = 250;
export function generateChunk(cx, cz, seed) {
  const sd = seed === undefined ? DEFAULT_SEED : seed;
  const rng = mulberry32(hashSeed(sd, cx, cz));
  const minX = cx * CHUNK;
  const minZ = cz * CHUNK;
  const buildings = [];
  const lots = [];
  const g = getRoadGraph(sd);
  for (let i = 0; i < 26; i++) {
    const x = minX + rng() * CHUNK;
    const z = minZ + rng() * CHUNK;
    if (z > 905) continue; // bay water, no lots
    let nearRoad = false;
    for (const e of g.edges) {
      const a = g.nodeById.get(e.a);
      const b = g.nodeById.get(e.b);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      if (Math.hypot(px - x, pz - z) < 11) { nearRoad = true; break; }
    }
    if (nearRoad) continue;
    const d = districtFor(x, z);
    const lot = { x, z, w: 14 + rng() * 22, d: 14 + rng() * 22, district: d.id, rot: rng() * 0.2 - 0.1 };
    lots.push(lot);
    buildings.push(lotBuilding(lot, rng));
  }
  return { cx, cz, seed: sd, lots, buildings, props: propsForChunk({ cx, cz, seed: sd, lots }), water: waterMask({ cx, cz }) };
}
export function lotBuilding(lot, rng) {
  const d = DISTRICTS.find((x) => x.id === lot.district) || DISTRICTS[0];
  let stories = 2 + Math.floor(rng() * 6);
  if (d.id === "port-lumen") stories = 6 + Math.floor(rng() * 16);
  if (d.id === "brisa-yards") stories = 1 + Math.floor(rng() * 2);
  if (d.id === "las-salinas") stories = 1 + Math.floor(rng() * 2);
  const palettes = {
    "port-lumen": [0x9fb4c8, 0x7e93a8, 0xb8c4cc, 0x5f7d95],
    "brisa-yards": [0x8a6f5c, 0x7a7d84, 0x9c8468, 0x6e5a4e],
    "alto-mar": [0xe8dcc8, 0xd8c8b0, 0xc8b89a, 0xf0e6d4],
    "palmera-row": [0xf2c9a0, 0xf7d9b0, 0xe8a88c, 0xf5e6c8],
    "cerro-verde": [0xc8b49a, 0xb8a888, 0xd8c8a8, 0xa89a80],
    "las-salinas": [0x9a8f7a, 0x8a8070, 0xa89a84, 0x7a6f60],
  };
  const pal = palettes[d.id] || palettes["port-lumen"];
  return {
    x: lot.x, z: lot.z, w: lot.w, d: lot.d, rot: lot.rot,
    height: stories * 3.2,
    stories,
    color: pal[Math.floor(rng() * pal.length)],
    district: d.id,
    roof: rng() < 0.3 ? "flat-ac" : "flat",
    litRatio: 0.25 + rng() * 0.45,
  };
}
export function buildingColliders(chunk) {
  const out = [];
  for (const b of chunk.buildings || []) {
    const hw = b.w / 2;
    const hd = b.d / 2;
    out.push({ minX: b.x - hw, maxX: b.x + hw, minZ: b.z - hd, maxZ: b.z + hd, height: b.height, kind: "building" });
  }
  return out;
}
export function propsForChunk(chunk) {
  const rng = mulberry32(hashSeed(chunk.seed, chunk.cx * 3 + 1, chunk.cz * 3 + 1));
  const props = [];
  const kinds = ["palm", "planter", "lamp", "bench", "hydrant", "sign", "container", "crate"];
  for (let i = 0; i < 18; i++) {
    const x = chunk.cx * CHUNK + rng() * CHUNK;
    const z = chunk.cz * CHUNK + rng() * CHUNK;
    if (z > 905) continue;
    const d = districtFor(x, z);
    let kind = kinds[Math.floor(rng() * kinds.length)];
    if (d.id === "palmera-row" || d.id === "port-lumen") kind = rng() < 0.5 ? "palm" : kind;
    if (d.id === "brisa-yards") kind = rng() < 0.5 ? "container" : kind;
    props.push({ x, z, kind, rot: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.6 });
  }
  return props;
}
export function waterMask(chunk) {
  return chunk.cz * CHUNK + CHUNK > 905;
}
export function bridgeNeeded(x, z) {
  if (x > 400 && x < 700 && z > -60 && z < 60) return { x: 550, z: 0, kind: "rust-gate" };
  return null;
}
export function spawnPointForDistrict(district) {
  const d = typeof district === "string"
    ? DISTRICTS.find((x) => x.id === district || x.name === district)
    : district;
  const target = d || DISTRICTS[0];
  const spots = {
    "port-lumen": { x: 0, y: 0, z: 700, heading: Math.PI },
    "brisa-yards": { x: -650, y: 0, z: 600, heading: 0 },
    "alto-mar": { x: -650, y: 0, z: -500, heading: Math.PI / 2 },
    "palmera-row": { x: 650, y: 0, z: 700, heading: Math.PI },
    "cerro-verde": { x: 0, y: 0, z: -200, heading: 0 },
    "las-salinas": { x: 700, y: 0, z: -300, heading: -Math.PI / 2 },
  };
  return spots[target.id] || spots["port-lumen"];
}
