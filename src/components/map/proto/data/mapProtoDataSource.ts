import type { MapProtoCity, MapProtoDataset, MapProtoRoute, MapProtoRoutePoint } from "@/components/map/proto/data/mapProtoTypes";

type CityRow = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  icon_key?: string | null;
};

type RouteRow = {
  id: string;
  name: string;
  city_a_id?: string | null;
  city_b_id?: string | null;
};

type PathwayPointRow = {
  route_id: string;
  seq: number;
  lon: number;
  lat: number;
};

export type MapProtoDataMode = "mock" | "supabase";

export function getMapProtoMockDataset(): MapProtoDataset {
  const cities: MapProtoCity[] = [
    { id: "city-helion", name: "Helion", lon: 3.2, lat: 47.1, iconKey: "castle" },
    { id: "city-vaux", name: "Vaux-d'Or", lon: 4.4, lat: 46.2, iconKey: "city" },
    { id: "city-lisiere", name: "Lisière-Brume", lon: 2.3, lat: 45.5, iconKey: "village" },
  ];

  const routes: MapProtoRoute[] = [
    {
      id: "route-1",
      name: "Route Royale",
      cityAId: "city-helion",
      cityBId: "city-vaux",
      points: [
        { lon: 3.2, lat: 47.1 },
        { lon: 3.8, lat: 46.7 },
        { lon: 4.4, lat: 46.2 },
      ],
    },
  ];

  return { cities, routes };
}

export function buildMapProtoDatasetFromRows(
  cityRows: CityRow[],
  routeRows: RouteRow[],
  pathwayRows: PathwayPointRow[]
): MapProtoDataset {
  const cities: MapProtoCity[] = cityRows
    .filter((row) => Number.isFinite(row.lon) && Number.isFinite(row.lat))
    .map((row) => ({
      id: row.id,
      name: row.name,
      lon: row.lon,
      lat: row.lat,
      iconKey: row.icon_key ?? null,
    }));

  const cityById = new Map(cities.map((city) => [city.id, city] as const));
  const pointsByRouteId = new Map<string, MapProtoRoutePoint[]>();
  for (const point of pathwayRows) {
    if (!Number.isFinite(point.lon) || !Number.isFinite(point.lat)) continue;
    const list = pointsByRouteId.get(point.route_id) ?? [];
    list.push({ lon: point.lon, lat: point.lat });
    pointsByRouteId.set(point.route_id, list);
  }

  const routes: MapProtoRoute[] = routeRows.map((route) => {
    const centerPoints = pointsByRouteId.get(route.id) ?? [];
    const cityA = route.city_a_id ? cityById.get(route.city_a_id) : undefined;
    const cityB = route.city_b_id ? cityById.get(route.city_b_id) : undefined;
    const points: MapProtoRoutePoint[] = [];

    if (cityA) points.push({ lon: cityA.lon, lat: cityA.lat });
    points.push(...centerPoints);
    if (cityB) points.push({ lon: cityB.lon, lat: cityB.lat });

    return {
      id: route.id,
      name: route.name || "Route sans nom",
      cityAId: route.city_a_id ?? null,
      cityBId: route.city_b_id ?? null,
      points,
    };
  });

  return { cities, routes };
}
