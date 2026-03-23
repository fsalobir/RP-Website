import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = process.env.MAP_TILES_PUBLIC_DIR || "public/geo/tiles";
const MANIFEST_PATH = path.join(PUBLIC_DIR, "manifest.json");
const PREVIOUS_PATH = path.join(PUBLIC_DIR, "manifest.previous.json");

async function main() {
  const entries = await fs.readdir(PUBLIC_DIR, { withFileTypes: true });
  const versions = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  if (versions.length === 0) throw new Error("Aucune version de tuiles à publier");
  const versionHash = versions.at(-1);
  const metaPath = path.join(PUBLIC_DIR, versionHash, "_meta.json");
  const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));

  let previous = null;
  try {
    const current = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
    previous = current?.active ?? null;
  } catch {
    // first publish
  }

  const manifest = {
    version: 2,
    schemaVersion: 2,
    generatedAt: meta.generatedAt,
    entries: [],
    active: {
      versionHash,
      generatedAt: meta.generatedAt,
      tileUrlTemplate: `/geo/tiles/${versionHash}/{z}/{x}/{y}.mvt`,
    },
    previous,
    layers: meta.layers,
  };

  const tmpPath = path.join(PUBLIC_DIR, "manifest.next.json");
  await fs.writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf8");
  if (previous) {
    await fs.writeFile(PREVIOUS_PATH, JSON.stringify(previous, null, 2), "utf8");
  }
  await fs.rename(tmpPath, MANIFEST_PATH);
  console.log(`[publish-map-tiles-manifest] active=${versionHash} previous=${previous?.versionHash ?? "none"}`);
}

main().catch((error) => {
  console.error("[publish-map-tiles-manifest] failed:", error);
  process.exit(1);
});
