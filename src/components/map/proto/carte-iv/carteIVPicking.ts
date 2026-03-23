import type { MapProtoDataset } from "@/components/map/proto/data/mapProtoTypes";
import type { CarteIVCamera } from "@/components/map/proto/carte-iv/useCarteIVCamera";
import { lonLatToWorld } from "@/components/map/proto/carte-iv/carteIVRenderer";

export function pickCityAt(
  dataset: MapProtoDataset,
  size: { w: number; h: number },
  camera: CarteIVCamera,
  sx: number,
  sy: number,
  maxPx = 12
): string | null {
  const world = screenToWorld(camera, sx, sy);
  let best: { id: string; d: number } | null = null;
  for (const city of dataset.cities) {
    const p = lonLatToWorld(size.w, size.h, city.lon, city.lat);
    const d = Math.hypot(p.x - world.x, p.y - world.y) * camera.scale;
    if (!best || d < best.d) best = { id: city.id, d };
  }
  return best && best.d <= maxPx ? best.id : null;
}

export function pickRouteAt(
  dataset: MapProtoDataset,
  size: { w: number; h: number },
  camera: CarteIVCamera,
  sx: number,
  sy: number,
  maxPx = 8
): string | null {
  const world = screenToWorld(camera, sx, sy);
  let best: { id: string; d: number } | null = null;
  for (const route of dataset.routes) {
    if (route.points.length < 2) continue;
    for (let i = 0; i < route.points.length - 1; i += 1) {
      const a = lonLatToWorld(size.w, size.h, route.points[i].lon, route.points[i].lat);
      const b = lonLatToWorld(size.w, size.h, route.points[i + 1].lon, route.points[i + 1].lat);
      const d = distancePointSegment(world.x, world.y, a.x, a.y, b.x, b.y) * camera.scale;
      if (!best || d < best.d) best = { id: route.id, d };
    }
  }
  return best && best.d <= maxPx ? best.id : null;
}

export function screenToWorld(camera: CarteIVCamera, sx: number, sy: number) {
  return {
    x: (sx - camera.tx) / camera.scale,
    y: (sy - camera.ty) / camera.scale,
  };
}

function distancePointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 1e-8) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}
