import { getRelationFromMap } from "./relations";
import type { CountryRelationRow } from "./relations";

export interface MapRegionRow {
  id: string;
  name: string;
  slug: string;
  geometry: unknown;
  sort_order: number;
}

export interface MapRegionCountryRow {
  region_id: string;
  country_id: string;
}

export type GeoJSONFeature = {
  type: "Feature";
  id?: string;
  properties: { id: string; name: string };
  geometry: unknown;
};

export type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

/** Feature monde : chaque pays a regionId si présent en base, sinon null. */
export type WorldGeoJSONFeature = {
  type: "Feature";
  id?: string | number;
  properties: { regionId: string | null; countryId: string | null; name: string };
  geometry: unknown;
};

export type WorldGeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: WorldGeoJSONFeature[];
};

/** Construit un FeatureCollection GeoJSON à partir des lignes map_regions. */
export function buildRegionsGeoJSON(regions: MapRegionRow[]): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = regions.map((r) => ({
    type: "Feature",
    id: r.id,
    properties: { id: r.id, name: r.name },
    geometry: r.geometry,
  }));
  return { type: "FeatureCollection", features };
}

/** Calcule la valeur de relation entre deux régions (moyenne des relations pays). */
export function getRegionRelationValue(
  relationMap: Map<string, number>,
  regionACountryIds: string[],
  regionBCountryIds: string[]
): number {
  if (regionACountryIds.length === 0 || regionBCountryIds.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const a of regionACountryIds) {
    for (const b of regionBCountryIds) {
      if (a === b) continue;
      sum += getRelationFromMap(relationMap, a, b);
      count++;
    }
  }
  return count === 0 ? 0 : Math.round(sum / count);
}

/** Construit une map region_id -> country_id[]. */
export function buildRegionToCountryIds(
  rows: MapRegionCountryRow[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.region_id) ?? [];
    list.push(r.country_id);
    map.set(r.region_id, list);
  }
  return map;
}

/** Précalcule toutes les paires (regionA, regionB) -> valeur pour affichage carte. */
export function buildRegionRelationMap(
  regionIds: string[],
  regionToCountryIds: Map<string, string[]>,
  relationRows: CountryRelationRow[]
): Map<string, number> {
  const countryMap = new Map<string, number>();
  for (const row of relationRows) {
    countryMap.set(`${row.country_a_id}|${row.country_b_id}`, row.value);
  }
  const out = new Map<string, number>();
  for (const idA of regionIds) {
    const countriesA = regionToCountryIds.get(idA) ?? [];
    for (const idB of regionIds) {
      if (idA === idB) {
        out.set(`${idA}|${idB}`, 0);
        continue;
      }
      const countriesB = regionToCountryIds.get(idB) ?? [];
      const val = getRegionRelationValue(countryMap, countriesA, countriesB);
      const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
      out.set(key, val);
    }
  }
  return out;
}

/** Récupère la valeur entre deux régions depuis la map pré-calculée. */
export function getRegionRelationFromMap(
  map: Map<string, number>,
  regionIdA: string,
  regionIdB: string
): number {
  if (regionIdA === regionIdB) return 0;
  const key = regionIdA < regionIdB ? `${regionIdA}|${regionIdB}` : `${regionIdB}|${regionIdA}`;
  return map.get(key) ?? 0;
}
