import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = process.env.MAP_TILES_PUBLIC_DIR || "public/geo/tiles";
const MANIFEST_PATH = path.join(PUBLIC_DIR, "manifest.json");

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  if (!manifest?.previous) {
    throw new Error("Aucune version previous disponible pour rollback");
  }
  const next = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    active: manifest.previous,
    previous: manifest.active ?? null,
  };
  const tmpPath = path.join(PUBLIC_DIR, "manifest.rollback.next.json");
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmpPath, MANIFEST_PATH);
  console.log(`[rollback-map-tiles-manifest] active=${next.active.versionHash} previous=${next.previous?.versionHash ?? "none"}`);
}

main().catch((error) => {
  console.error("[rollback-map-tiles-manifest] failed:", error);
  process.exit(1);
});
