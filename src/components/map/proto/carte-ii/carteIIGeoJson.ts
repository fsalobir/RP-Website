import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { MapProtoCity, MapProtoDataset, MapProtoRoute } from "@/components/map/proto/data/mapProtoTypes";

type CityProps = {
  id: string;
  name: string;
  iconKey: string | null;
};

type RouteProps = {
  id: string;
  name: string;
  tier: "local" | "regional" | "national";
};

type RouteLabelProps = {
  routeId: string;
  name: string;
};

export function buildCitiesGeoJson(cities: MapProtoCity[]): FeatureCollection<Point, CityProps> {
  return {
    type: "FeatureCollection",
    features: cities
      .filter((city) => Number.isFinite(city.lon) && Number.isFinite(city.lat))
      .map((city) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [city.lon, city.lat],
        },
        properties: {
          id: city.id,
          name: city.name,
          iconKey: city.iconKey ?? null,
        },
      })),
  };
}

function normalizeTier(route: MapProtoRoute): "local" | "regional" | "national" {
  const raw = String((route as { tier?: unknown }).tier ?? "local");
  if (raw === "national" || raw === "regional") return raw;
  return "local";
}

export function buildRoutesGeoJson(routes: MapProtoRoute[]): FeatureCollection<LineString, RouteProps> {
  return {
    type: "FeatureCollection",
    features: routes
      .filter((route) => route.points.length >= 2)
      .map((route) => ({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: route.points.map((point) => [point.lon, point.lat]),
        },
        properties: {
          id: route.id,
          name: route.name,
          tier: normalizeTier(route),
        },
      })),
  };
}

function routeMidPoint(route: MapProtoRoute): [number, number] | null {
  if (route.points.length < 2) return null;
  const points = route.points;
  const totalSegments: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const seg = Math.hypot(b.lon - a.lon, b.lat - a.lat);
    total += seg;
    totalSegments.push(seg);
  }
  if (total <= 0) {
    const mid = points[Math.floor(points.length / 2)];
    return [mid.lon, mid.lat];
  }
  const target = total / 2;
  let acc = 0;
  for (let i = 0; i < totalSegments.length; i += 1) {
    const seg = totalSegments[i];
    const a = points[i];
    const b = points[i + 1];
    if (acc + seg >= target) {
      const local = (target - acc) / Math.max(seg, 0.0000001);
      const lon = a.lon + (b.lon - a.lon) * local;
      const lat = a.lat + (b.lat - a.lat) * local;
      return [lon, lat];
    }
    acc += seg;
  }
  const last = points[points.length - 1];
  return [last.lon, last.lat];
}

export function buildRouteLabelsGeoJson(routes: MapProtoRoute[]): FeatureCollection<Point, RouteLabelProps> {
  const features: Feature<Point, RouteLabelProps>[] = [];
  for (const route of routes) {
    const mid = routeMidPoint(route);
    if (!mid) continue;
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: mid,
      },
      properties: {
        routeId: route.id,
        name: route.name,
      },
    });
  }
  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildGeoJsonBundle(dataset: MapProtoDataset) {
  return {
    cities: buildCitiesGeoJson(dataset.cities),
    routes: buildRoutesGeoJson(dataset.routes),
    routeLabels: buildRouteLabelsGeoJson(dataset.routes),
  };
}
