/**
 * Génère un TopoJSON "hydro" (lacs + rivières) pour une surcouche décorative.
 *
 * Sources (Natural Earth, 50m, GeoJSON) :
 * - scripts/geo/ne_50m_lakes.geojson
 * - scripts/geo/ne_50m_rivers_lake_centerlines_scale_rank.geojson
 *
 * Output :
 * - public/geo/hydro.topo.json
 */
/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");
const { topology } = require("topojson-server");
const { presimplify, simplify } = require("topojson-simplify");

const ROOT = path.resolve(__dirname, "..");
const INPUT_LAKES = path.join(ROOT, "scripts", "geo", "ne_50m_lakes.geojson");
const INPUT_RIVERS = path.join(ROOT, "scripts", "geo", "ne_50m_rivers_lake_centerlines_scale_rank.geojson");
const OUTPUT = path.join(ROOT, "public", "geo", "hydro.topo.json");

function readGeoJsonOrDie(p) {
  if (!fs.existsSync(p)) {
    console.error(`Fichier introuvable: ${p}`);
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!j || j.type !== "FeatureCollection" || !Array.isArray(j.features)) {
    console.error(`GeoJSON invalide: ${p} (FeatureCollection attendu)`);
    process.exit(1);
  }
  return j;
}

function stripProps(fc, kind) {
  return {
    type: "FeatureCollection",
    features: fc.features
      .filter((f) => f && f.type === "Feature" && f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          kind,
          // Quelques champs utiles si un jour on veut filtrer/pondérer
          scalerank: f.properties?.scalerank ?? null,
          name: f.properties?.name ?? null,
        },
      })),
  };
}

function main() {
  const lakes = stripProps(readGeoJsonOrDie(INPUT_LAKES), "lake");
  const rivers = stripProps(readGeoJsonOrDie(INPUT_RIVERS), "river");

  // Quantization un peu élevée pour réduire le poids tout en gardant des courbes propres.
  let topo = topology({ lakes, rivers }, 4e4);
  topo = presimplify(topo);
  // Simplification conservatrice (les rivières sont des lignes -> trop agressif = disparition).
  topo = simplify(topo, 8e-5);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(topo));
  console.log(`OK: ${OUTPUT} (lakes=${lakes.features.length}, rivers=${rivers.features.length})`);
}

main();

