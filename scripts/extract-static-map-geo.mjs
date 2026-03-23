import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const OUT_DIR = process.env.MAP_TILES_TMP_DIR || "tmp/map-tiles";

function hashPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
}

function feature(properties, geometry) {
  return { type: "Feature", properties, geometry };
}

async function main() {
  const now = new Date().toISOString();
  const provincesFill = {
    type: "FeatureCollection",
    features: [
      feature(
        { id: "province-nord", name: "Province du Nord", realm_id: "realm-a", color_hex: "#1f2937", updated_at: now },
        { type: "Polygon", coordinates: [[[-20, 60], [20, 60], [20, 30], [-20, 30], [-20, 60]]] }
      ),
      feature(
        { id: "province-sud", name: "Province du Sud", realm_id: "realm-b", color_hex: "#334155", updated_at: now },
        { type: "Polygon", coordinates: [[[-20, 30], [20, 30], [20, 0], [-20, 0], [-20, 30]]] }
      ),
    ],
  };

  const provincesBorder = {
    type: "FeatureCollection",
    features: provincesFill.features.map((f) =>
      feature(
        { ...f.properties },
        { type: "LineString", coordinates: f.geometry.coordinates[0] }
      )
    ),
  };

  const waterLakes = {
    type: "FeatureCollection",
    features: [
      feature(
        { id: "lake-azure", name: "Lac d'Azur", realm_id: null, color_hex: "#1d4ed8", updated_at: now },
        { type: "Polygon", coordinates: [[[5, 45], [10, 45], [10, 40], [5, 40], [5, 45]]] }
      ),
    ],
  };

  const waterRivers = {
    type: "FeatureCollection",
    features: [
      feature(
        { id: "river-argent", name: "Rivière d'Argent", realm_id: null, color_hex: "#60a5fa", updated_at: now },
        { type: "LineString", coordinates: [[-15, 55], [-5, 42], [5, 34], [12, 22]] }
      ),
    ],
  };

  const payload = { generatedAt: now, provincesFill, provincesBorder, waterLakes, waterRivers };
  const versionHash = hashPayload(payload);
  const outDir = path.join(OUT_DIR, versionHash);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "static-geo.json");
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[extract-static-map-geo] version=${versionHash} output=${outPath}`);
}

main().catch((error) => {
  console.error("[extract-static-map-geo] failed:", error);
  process.exit(1);
});
