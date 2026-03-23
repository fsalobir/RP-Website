import type { PointData } from "pixi.js";

export const CARTE_III_WORLD_WIDTH = 4096;
export const CARTE_III_WORLD_HEIGHT = 2048;

export const CARTE_III_BOUNDS = {
  lonMin: -180,
  lonMax: 180,
  latMin: -85,
  latMax: 85,
} as const;

export function projectLonLatToWorld(lon: number, lat: number): PointData {
  const xRatio = (lon - CARTE_III_BOUNDS.lonMin) / (CARTE_III_BOUNDS.lonMax - CARTE_III_BOUNDS.lonMin);
  const yRatio = (CARTE_III_BOUNDS.latMax - lat) / (CARTE_III_BOUNDS.latMax - CARTE_III_BOUNDS.latMin);
  return {
    x: xRatio * CARTE_III_WORLD_WIDTH,
    y: yRatio * CARTE_III_WORLD_HEIGHT,
  };
}

export function unprojectWorldToLonLat(x: number, y: number): { lon: number; lat: number } {
  const lon = CARTE_III_BOUNDS.lonMin + (x / CARTE_III_WORLD_WIDTH) * (CARTE_III_BOUNDS.lonMax - CARTE_III_BOUNDS.lonMin);
  const lat = CARTE_III_BOUNDS.latMax - (y / CARTE_III_WORLD_HEIGHT) * (CARTE_III_BOUNDS.latMax - CARTE_III_BOUNDS.latMin);
  return { lon, lat };
}
