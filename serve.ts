// serve.ts — tiny static dev server for local playtesting only.
// Serves game/ + screenshots/ from the repo root. Not part of the dossier.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const port = Number(process.env.PORT || 8080);
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
};
createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url || "/", "http://x").pathname);
  const path = url === "/" ? "game/index.html" : url.replace(/^\//, "");
  if (path.includes("..")) { res.writeHead(400); res.end("bad path"); return; }
  try {
    const data = await readFile(join(root, path));
    res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(port, () => console.log(`Solmar Bay dev server: http://localhost:${port}/`));
