export function isRealmColoringEnabled(): boolean {
  return process.env.NEXT_PUBLIC_REALM_COLORING_V2 !== "0";
}

export function isMapInfoPanelsV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_INFO_PANELS_V2 !== "0";
}

export function isRoleModelV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_ROLE_MODEL_V2 !== "0";
}

export function isMapRouteWorkerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_ROUTE_WORKER === "1";
}

/** Fusionne les tracés de routes en 3 chemins SVG (par palier) pour réduire le nombre de nœuds DOM (mode public). */
export function isMapRouteBatchSvgEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_ROUTE_BATCH_SVG === "1";
}

/** Ajuste dynamiquement budgets labels / construction routes selon les écarts de frames. */
export function isMapQualityGovernorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_QUALITY_GOVERNOR !== "0";
}

