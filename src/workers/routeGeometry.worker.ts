/// <reference lib="webworker" />
import {
  capPolylineVertices,
  generateSinuousPath,
  smoothLandPathWithSinuosity,
} from "@/lib/routes";
import {
  buildRouteLodVariants,
  pickRouteLodByZoom,
  simplifyPolylinePreservingCurves,
} from "@/lib/routesPrecompute";
import type {
  RouteGeometryWorkerRequest,
  RouteGeometryWorkerResponse,
} from "@/lib/routeGeometryWorkerTypes";

function buildRouteGeometryPoints(
  sequence: Array<{ lat: number; lon: number }>,
  tier: "local" | "regional" | "national",
  seed: number,
  sinuosityScale: number,
  routeLodEpsilon: number,
  routeLodZoomRef: number,
  maxVerticesForZoom: number
): Array<[number, number]> {
  let points: Array<[number, number]> = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    const a = sequence[i];
    const b = sequence[i + 1];
    const seg = generateSinuousPath(
      { lon: a.lon, lat: a.lat },
      { lon: b.lon, lat: b.lat },
      tier,
      seed + i,
      sinuosityScale
    );
    if (points.length > 0) points.pop();
    points.push(...seg);
  }
  points = smoothLandPathWithSinuosity(points, tier, seed, sinuosityScale);
  points = simplifyPolylinePreservingCurves(points, routeLodEpsilon);
  const lod = buildRouteLodVariants(points, {
    epsilonLow: Math.max(0.45, routeLodEpsilon * 1.8),
    epsilonMid: Math.max(0.2, routeLodEpsilon),
    epsilonHigh: Math.max(0.08, routeLodEpsilon * 0.5),
  });
  points = pickRouteLodByZoom(lod, routeLodZoomRef);
  return capPolylineVertices(points, maxVerticesForZoom);
}

self.onmessage = (event: MessageEvent<RouteGeometryWorkerRequest>) => {
  const req = event.data;
  if (!req || req.type !== "build-route-geometry") return;
  const payload = req.payload;
  try {
    const points = buildRouteGeometryPoints(
      payload.sequence,
      payload.tier,
      payload.seed ?? 0,
      payload.sinuosityScale,
      payload.routeLodEpsilon,
      payload.routeLodZoomRef,
      payload.maxVerticesForZoom
    );
    const res: RouteGeometryWorkerResponse = {
      type: "route-geometry-built",
      payload: { routeId: payload.routeId, points },
    };
    self.postMessage(res);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const res: RouteGeometryWorkerResponse = {
      type: "route-geometry-failed",
      routeId: payload.routeId,
      error: msg,
    };
    self.postMessage(res);
  }
};

export {};

