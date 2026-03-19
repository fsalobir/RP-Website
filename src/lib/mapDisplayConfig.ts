/**
 * Réglages d'affichage de la carte (tailles, fade, progressivité).
 * Partagés entre carte MJ et carte publique ; persistés dans rule_parameters (map_display_config).
 */

export type MapDisplayConfig = {
  cityIconMaxPx: number;
  /** Taille de police des noms de villes (icônes) — même zoom/fade que les icônes. */
  cityLabelFontSizePx: number;
  zoomRefWorld: number;
  zoomRefProvince: number;
  sizeAtWorldPct: number;
  sizeCurveExp: number;
  fadeStartPct: number;
  fadeEndPct: number;
  // Configuration routes
  routeStrokeLocalPx: number;
  routeStrokeRegionalPx: number;
  routeStrokeNationalPx: number;
  routeFadeStartPct: number;
  routeFadeEndPct: number;
  routeSizeAtWorldPct: number;
  routeSizeCurveExp: number;
  /** Taille de police des noms de routes — même zoom/fade que les routes. */
  routeLabelFontSizePx: number;
  routeSinuosityLocalPct: number;
  routeSinuosityRegionalPct: number;
  routeSinuosityNationalPct: number;
};

export type PersistedMapDisplayConfig = {
  schemaVersion: number;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  config: MapDisplayConfig;
};

export const DEFAULT_MAP_DISPLAY_CONFIG: MapDisplayConfig = {
  cityIconMaxPx: 20,
  cityLabelFontSizePx: 10,
  zoomRefWorld: 1.1,
  zoomRefProvince: 8,
  sizeAtWorldPct: 10,
  sizeCurveExp: 1,
  fadeStartPct: 33,
  fadeEndPct: 20,
  routeStrokeLocalPx: 0.05,
  routeStrokeRegionalPx: 0.1,
  routeStrokeNationalPx: 0.15,
  routeFadeStartPct: 33,
  routeFadeEndPct: 20,
  routeSizeAtWorldPct: 10,
  routeSizeCurveExp: 1,
  routeLabelFontSizePx: 0.25,
  routeSinuosityLocalPct: 80,
  routeSinuosityRegionalPct: 50,
  routeSinuosityNationalPct: 20,
};

function clampNumber(
  value: unknown,
  fallback: number,
  options?: { min?: number; max?: number; strictlyPositive?: boolean }
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (options?.strictlyPositive && n <= 0) return fallback;
  let next = n;
  if (typeof options?.min === "number") next = Math.max(options.min, next);
  if (typeof options?.max === "number") next = Math.min(options.max, next);
  return next;
}

export function sanitizeMapDisplayConfig(raw: unknown): MapDisplayConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const D = DEFAULT_MAP_DISPLAY_CONFIG;
  return {
    cityIconMaxPx: clampNumber(o.cityIconMaxPx, D.cityIconMaxPx, { min: 1, max: 128, strictlyPositive: true }),
    cityLabelFontSizePx: clampNumber(o.cityLabelFontSizePx, D.cityLabelFontSizePx, { min: 1, max: 64, strictlyPositive: true }),
    zoomRefWorld: clampNumber(o.zoomRefWorld, D.zoomRefWorld, { min: 0.1, max: 30, strictlyPositive: true }),
    zoomRefProvince: clampNumber(o.zoomRefProvince, D.zoomRefProvince, { min: 0.1, max: 300, strictlyPositive: true }),
    sizeAtWorldPct: clampNumber(o.sizeAtWorldPct, D.sizeAtWorldPct, { min: 0, max: 300 }),
    sizeCurveExp: clampNumber(o.sizeCurveExp, D.sizeCurveExp, { min: 0.1, max: 8, strictlyPositive: true }),
    fadeStartPct: clampNumber(o.fadeStartPct, D.fadeStartPct, { min: 0, max: 100 }),
    fadeEndPct: clampNumber(o.fadeEndPct, D.fadeEndPct, { min: 0, max: 100 }),
    routeStrokeLocalPx: clampNumber(o.routeStrokeLocalPx, D.routeStrokeLocalPx, { min: 0.01, max: 0.5, strictlyPositive: true }),
    routeStrokeRegionalPx: clampNumber(o.routeStrokeRegionalPx, D.routeStrokeRegionalPx, {
      min: 0.01,
      max: 0.5,
      strictlyPositive: true,
    }),
    routeStrokeNationalPx: clampNumber(o.routeStrokeNationalPx, D.routeStrokeNationalPx, {
      min: 0.01,
      max: 0.5,
      strictlyPositive: true,
    }),
    routeFadeStartPct: clampNumber(o.routeFadeStartPct, D.routeFadeStartPct, { min: 0, max: 100 }),
    routeFadeEndPct: clampNumber(o.routeFadeEndPct, D.routeFadeEndPct, { min: 0, max: 100 }),
    routeSizeAtWorldPct: clampNumber(o.routeSizeAtWorldPct, D.routeSizeAtWorldPct, { min: 0, max: 300 }),
    routeSizeCurveExp: clampNumber(o.routeSizeCurveExp, D.routeSizeCurveExp, { min: 0.1, max: 8, strictlyPositive: true }),
    routeLabelFontSizePx: clampNumber(o.routeLabelFontSizePx, D.routeLabelFontSizePx, {
      min: 0.01,
      max: 6,
      strictlyPositive: true,
    }),
    routeSinuosityLocalPct: clampNumber(o.routeSinuosityLocalPct, D.routeSinuosityLocalPct, { min: 0, max: 100 }),
    routeSinuosityRegionalPct: clampNumber(o.routeSinuosityRegionalPct, D.routeSinuosityRegionalPct, { min: 0, max: 100 }),
    routeSinuosityNationalPct: clampNumber(o.routeSinuosityNationalPct, D.routeSinuosityNationalPct, { min: 0, max: 100 }),
  };
}

export const MAP_DISPLAY_CONFIG_VERSION = 1;
export const MAP_DISPLAY_CONFIG_KEY = "map_display_config";

export function parseMapDisplayConfigSnapshot(raw: unknown): { config: MapDisplayConfig; version: number } {
  if (!raw || typeof raw !== "object") return { config: DEFAULT_MAP_DISPLAY_CONFIG, version: 0 };
  const payload = raw as Record<string, unknown>;
  const source =
    payload.config && typeof payload.config === "object"
      ? payload.config
      : payload;
  const version = Number(payload.version);
  return {
    config: sanitizeMapDisplayConfig(source),
    version: Number.isFinite(version) && version > 0 ? version : 1,
  };
}
