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

/** Force le palier qualité global: perf|balanced|rich (défaut perf). */
export function getMapQualityTierFlag(): "perf" | "balanced" | "rich" {
  const raw = (process.env.NEXT_PUBLIC_MAP_QUALITY_TIER ?? "perf").toLowerCase();
  if (raw === "balanced") return "balanced";
  if (raw === "rich") return "rich";
  return "perf";
}

/** Si activé, coupe agressivement labels/effets pendant interaction pour sécuriser les devices faibles. */
export function isMapMobileHardModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_MOBILE_HARD_MODE !== "0";
}

/** Spike devalidation: coupe les couches SVG geographiques secondaires en mode WebGL. */
export function isMapZeroSvgSpikeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE === "1";
}

