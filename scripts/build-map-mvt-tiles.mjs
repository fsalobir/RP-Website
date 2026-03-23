import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";

const TMP_DIR = process.env.MAP_TILES_TMP_DIR || "tmp/map-tiles";
const PUBLIC_DIR = process.env.MAP_TILES_PUBLIC_DIR || "public/geo/tiles";
const Z_MIN = Number(process.env.MAP_TILES_Z_MIN ?? 0);
const Z_MAX = Number(process.env.MAP_TILES_Z_MAX ?? 6);

function hashJson(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
}

function layerTileIndex(fc, options = {}) {
  return geojsonvt(fc, {
    maxZoom: Z_MAX,
    indexMaxZoom: Math.min(6, Z_MAX),
    indexMaxPoints: 200000,
    tolerance: 3,
    extent: 4096,
    ...options,
  });
}

async function main() {
  const dirs = await fs.readdir(TMP_DIR, { withFileTypes: true });
  const candidates = dirs.filter((d) => d.isDirectory()).map((d) => path.join(TMP_DIR, d.name, "static-geo.json"));
  if (candidates.length === 0) throw new Error("Aucun snapshot static-geo.json trouvé");
  const latest = candidates.sort().at(-1);
  const payload = JSON.parse(await fs.readFile(latest, "utf8"));

  const indexes = {
    provinces_fill: layerTileIndex(payload.provincesFill),
    provinces_border: layerTileIndex(payload.provincesBorder),
    water_lakes: layerTileIndex(payload.waterLakes),
    water_rivers: layerTileIndex(payload.waterRivers),
  };

  const versionHash = hashJson(payload);
  const outBase = path.join(PUBLIC_DIR, versionHash);
  await fs.mkdir(outBase, { recursive: true });

  let tileCount = 0;
  for (let z = Z_MIN; z <= Z_MAX; z += 1) {
    const dim = 2 ** z;
    for (let x = 0; x < dim; x += 1) {
      for (let y = 0; y < dim; y += 1) {
        const tileLayers = {};
        for (const [layerId, index] of Object.entries(indexes)) {
          const tile = index.getTile(z, x, y);
          if (tile && tile.features.length > 0) {
            tileLayers[layerId] = tile;
          }
        }
        if (Object.keys(tileLayers).length === 0) continue;
        const pbf = Buffer.from(vtpbf.fromGeojsonVt(tileLayers));
        const outDir = path.join(outBase, String(z), String(x));
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(path.join(outDir, `${y}.mvt`), pbf);
        tileCount += 1;
      }
    }
  }

  const metadata = {
    versionHash,
    generatedAt: new Date().toISOString(),
    zMin: Z_MIN,
    zMax: Z_MAX,
    tileCount,
    sourceSnapshot: latest,
    layers: [
      { id: "provinces_fill", geometryType: "fill", sourceLayer: "provinces_fill" },
      { id: "provinces_border", geometryType: "line", sourceLayer: "provinces_border" },
      { id: "water_lakes", geometryType: "fill", sourceLayer: "water_lakes" },
      { id: "water_rivers", geometryType: "line", sourceLayer: "water_rivers" },
    ],
  };
  await fs.writeFile(path.join(outBase, "_meta.json"), JSON.stringify(metadata, null, 2), "utf8");
  console.log(`[build-map-mvt-tiles] version=${versionHash} tiles=${tileCount} z=${Z_MIN}..${Z_MAX}`);
}

main().catch((error) => {
  console.error("[build-map-mvt-tiles] failed:", error);
  process.exit(1);
});
