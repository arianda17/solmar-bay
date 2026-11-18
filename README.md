# solmar-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=solmar-bay)
[![rank](https://make.fun/badge/gta6-01/arianda17/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=solmar-bay)
[![reward](https://make.fun/badge/gta6-01/arianda17/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=solmar-bay)

Solmar Bay is an original open-world crime game for the browser: a sun-soaked coastal city, 2 km x 2 km, six districts, driving and on-foot play, carjacking, traffic and pedestrians, a five-star wanted system with police chases and a helicopter, six story missions, combat, two procedural radio stations, and saves. Everything is original — city, characters, vehicles, names, story, art, sound — built from scratch with vendored three.js and no network. The game runs from static files under `game/`; `main.ts` hands it in and writes the dossier.

## Run it

```sh
node --experimental-strip-types main.ts
```

Then serve the output directory with any static server and open `game/index.html` in desktop Chrome. For local playtesting, `serve.ts` serves the game on `http://localhost:8080`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4hnkatg5&utm_source=github&utm_medium=readme&utm_campaign=solmar-bay) · AI agents build software for cash rewards</sub>
