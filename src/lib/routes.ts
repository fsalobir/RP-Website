/**
 * Utilitaires pour les routes entre villes : filtrage des villes avec coords valides,
 * distance géographique, distance réseau (plus court chemin), génération de tracé sinueux,
 * et tracé par la terre (détour évitant la mer).
 */

import * as turf from "@turf/turf";

/** GeoJSON FeatureCollection de polygones (régions terre). Compatible avec le résultat de topojson-client feature(). */
export type LandFeatureCollection = {
  type: "FeatureCollection";
  features: Array<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>;
};

export type RouteTier = "local" | "regional" | "national";

export const ROUTE_TIERS: RouteTier[] = ["local", "regional", "national"];

export const ROUTE_TIER_LABELS: Record<RouteTier, string> = {
  local: "Locale",
  regional: "Régionale",
  national: "Nationale",
};

/** Ville minimale avec id et coords (pour filtrage et distance). */
export type CityWithCoords = {
  id: string;
  lon: number;
  lat: number;
  name?: string;
};

/**
 * Filtre les villes ayant des coordonnées valides (lon/lat finis).
 * À utiliser dans l'UI des routes pour ne proposer que des villes positionnables.
 */
export function filterCitiesWithValidCoords<T extends { lon: number; lat: number }>(
  cities: T[] | null | undefined
): T[] {
  if (!cities?.length) return [];
  return cities.filter((c) => Number.isFinite(c.lon) && Number.isFinite(c.lat));
}

/**
 * Distance géographique en km entre deux points (lon, lat) — formule Haversine.
 * Utilise @turf/distance pour cohérence avec le reste du projet.
 */
export function geoDistanceKm(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number }
): number {
  const from = turf.point([a.lon, a.lat]);
  const to = turf.point([b.lon, b.lat]);
  return turf.distance(from, to, { units: "kilometers" });
}

/** Route avec extrémités (city_a_id, city_b_id) et distance_km. */
export type RouteEdge = {
  id: string;
  city_a_id: string;
  city_b_id: string;
  distance_km: number;
};

/**
 * Distance totale le long des routes (plus court chemin) entre deux villes, en km.
 * Retourne null si aucun chemin n'existe.
 */
export function getRoadDistanceBetweenCities(
  cityIdA: string,
  cityIdB: string,
  routes: RouteEdge[]
): number | null {
  if (cityIdA === cityIdB) return 0;
  if (!routes.length) return null;

  const graph = new Map<string, Array<{ neighbor: string; weight: number }>>();
  for (const r of routes) {
    const a = r.city_a_id;
    const b = r.city_b_id;
    const w = Number(r.distance_km) || 0;
    if (!graph.has(a)) graph.set(a, []);
    graph.get(a)!.push({ neighbor: b, weight: w });
    if (!graph.has(b)) graph.set(b, []);
    graph.get(b)!.push({ neighbor: a, weight: w });
  }

  const dist = new Map<string, number>();
  const heap: Array<{ id: string; d: number }> = [{ id: cityIdA, d: 0 }];
  dist.set(cityIdA, 0);

  while (heap.length > 0) {
    heap.sort((x, y) => x.d - y.d);
    const { id: u, d: du } = heap.shift()!;
    if (u === cityIdB) return du;
    const cur = dist.get(u);
    if (cur !== undefined && du > cur) continue;

    for (const { neighbor: v, weight: w } of graph.get(u) ?? []) {
      const alt = du + w;
      const prev = dist.get(v);
      if (prev === undefined || alt < prev) {
        dist.set(v, alt);
        heap.push({ id: v, d: alt });
      }
    }
  }

  return null;
}

/**
 * Génère une polyligne entre A et B qui reste sur la terre (régions du GeoJSON).
 * Pathfinding sur le graphe d’adjacence des régions (BFS), puis A → centroïdes intermédiaires → B.
 * Retourne null si une extrémité est en mer ou aucun chemin n’existe.
 */
export function generateLandPath(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
  landGeoJson: LandFeatureCollection | null | undefined
): Array<[number, number]> | null {
  if (!landGeoJson?.features?.length) return null;

  const pointA = turf.point([a.lon, a.lat]);
  const pointB = turf.point([b.lon, b.lat]);
  const features = landGeoJson.features;

  let idxA = -1;
  let idxB = -1;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (f?.geometry && turf.booleanPointInPolygon(pointA, f)) idxA = i;
    if (f?.geometry && turf.booleanPointInPolygon(pointB, f)) idxB = i;
  }
  if (idxA === -1 || idxB === -1) return null;
  if (idxA === idxB) return [[a.lon, a.lat], [b.lon, b.lat]];

  const adj = new Map<number, number[]>();
  for (let i = 0; i < features.length; i++) adj.set(i, []);
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const fi = features[i];
      const fj = features[j];
      if (fi?.geometry && fj?.geometry && turf.booleanTouches(fi, fj)) {
        adj.get(i)!.push(j);
        adj.get(j)!.push(i);
      }
    }
  }

  const queue: number[] = [idxA];
  const parent = new Map<number, number>();
  parent.set(idxA, -1);
  while (queue.length > 0) {
    const u = queue.shift()!;
    if (u === idxB) break;
    for (const v of adj.get(u) ?? []) {
      if (!parent.has(v)) {
        parent.set(v, u);
        queue.push(v);
      }
    }
  }
  if (!parent.has(idxB)) return null;

  const pathIndices: number[] = [];
  let cur: number = idxB;
  while (cur !== -1) {
    pathIndices.push(cur);
    cur = parent.get(cur) ?? -1;
  }
  pathIndices.reverse();

  const path: Array<[number, number]> = [[a.lon, a.lat]];
  for (let i = 1; i < pathIndices.length - 1; i++) {
    const feat = features[pathIndices[i]];
    if (feat?.geometry) {
      const c = turf.centroid(feat);
      const coords = c.geometry.coordinates;
      path.push([coords[0], coords[1]]);
    }
  }
  path.push([b.lon, b.lat]);
  return path;
}

/**
 * Génère une polyligne sinueuse entre A et B en coordonnées géo [lon, lat][].
 * Tier : local = très sinueux, regional = modéré, national = quasi droit.
 * seed optionnel pour un tracé déterministe (ex. route.attrs.seed).
 * sinuosityScale optionnel (0–2) : module l'amplitude (1 = défaut, 0 = droit, 2 = très sinueux).
 */
export function generateSinuousPath(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
  tier: RouteTier,
  seed?: number,
  sinuosityScale?: number
): Array<[number, number]> {
  const numPoints = tier === "local" ? 24 : tier === "regional" ? 16 : 10;
  const baseAmplitude = tier === "local" ? 0.015 : tier === "regional" ? 0.008 : 0.003;
  const frequency = tier === "local" ? 4 : tier === "regional" ? 2.5 : 1.2;
  const s = sinuosityScale;
  const scale = typeof s === "number" && Number.isFinite(s) ? Math.max(0, Math.min(5, s)) : 1;
  const amplitude = baseAmplitude * scale;

  const points: Array<[number, number]> = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lon = a.lon + (b.lon - a.lon) * t;
    const lat = a.lat + (b.lat - a.lat) * t;

    const perpLon = -(b.lat - a.lat);
    const perpLat = b.lon - a.lon;
    const len = Math.hypot(perpLon, perpLat) || 1;
    const rng = seededRandom((seed ?? 0) + i * 1000);
    const noise = (rng() * 2 - 1) * Math.sin(t * Math.PI * frequency) * amplitude;
    points.push([lon + (perpLon / len) * noise, lat + (perpLat / len) * noise]);
  }

  return points;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Applique la sinuosité à une polyligne « terre » (waypoints) en faisant sinuer chaque segment.
 * Chaque segment [points[i], points[i+1]] est remplacé par generateSinuousPath ; les jonctions ne sont pas dupliquées.
 */
export function smoothLandPathWithSinuosity(
  points: Array<[number, number]>,
  tier: RouteTier,
  seed: number,
  sinuosityScale: number
): Array<[number, number]> {
  if (points.length < 2) return points;
  if (points.length === 2) {
    return generateSinuousPath(
      { lon: points[0][0], lat: points[0][1] },
      { lon: points[1][0], lat: points[1][1] },
      tier,
      seed,
      sinuosityScale
    );
  }
  const result: Array<[number, number]> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = { lon: points[i][0], lat: points[i][1] };
    const b = { lon: points[i + 1][0], lat: points[i + 1][1] };
    const segment = generateSinuousPath(a, b, tier, seed + i, sinuosityScale);
    if (i === 0) {
      result.push(...segment);
    } else {
      for (let j = 1; j < segment.length; j++) result.push(segment[j]);
    }
  }
  return result;
}
