/**
 * Construit un GeoJSON monde complet : une feature par pays world-atlas, avec
 * regionId (id de notre région si le pays est en base) ou null. Pas de fusion
 * des géométries (union désactivée : évite le bug d'inversion océan/terre).
 * À utiliser côté serveur uniquement.
 */

import { createRequire } from "module";
import { slugToIso2, ISO2_TO_NUMERIC } from "./mapCountryUtils";
import type { MapRegionRow, MapRegionCountryRow } from "./mapRegions";
import type { WorldGeoJSONFeatureCollection, WorldGeoJSONFeature } from "./mapRegions";

const require = createRequire(import.meta.url);

/** Pays avec au minimum id et slug (pour résoudre l'id numérique world-atlas). */
export type CountrySlugRow = { id: string; slug: string };

function loadTopology(): { objects: { countries: unknown } } | null {
  const path = require("path") as { join: (...a: string[]) => string };
  const fs = require("fs") as { readFileSync: (p: string, enc: string) => string; existsSync: (p: string) => boolean };

  try {
    return require("world-atlas/countries-110m.json");
  } catch {
    try {
      const p = require.resolve("world-atlas/countries-110m.json");
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      try {
        const p = path.join(process.cwd(), "node_modules", "world-atlas", "countries-110m.json");
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch {
        // ignore
      }
      return null;
    }
  }
}

export function buildWorldGeoJSONWithRegionIds(
  regions: MapRegionRow[],
  regionNames: Record<string, string>,
  regionCountries: MapRegionCountryRow[],
  countries: CountrySlugRow[],
  /** Régions sans pays associé (géométrie propre) : ajoutées comme features cliquables. */
  orphanRegions: MapRegionRow[] = []
): WorldGeoJSONFeatureCollection {
  const topology = loadTopology();
  if (!topology?.objects?.countries) return { type: "FeatureCollection", features: [] };

  const { feature } = require("topojson-client") as { feature: (topo: unknown, obj: unknown) => { features: Array<{ id: number; geometry: unknown; properties?: Record<string, unknown> }> } };
  const fc = feature(topology, topology.objects.countries);
  if (!fc?.features?.length && orphanRegions.length === 0) return { type: "FeatureCollection", features: [] };

  const countryIdToSlug = new Map<string, string>();
  for (const c of countries) {
    countryIdToSlug.set(c.id, c.slug);
  }

  const numericToRegionId = new Map<number, string>();
  const numericToCountryId = new Map<number, string>();
  for (const link of regionCountries) {
    const slug = countryIdToSlug.get(link.country_id);
    if (!slug) continue;
    const iso2 = slugToIso2(slug);
    if (!iso2) continue;
    const numeric = ISO2_TO_NUMERIC[iso2.toLowerCase()];
    if (numeric == null) continue;
    numericToRegionId.set(numeric, link.region_id);
    numericToCountryId.set(numeric, link.country_id);
  }

  const byRegionId = new Map<string, WorldGeoJSONFeature[]>();
  const unassigned: WorldGeoJSONFeature[] = [];

  for (const f of fc.features) {
    const numeric = f.id != null ? Number(f.id) : null;
    const regionId = numeric != null ? (numericToRegionId.get(numeric) ?? null) : null;
    const countryId = numeric != null ? (numericToCountryId.get(numeric) ?? null) : null;
    const name = regionId ? (regionNames[regionId] ?? "") : (f.properties?.name as string) ?? "";
    const feat: WorldGeoJSONFeature = {
      type: "Feature",
      id: f.id,
      properties: { regionId, countryId, name },
      geometry: f.geometry,
    };
    if (regionId != null) {
      const list = byRegionId.get(regionId) ?? [];
      list.push(feat);
      byRegionId.set(regionId, list);
    } else {
      unassigned.push(feat);
    }
  }

  const regionFeatures = oneFeaturePerCountry(byRegionId, regionNames);
  const orphanFeatures: WorldGeoJSONFeature[] = orphanRegions.map((r) => ({
    type: "Feature" as const,
    id: `orphan-${r.id}`,
    properties: { regionId: r.id, countryId: null, name: regionNames[r.id] ?? r.name },
    geometry: r.geometry,
  }));

  const regionIdsInAtlas = new Set(numericToRegionId.values());
  const regionIdToGeometry = new Map<string, unknown>();
  for (const r of regions) {
    regionIdToGeometry.set(r.id, r.geometry);
  }
  const linkedButNotInAtlas: WorldGeoJSONFeature[] = [];
  for (const link of regionCountries) {
    if (regionIdsInAtlas.has(link.region_id)) continue;
    const geom = regionIdToGeometry.get(link.region_id);
    if (!geom) continue;
    linkedButNotInAtlas.push({
      type: "Feature",
      id: `linked-${link.region_id}`,
      properties: { regionId: link.region_id, countryId: link.country_id, name: regionNames[link.region_id] ?? "" },
      geometry: geom,
    });
  }

  const features = [...regionFeatures, ...orphanFeatures, ...linkedButNotInAtlas, ...unassigned];
  return { type: "FeatureCollection", features };
}

/** Une feature par pays (pas de fusion : évite le bug d'inversion océan). */
function oneFeaturePerCountry(
  byRegionId: Map<string, WorldGeoJSONFeature[]>,
  regionNames: Record<string, string>
): WorldGeoJSONFeature[] {
  const result: WorldGeoJSONFeature[] = [];
  byRegionId.forEach((list, regionId) => {
    const name = regionNames[regionId] ?? "";
    list.forEach((f) => result.push({ type: "Feature", id: f.id, properties: { regionId, countryId: f.properties.countryId ?? null, name }, geometry: f.geometry }));
  });
  return result;
}
