import { geoCentroid } from "d3-geo";
import { area as turfArea, booleanTouches as turfBooleanTouches, pointOnFeature as turfPointOnFeature } from "@turf/turf";
import type { LandFeatureCollection } from "@/lib/routes";

type ProvinceLite = { id: string; realm_id: string };
type RealmLite = { id: string; name: string; capital_city_id?: string | null };
type CityLite = { id: string; province_id: string; lon: number; lat: number };

export type RealmLabelAnchor = {
  realmId: string;
  name: string;
  lon: number;
  lat: number;
  angleDeg: number;
  usedNationalCapital: boolean;
};

const MAX_COMPONENT_TOUCHES_FEATURES = 160;

function getRegionIdFromProps(p: Record<string, unknown>): string | null {
  const direct = p.regionId ?? p.id ?? p.iso_3166_2 ?? p.name;
  if (typeof direct === "string" && direct.trim().length > 0) return direct.trim();
  return null;
}

function collectLonLatFromGeometry(geometry: unknown): Array<[number, number]> {
  if (!geometry || typeof geometry !== "object") return [];
  const type = String((geometry as any).type ?? "");
  const coords = (geometry as any).coordinates;
  if (!Array.isArray(coords)) return [];
  const out: Array<[number, number]> = [];
  const pushIfPoint = (v: unknown) => {
    if (Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])) {
      out.push([Number(v[0]), Number(v[1])]);
    }
  };
  if (type === "Polygon") {
    for (const ring of coords) if (Array.isArray(ring)) for (const p of ring) pushIfPoint(p);
    return out;
  }
  if (type === "MultiPolygon") {
    for (const poly of coords) if (Array.isArray(poly)) for (const ring of poly) if (Array.isArray(ring)) for (const p of ring) pushIfPoint(p);
    return out;
  }
  if (type === "LineString") {
    for (const p of coords) pushIfPoint(p);
    return out;
  }
  return out;
}

function computePrincipalAngleDeg(points: Array<[number, number]>): number {
  if (points.length < 3) return 0;
  let meanX = 0;
  let meanY = 0;
  for (const [x, y] of points) {
    meanX += x;
    meanY += y;
  }
  meanX /= points.length;
  meanY /= points.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    const dx = x - meanX;
    const dy = y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return (theta * 180) / Math.PI;
}

function getWeightedCentroid(features: any[]): [number, number] | null {
  let sumArea = 0;
  let lon = 0;
  let lat = 0;
  for (const f of features) {
    let area = 0;
    try {
      area = Number(turfArea(f as any)) || 0;
    } catch {
      area = 0;
    }
    if (area <= 0) continue;
    const c = geoCentroid(f as any) as [number, number];
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    sumArea += area;
    lon += c[0] * area;
    lat += c[1] * area;
  }
  if (sumArea <= 0) return null;
  return [lon / sumArea, lat / sumArea];
}

function getConnectedComponents(features: any[], indices: number[]): number[][] {
  const n = indices.length;
  const adj = new Map<number, number[]>();
  for (let i = 0; i < n; i++) adj.set(i, []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = features[indices[i]];
      const b = features[indices[j]];
      if (!a?.geometry || !b?.geometry) continue;
      if (turfBooleanTouches(a as any, b as any)) {
        adj.get(i)!.push(j);
        adj.get(j)!.push(i);
      }
    }
  }

  const seen = new Array<boolean>(n).fill(false);
  const components: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = true;
    while (stack.length > 0) {
      const u = stack.pop()!;
      comp.push(indices[u]);
      for (const v of adj.get(u) ?? []) {
        if (!seen[v]) {
          seen[v] = true;
          stack.push(v);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

export function computeRealmLabelAnchors(args: {
  landGeoJson: LandFeatureCollection | null | undefined;
  provinceByRegionId: Map<string, ProvinceLite>;
  realmById: Map<string, RealmLite>;
  cityById?: Map<string, CityLite>;
}): RealmLabelAnchor[] {
  const { landGeoJson, provinceByRegionId, realmById, cityById } = args;
  if (!landGeoJson?.features?.length) return [];

  const features = landGeoJson.features as any[];
  const byRealm = new Map<string, number[]>();
  const featureProvinceByIndex = new Map<number, string>();
  for (let i = 0; i < features.length; i++) {
    const props = (features[i]?.properties ?? {}) as Record<string, unknown>;
    const regionId = getRegionIdFromProps(props);
    if (!regionId) continue;
    const province = provinceByRegionId.get(regionId);
    if (!province?.realm_id) continue;
    if (!byRealm.has(province.realm_id)) byRealm.set(province.realm_id, []);
    byRealm.get(province.realm_id)!.push(i);
    featureProvinceByIndex.set(i, province.id);
  }

  const out: RealmLabelAnchor[] = [];
  for (const [realmId, indices] of byRealm.entries()) {
    const realm = realmById.get(realmId);
    if (!realm || indices.length === 0) continue;

    let selectedIndices: number[] = [];
    if (indices.length <= MAX_COMPONENT_TOUCHES_FEATURES) {
      const comps = getConnectedComponents(features, indices);
      let bestArea = -1;
      for (const comp of comps) {
        let areaSum = 0;
        for (const idx of comp) {
          try {
            areaSum += Number(turfArea(features[idx] as any)) || 0;
          } catch {
            // ignore malformed geometry
          }
        }
        if (areaSum > bestArea) {
          bestArea = areaSum;
          selectedIndices = comp;
        }
      }
    } else {
      selectedIndices = indices.slice();
    }

    if (selectedIndices.length === 0) continue;
    const selectedFeatures = selectedIndices.map((idx) => features[idx]).filter(Boolean);

    const fc = { type: "FeatureCollection", features: selectedFeatures } as any;
    const centroidWeighted = getWeightedCentroid(selectedFeatures);
    let lonLat = centroidWeighted;
    try {
      const point = turfPointOnFeature(fc) as any;
      const c = point?.geometry?.coordinates;
      if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        lonLat = [Number(c[0]), Number(c[1])];
      }
    } catch {
      // fallback on weighted centroid
    }
    if (!lonLat) continue;

    let usedNationalCapital = false;
    const capitalId = realm.capital_city_id ?? null;
    const capital = capitalId && cityById ? cityById.get(capitalId) : null;
    if (capital && Number.isFinite(capital.lon) && Number.isFinite(capital.lat)) {
      let capitalInsideMainComponent = false;
      for (const idx of selectedIndices) {
        const provinceId = featureProvinceByIndex.get(idx);
        if (provinceId && provinceId === capital.province_id) {
          capitalInsideMainComponent = true;
          break;
        }
      }
      if (capitalInsideMainComponent) {
        lonLat = [capital.lon, capital.lat];
        usedNationalCapital = true;
      }
    }

    const points = selectedFeatures.flatMap((f) => collectLonLatFromGeometry((f as any)?.geometry));
    const angleDeg = computePrincipalAngleDeg(points);
    out.push({
      realmId,
      name: realm.name,
      lon: lonLat[0],
      lat: lonLat[1],
      angleDeg,
      usedNationalCapital,
    });
  }

  return out;
}
