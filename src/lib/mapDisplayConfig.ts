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
