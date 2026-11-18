// Solmar Bay v2 (gta6-01) — kit entrypoint. Fresh implementation from the
// prose contract: copies game/ + screenshots/ into the output dir and writes
// /output/dossier.json via the kit's buildDossier. Node 22 stdlib only.
// Deterministic: same inputs -> byte-identical dossier.json.
import { buildDossier } from "./vendor/makefun-game.ts";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const root = new URL(".", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
for (const d of ["game", "screenshots"]) {
  const src = join(root, d);
  if (existsSync(src)) cpSync(src, join(out, d), { recursive: true });
}
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
// buildDossier returns canonical JSON *bytes* (Uint8Array), not a string.
const dossierText = Buffer.from(dossier).toString("utf8");
writeFileSync(join(out, "dossier.json"), dossier);
const parsed = JSON.parse(dossierText);
const bytes = Buffer.byteLength(parsed.text ?? "", "utf8"); // source-text bytes
const shots = parsed.images?.length ?? 0;
console.log(`dossier: ${join(out, "dossier.json")} (${bytes} source-text bytes, ${shots} screenshots)`);
if (bytes > 161000) console.warn(`WARN: dossier ${bytes} B exceeds the 161,000 B rebuild target`);
