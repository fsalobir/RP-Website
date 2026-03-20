import { WebMercatorViewport } from "@deck.gl/core";
import type { DeckMapViewState } from "@/lib/mapDeckViewState";

export type LonLatBounds = {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
};

/**
 * Rectangle lon/lat visible aligné sur la caméra deck (Web Mercator), avec marge en pixels écran.
 */
export function getDeckViewportLonLatBounds(
  width: number,
  height: number,
  vs: DeckMapViewState,
  padPx = 0
): LonLatBounds | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return null;
  const vp = new WebMercatorViewport({
    width,
    height,
    longitude: vs.longitude,
    latitude: vs.latitude,
    zoom: vs.zoom,
    pitch: vs.pitch ?? 0,
    bearing: vs.bearing ?? 0,
  });
  const corners: Array<[number, number] | null> = [
    vp.unproject([-padPx, -padPx]) as [number, number] | null,
    vp.unproject([width + padPx, -padPx]) as [number, number] | null,
    vp.unproject([width + padPx, height + padPx]) as [number, number] | null,
    vp.unproject([-padPx, height + padPx]) as [number, number] | null,
  ];
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const c of corners) {
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const [lon, lat] = c;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  return { minLon, maxLon, minLat, maxLat };
}

export function lonLatBoundsIntersect(a: LonLatBounds, b: LonLatBounds): boolean {
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

export function routePathLonLatBounds(path: Array<[number, number]>): LonLatBounds {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const cur of path) {
    const [lo, la] = cur;
    if (!Number.isFinite(lo) || !Number.isFinite(la)) continue;
    minLon = Math.min(minLon, lo);
    maxLon = Math.max(maxLon, lo);
    minLat = Math.min(minLat, la);
    maxLat = Math.max(maxLat, la);
  }
  if (!Number.isFinite(minLon)) {
    return { minLon: 0, maxLon: 0, minLat: 0, maxLat: 0 };
  }
  return { minLon, maxLon, minLat, maxLat };
}
