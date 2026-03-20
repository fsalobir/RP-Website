import type { RouteTier } from "@/lib/routes";

export type RouteSequencePoint = { lat: number; lon: number };

export type RouteGeometryWorkerInput = {
  routeId: string;
  tier: RouteTier;
  seed?: number;
  sinuosityScale: number;
  routeLodEpsilon: number;
  routeLodZoomRef: number;
  currentZoomLevel: "province" | "nation" | "continent" | "monde";
  maxVerticesForZoom: number;
  sequence: RouteSequencePoint[];
};

export type RouteGeometryWorkerOutput = {
  routeId: string;
  points: Array<[number, number]>;
};

export type RouteGeometryWorkerRequest = {
  type: "build-route-geometry";
  payload: RouteGeometryWorkerInput;
};

export type RouteGeometryWorkerResponse =
  | { type: "route-geometry-built"; payload: RouteGeometryWorkerOutput }
  | { type: "route-geometry-failed"; routeId: string; error: string };

