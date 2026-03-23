import type { CarteICameraState } from "@/components/map/proto/carte-i/useCarteICamera";
import type { CarteIWorldCity, CarteIWorldRoute } from "@/components/map/proto/carte-i/carteIRenderer";

export type ScreenPoint = { x: number; y: number };
export type WorldPoint = { x: number; y: number };

function sqr(value: number) {
  return value * value;
}

export function screenToWorld(point: ScreenPoint, camera: CarteICameraState): WorldPoint {
  return {
    x: (point.x - camera.translateX) / camera.scale,
    y: (point.y - camera.translateY) / camera.scale,
  };
}

export function worldToUv(point: WorldPoint, imageWidth: number, imageHeight: number) {
  return {
    u: point.x / imageWidth,
    v: point.y / imageHeight,
  };
}

export function findClosestCity(
  point: ScreenPoint,
  cities: CarteIWorldCity[],
  camera: CarteICameraState,
  imageWidth: number,
  imageHeight: number
) {
  const world = screenToWorld(point, camera);
  const worldHitRadius = 10 / camera.scale;
  let best: { id: string; distSq: number } | null = null;

  for (const city of cities) {
    const cityWorldX = city.u * imageWidth;
    const cityWorldY = city.v * imageHeight;
    const distSq = sqr(world.x - cityWorldX) + sqr(world.y - cityWorldY);
    if (distSq > sqr(worldHitRadius)) continue;
    if (!best || distSq < best.distSq) best = { id: city.id, distSq };
  }
  return best?.id ?? null;
}

function pointSegmentDistance(point: WorldPoint, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = point.x - ax;
  const apy = point.y - ay;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq)) : 0;
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  return Math.sqrt(sqr(point.x - qx) + sqr(point.y - qy));
}

export function findClosestRoute(
  point: ScreenPoint,
  routes: CarteIWorldRoute[],
  camera: CarteICameraState,
  imageWidth: number,
  imageHeight: number
) {
  const world = screenToWorld(point, camera);
  const hitThreshold = 8 / camera.scale;
  let best: { id: string; dist: number } | null = null;

  for (const route of routes) {
    if (route.points.length < 2) continue;
    for (let idx = 0; idx < route.points.length - 1; idx += 1) {
      const a = route.points[idx];
      const b = route.points[idx + 1];
      const dist = pointSegmentDistance(world, a.u * imageWidth, a.v * imageHeight, b.u * imageWidth, b.v * imageHeight);
      if (dist > hitThreshold) continue;
      if (!best || dist < best.dist) best = { id: route.id, dist };
    }
  }

  return best?.id ?? null;
}
