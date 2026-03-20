import type { Layer } from "@deck.gl/core";
import { GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection } from "geojson";

function ensureFeatureCollection(g: FeatureCollection | Feature | null | undefined): FeatureCollection | null {
  if (!g) return null;
  if (g.type === "FeatureCollection") return g;
  return { type: "FeatureCollection", features: [g as Feature] };
}

export type WorldMapDeckRoute = {
  id: string;
  name: string;
  lonLatPath: Array<[number, number]>;
  labelLonLat: [number, number];
  labelAngleDeg: number;
  widthPx: number;
  color: [number, number, number, number];
  showLabel: boolean;
};

export type WorldMapDeckCity = {
  id: string;
  lon: number;
  lat: number;
  name: string;
  fill: [number, number, number, number];
  radiusPx: number;
};

export type WorldMapDeckPoi = {
  id: string;
  lon: number;
  lat: number;
  fill: [number, number, number, number];
  radiusPx: number;
};

export type WorldMapDeckRealmLabel = {
  realmId: string;
  name: string;
  lon: number;
  lat: number;
  angleDeg: number;
  fontSizePx: number;
  color: [number, number, number, number];
};

export type BuildWorldMapDeckLayersOpts = {
  provinces: FeatureCollection | null;
  getProvinceFillColor: (f: Feature) => [number, number, number, number];
  realmBoundaries: FeatureCollection | null;
  lakesGeoJson: FeatureCollection | Feature | null;
  riversGeoJson: FeatureCollection | Feature | null;
  lakesOpacity: number;
  riversOpacity: number;
  showLakesLayer: boolean;
  showRiversLayer: boolean;
  showRealmBorders: boolean;
  borderLineColor: [number, number, number, number];
  routes: WorldMapDeckRoute[];
  routeGroupOpacity: number;
  cities: WorldMapDeckCity[];
  pois: WorldMapDeckPoi[];
  realmLabels: WorldMapDeckRealmLabel[];
  showCityLabels: boolean;
  cityLabelFontSizePx: number;
  routeLabelFontSizePx: number;
};

/**
 * Ordre bas → haut : hydro, provinces, frontières royaumes, routes, marqueurs, textes.
 */
export function buildWorldMapDeckLayers(opts: BuildWorldMapDeckLayersOpts): Layer[] {
  const layers: Layer[] = [];

  const lakes = ensureFeatureCollection(opts.lakesGeoJson);
  if (opts.showLakesLayer && lakes?.features?.length) {
    const o = Math.max(0, Math.min(1, opts.lakesOpacity));
    layers.push(
      new GeoJsonLayer({
        id: "wm-lakes",
        data: lakes,
        pickable: false,
        stroked: true,
        filled: true,
        extruded: false,
        getFillColor: [43, 111, 152, Math.round(77 * o)],
        getLineColor: [10, 40, 70, Math.round(64 * o)],
        getLineWidth: 0.5,
        lineWidthMinPixels: 0.35,
        lineWidthMaxPixels: 1.2,
        opacity: 1,
      })
    );
  }

  const rivers = ensureFeatureCollection(opts.riversGeoJson);
  if (opts.showRiversLayer && rivers?.features?.length) {
    const o = Math.max(0, Math.min(1, opts.riversOpacity));
    layers.push(
      new GeoJsonLayer({
        id: "wm-rivers",
        data: rivers,
        pickable: false,
        stroked: true,
        filled: false,
        lineWidthMinPixels: 0.6,
        lineWidthMaxPixels: 2,
        getLineColor: [20, 90, 140, Math.round(220 * o)],
        getLineWidth: 1,
        opacity: 1,
      })
    );
  }

  if (opts.provinces?.features?.length) {
    layers.push(
      new GeoJsonLayer({
        id: "wm-provinces",
        data: opts.provinces,
        pickable: true,
        stroked: true,
        filled: true,
        extruded: false,
        lineWidthMinPixels: 0.35,
        lineWidthMaxPixels: 1.2,
        getLineColor: [75, 55, 30, 110],
        getFillColor: (f: Feature) => opts.getProvinceFillColor(f),
        getLineWidth: 0.6,
      })
    );
  }

  if (opts.showRealmBorders && opts.realmBoundaries?.features?.length) {
    layers.push(
      new GeoJsonLayer({
        id: "wm-realm-borders",
        data: opts.realmBoundaries,
        pickable: false,
        stroked: true,
        filled: false,
        lineWidthMinPixels: 0.5,
        lineWidthMaxPixels: 1.4,
        getLineColor: opts.borderLineColor,
        getLineWidth: 0.5,
      })
    );
  }

  const routeOpacity = Math.max(0, Math.min(1, opts.routeGroupOpacity));
  if (opts.routes.length > 0 && routeOpacity > 0.01) {
    layers.push(
      new PathLayer<WorldMapDeckRoute>({
        id: "wm-routes",
        data: opts.routes,
        pickable: true,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        opacity: routeOpacity,
        getPath: (d) => d.lonLatPath,
        getColor: (d) => d.color,
        getWidth: (d) => Math.max(1, d.widthPx),
      })
    );

    const routeLabelData = opts.routes.filter((r) => r.showLabel && r.name);
    if (routeLabelData.length > 0) {
      layers.push(
        new TextLayer<WorldMapDeckRoute>({
          id: "wm-route-labels",
          data: routeLabelData,
          pickable: false,
          opacity: routeOpacity,
          getPosition: (d) => [...d.labelLonLat, 0],
          getText: (d) => d.name,
          getSize: opts.routeLabelFontSizePx,
          getColor: (d) => [
            d.color[0],
            d.color[1],
            d.color[2],
            Math.max(0, Math.min(255, Math.round(d.color[3] * routeOpacity))),
          ],
          getAngle: (d) => 360 - d.labelAngleDeg,
          fontFamily: '"MiddleEarthMap", serif',
          outlineColor: [18, 14, 9, 200],
          outlineWidth: 2,
          background: false,
          billboard: true,
        })
      );
    }
  }

  if (opts.pois.length > 0) {
    layers.push(
      new ScatterplotLayer<WorldMapDeckPoi>({
        id: "wm-pois",
        data: opts.pois,
        pickable: true,
        opacity: 0.88,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 0.5,
        getPosition: (d) => [d.lon, d.lat, 0],
        getRadius: (d) => d.radiusPx,
        getFillColor: (d) => d.fill,
        getLineColor: [50, 35, 20, 90],
        radiusUnits: "pixels",
      })
    );
  }

  if (opts.cities.length > 0) {
    layers.push(
      new ScatterplotLayer<WorldMapDeckCity>({
        id: "wm-cities",
        data: opts.cities,
        pickable: true,
        opacity: 1,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 0.5,
        getPosition: (d) => [d.lon, d.lat, 0],
        getRadius: (d) => d.radiusPx,
        getFillColor: (d) => d.fill,
        getLineColor: [20, 12, 6, 140],
        radiusUnits: "pixels",
      })
    );

    if (opts.showCityLabels) {
      layers.push(
        new TextLayer<WorldMapDeckCity>({
          id: "wm-city-labels",
          data: opts.cities,
          pickable: false,
          getPosition: (d) => [d.lon, d.lat, 0],
          getText: (d) => d.name,
          getPixelOffset: [0, 14],
          getSize: opts.cityLabelFontSizePx,
          getColor: [220, 200, 160, 240],
          fontFamily: '"MiddleEarthMap", serif',
          outlineColor: [18, 14, 9, 180],
          outlineWidth: 2,
          background: false,
          billboard: true,
        })
      );
    }
  }

  if (opts.realmLabels.length > 0) {
    layers.push(
      new TextLayer<WorldMapDeckRealmLabel>({
        id: "wm-realm-labels",
        data: opts.realmLabels,
        pickable: false,
        getPosition: (d) => [d.lon, d.lat, 0],
        getText: (d) => d.name,
        getSize: (d) => d.fontSizePx,
        getColor: (d) => d.color,
        getAngle: (d) => d.angleDeg,
        fontFamily: '"MiddleEarthMap", serif',
        outlineColor: [18, 14, 9, 190],
        outlineWidth: 3,
        background: false,
        billboard: true,
      })
    );
  }

  return layers;
}

function parseRgbaToTuple(s: string): [number, number, number, number] | null {
  const m = s.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return null;
  const a = m[4] !== undefined ? Number(m[4]) : 1;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Math.round(Math.max(0, Math.min(1, a)) * 255)];
}

/** Convertit une couleur CSS rgba(...) en tuple deck (alpha 0–255). */
export function routeCssStrokeToDeckColor(stroke: string, opacityMultiplier: number): [number, number, number, number] {
  const t = parseRgbaToTuple(stroke);
  if (!t) return [180, 140, 90, Math.round(220 * opacityMultiplier)];
  const a = Math.round((t[3] / 255) * opacityMultiplier * 255);
  return [t[0], t[1], t[2], Math.max(0, Math.min(255, a))];
}
