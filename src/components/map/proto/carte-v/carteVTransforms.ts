import type { Feature, FeatureCollection, LineString } from "geojson";
import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";

export type CarteVCity = {
  id: string;
  name: string;
  position: [number, number];
};

export type CarteVRoute = {
  id: string;
  name: string;
  path: Array<[number, number]>;
  labelPos: [number, number];
};

export function toCarteVData(dataset: MapProtoDataset): { cities: CarteVCity[]; routes: CarteVRoute[] } {
  const cities = dataset.cities.map((c) => ({ id: c.id, name: c.name, position: [c.lon, c.lat] as [number, number] }));
  const routes = dataset.routes
    .filter((r) => r.points.length >= 2)
    .map((r) => {
      const path = r.points.map((p) => [p.lon, p.lat] as [number, number]);
      const mid = path[Math.floor(path.length / 2)] ?? path[0];
      return { id: r.id, name: r.name, path, labelPos: mid };
    });
  return { cities, routes };
}

export function routesToGeoJson(routes: CarteVRoute[]): FeatureCollection<LineString, { id: string; name: string }> {
  const features: Feature<LineString, { id: string; name: string }>[] = routes.map((r) => ({
    type: "Feature",
    properties: { id: r.id, name: r.name },
    geometry: { type: "LineString", coordinates: r.path.map((p) => [p[0], p[1]]) },
  }));
  return { type: "FeatureCollection", features };
}
