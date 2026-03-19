import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = process.env.MAP_PRECOMPUTE_OUT_DIR || "tmp/map-artifacts";
const MANIFEST_PATH = process.env.MAP_PRECOMPUTE_MANIFEST || path.join(OUT_DIR, "manifest.json");
const FORCE_PREVIOUS = process.env.MAP_PRECOMPUTE_FORCE_PREVIOUS === "1";

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const selected = FORCE_PREVIOUS && manifest.previous ? manifest.previous : manifest.active;
  if (!selected?.artifactFile) throw new Error("Aucun artefact disponible dans le manifest.");
  const fullPath = path.join(OUT_DIR, selected.artifactFile);
  await fs.access(fullPath);
  console.log(
    JSON.stringify(
      {
        selected,
        fullPath,
        forcedPrevious: FORCE_PREVIOUS,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("[resolve-map-artifact] failed:", e);
  process.exit(1);
});

