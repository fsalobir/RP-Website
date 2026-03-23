import type { MapProtoCity, MapProtoRoute } from "@/components/map/proto/data/mapProtoTypes";

type ScreenProjector = (lon: number, lat: number) => { x: number; y: number };

export function pickNearestCityId(
  cities: MapProtoCity[],
  projectToScreen: ScreenProjector,
  pointerX: number,
  pointerY: number,
  maxDistancePx = 20
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const city of cities) {
    const p = projectToScreen(city.lon, city.lat);
    const d = Math.hypot(p.x - pointerX, p.y - pointerY);
    if (d < bestDistance) {
      bestDistance = d;
      bestId = city.id;
    }
  }
  return bestDistance <= maxDistancePx ? bestId : null;
}

export function pickNearestRouteId(
  routes: MapProtoRoute[],
  projectToScreen: ScreenProjector,
  pointerX: number,
  pointerY: number,
  maxDistancePx = 12
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const route of routes) {
    if (route.points.length < 2) continue;
    for (let i = 0; i < route.points.length - 1; i += 1) {
      const a = projectToScreen(route.points[i].lon, route.points[i].lat);
      const b = projectToScreen(route.points[i + 1].lon, route.points[i + 1].lat);
      const d = distancePointToSegment(pointerX, pointerY, a.x, a.y, b.x, b.y);
      if (d < bestDistance) {
        bestDistance = d;
        bestId = route.id;
      }
    }
  }
  return bestDistance <= maxDistancePx ? bestId : null;
}

function distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 0.0000001) return Math.hypot(px - ax, py - ay);
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}
