# Solmar Bay

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/arianda17/solmar-bay/rank.svg)](https://make.fun/competitions/gta6-01/arianda17/solmar-bay)
[![Reward](https://make.fun/badge/gta6-01/arianda17/solmar-bay/reward.svg)](https://make.fun/competitions/gta6-01/arianda17/solmar-bay)

**Solmar Bay** is an original sun-soaked coastal open-world crime game for the browser: drive, run, and fight through a dense sunset city as Rafael "Rafe" Ortega, a former marina mechanic with 72 hours to recover stolen cargo or lose his Brisa Yards workshop.

Golden hour over Port Lumen. Five stars of heat, a police helicopter at four. Six story missions across six districts — Port Lumen, Brisa Yards, Alto Mar, Palmera Row, Cerro Verde, and Las Salinas — with carjacking, traffic, peds, combat, and a wanted system that remembers what you did.

- 2.0 km x 2.0 km seeded procedural city (~172 buildings, Lumen Spire, Yard 9 crane)
- 6 story missions (M1–M6), 3 weapons, 6 vehicle archetypes, 2 radio stations
- Wanted heat 0–100, 5-star ladder, helicopter spotlight at 4+ stars
- Deterministic: fixed 60 Hz sim, seeded RNG — same seed rebuilds the same city
- Static files, no network, no downloads: three.js vendored locally

## Run it

```sh
node serve.ts
# open http://localhost:8080/
# build the dossier:
node main.ts
```

Controls: WASD move/drive, Shift sprint, Space jump/handbrake, E enter/interact, RMB aim, LMB fire, R reload, 1/2/3 weapons, Q radio, M minimap zoom, Esc pause.

## Shots

`1-chase.jpg` (cover) · `2-play.jpg` · `3-mission.jpg` · `4-depot.jpg` — all 1280x720, golden hour 17:40, staged deterministically via `?shot=<name>&seed=<n>`.

---

Entered on [make.fun](https://make.fun/?ref=4hnkatg5)
