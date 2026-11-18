// cityGenerator.js — seeded city: 6 districts, ~172 buildings + ~40 container
// stacks, props, water mask, landmarks. Same seed -> identical city.
// District table: [name, cx, cz, radius, count, minStories, maxStories, tint]
export const DISTRICTS = [
  ["Port Lumen", 0, -620, 520, 46, 8, 22, 0x3f3a34],
  ["Brisa Yards", -620, 300, 420, 22, 2, 6, 0x4c443a],
  ["Alto Mar", 560, 420, 460, 38, 1, 4, 0x6b6055],
  ["Palmera Row", 300, -760, 480, 26, 2, 8, 0x4a4136],
  ["Cerro Verde", -80, 620, 420, 30, 2, 6, 0x57523f],
  ["Las Salinas", -780, -480, 380, 10, 1, 3, 0x4a4a3c],
];
export const STORY_H = 3.4;
export function generateCity(rng, graph) {
  const buildings = [], props = { palms: [], lamps: [], hydrants: [], bins: [], parked: [], stalls: [], barriers: [], crates: [] };
  const used = [];
  const far = (x, z, r) => used.every(u => (u[0] - x) ** 2 + (u[1] - z) ** 2 > r * r);
  let bi = 0;
  for (const [name, cx, cz, rad, count, sMin, sMax, tint] of DISTRICTS) {
    const mean = (sMin + sMax) / 2;
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 24 && !ok; t++) {
        const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * rad * 0.88;
        x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
        ok = far(x, z, 26) && Math.abs(x) < 980 && Math.abs(z) < 980;
      }
      if (!ok) continue;
      used.push([x, z]);
      const stories = Math.max(1, Math.round(mean * rng.range(0.7, 1.3)));
      const spire = name === "Port Lumen" && i === 0; // Lumen Spire, 22 + beacon
      const h = (spire ? 22 : stories) * STORY_H;
      const w = rng.range(14, 26), d = rng.range(14, 26);
      const b = {
        id: bi++, district: name, x, z, w, d, h, stories: spire ? 22 : stories,
        spire, lit: rng.next(), neon: (name === "Palmera Row" || name === "Port Lumen") && rng.chance(0.4),
        awning: ["Port Lumen", "Palmera Row", "Cerro Verde"].includes(name) && rng.chance(0.6),
        roof: h > 4 * STORY_H ? Math.floor(rng.next() * 3) + 1 : 0, tint,
      };
      buildings.push(b);
    }
  }
  // Brisa Yards: ~40 container stacks around Solis Freight Depot (-620,300).
  const containers = [];
  for (let i = 0; i < 40; i++) {
    const gx = -620 + (i % 8) * 16 - 56 + rng.range(-3, 3);
    const gz = 300 + Math.floor(i / 8) * 14 - 28 + rng.range(-3, 3);
    containers.push({ x: gx, z: gz, h: rng.pick([2.6, 2.6, 5.2]), c: rng.pick([0xb3402f, 0x2f6db3, 0x3f8f5f, 0xc8a03c]) });
  }
  // Props: seeded per district, snapped near roads (offsets from district centre).
  const scatter = (arr, n, cx, cz, rad, minD) => {
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * rad;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x) > 980 || Math.abs(z) > 980) continue;
      if (arr.every(p => (p.x - x) ** 2 + (p.z - z) ** 2 > minD * minD)) arr.push({ x, z, r: rng.next() });
    }
  };
  scatter(props.palms, 24, 300, -760, 420, 12); // Palmera Row median/boardwalk
  scatter(props.palms, 6, 0, -620, 400, 12);
  scatter(props.lamps, 160, 0, 0, 950, 20); // arterials 20-25 m, others wider
  scatter(props.hydrants, 44, 0, -500, 800, 60);
  scatter(props.bins, 70, 0, 0, 900, 40);
  scatter(props.parked, 100, 0, 0, 950, 40); // ~1 per 40-50 m, district-typed
  scatter(props.stalls, 7, -80, 620, 120, 8); // Mercado Verde plaza
  scatter(props.stalls, 5, 0, -620, 140, 8); // Tidewheel Promenade
  scatter(props.barriers, 6, -620, 300, 160, 10); // depot + chop-shop alley
  scatter(props.barriers, 3, -780, -480, 200, 10);
  scatter(props.crates, 10, 300, -760, 200, 6); // pier crates (shot 3)
  return {
    buildings, containers, props,
    water: { z: -860, edge: -820 }, // bay edge: barrier 2 m offshore, seawall
    landmarks: {
      spire: buildings.find(b => b.spire) || buildings[0],
      crane: { x: -560, z: 240, h: 42 }, // Yard 9 red gantry crane
      pier: { x: 300, z: -860, len: 120 },
      tower: { x: -780, z: -480, h: 26 }, // Salinas Water Tower
      fountain: { x: -80, z: 620 }, // Old Tram Fountain
      crest: { x: 560, z: 420, h: 18 }, // Mirador Crest
    },
    districtAt(x, z) {
      let best = DISTRICTS[0], bd = 1e12;
      for (const d of DISTRICTS) { const dd = (d[1] - x) ** 2 + (d[2] - z) ** 2; if (dd < bd) { bd = dd; best = d; } }
      return best[0];
    },
  };
}
