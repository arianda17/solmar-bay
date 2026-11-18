// main.ts — Solmar Bay kit entrypoint.
// Copies game/ and screenshots/ from this repository into the output
// directory, then writes dossier.json with buildDossier from the kit's
// vendor/makefun-game.ts. Two runs produce byte-identical output:
// files are copied in sorted order, no timestamps are recorded, and no
// absolute paths appear anywhere in the output. Node 22 stdlib only.
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

async function listFiles(dir, base) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = base ? base + "/" + entry.name : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listFiles(full, rel)));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

async function copyTree(srcDir, destDir) {
  await mkdir(destDir, { recursive: true });
  const files = await listFiles(srcDir, "");
  for (const rel of files) {
    const src = join(srcDir, rel);
    const dest = join(destDir, rel);
    const parent = dirname(dest);
    if (parent !== destDir) await mkdir(parent, { recursive: true });
    await cp(src, dest);
  }
  return files.length;
}

async function main() {
  const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || "/output");
  const repoRoot = dirname(fileURLToPath(import.meta.url));
  await mkdir(outputDir, { recursive: true });
  const gameCount = await copyTree(join(repoRoot, "game"), join(outputDir, "game"));
  const shotsCount = await copyTree(join(repoRoot, "screenshots"), join(outputDir, "screenshots"));
  const dossier = await buildDossier(outputDir, CAPS);
  const bytes = typeof dossier === "string" ? Buffer.from(dossier, "utf8") : Buffer.from(dossier);
  await writeFile(join(outputDir, "dossier.json"), bytes);
  console.log("Wrote " + outputDir + "/dossier.json (" + bytes.length + " bytes, game files: " + gameCount + ", screenshots: " + shotsCount + ")");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
