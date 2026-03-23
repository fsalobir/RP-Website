import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = process.env.MAP_TILES_PUBLIC_DIR || "public/geo/tiles";

async function main() {
  const entries = await fs.readdir(PUBLIC_DIR, { withFileTypes: true });
  const versions = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  if (versions.length === 0) throw new Error("Aucune version de tuiles trouvée");
  const activeVersion = versions.at(-1);
  const meta = JSON.parse(await fs.readFile(path.join(PUBLIC_DIR, activeVersion, "_meta.json"), "utf8"));
  if (!Array.isArray(meta.layers) || meta.layers.length === 0) {
    throw new Error("Meta sans définition de couches MVT");
  }
  if (!Number.isFinite(meta.tileCount) || meta.tileCount <= 0) {
    throw new Error("Meta avec tileCount invalide");
  }
  console.log(`[precompute-map-tiles-check] ok version=${activeVersion} tiles=${meta.tileCount}`);
}

main().catch((error) => {
  console.error("[precompute-map-tiles-check] failed:", error);
  process.exit(1);
});
