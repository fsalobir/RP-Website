import { readNextPublicEnvKey } from "@/lib/nextPublicEnv";

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
  return readNextPublicEnvKey("NEXT_PUBLIC_MAP_ROUTE_WORKER", "") === "1";
}

/** Fusionne les tracés de routes en 3 chemins SVG (par palier) pour réduire le nombre de nœuds DOM (mode public). */
export function isMapRouteBatchSvgEnabled(): boolean {
  return readNextPublicEnvKey("NEXT_PUBLIC_MAP_ROUTE_BATCH_SVG", "") === "1";
}

/** Ajuste dynamiquement budgets labels / construction routes selon les écarts de frames. */
export function isMapQualityGovernorEnabled(): boolean {
  return readNextPublicEnvKey("NEXT_PUBLIC_MAP_QUALITY_GOVERNOR", "1") !== "0";
}

/** Force le palier qualité global: perf|balanced|rich (défaut perf). */
export function getMapQualityTierFlag(): "perf" | "balanced" | "rich" {
  const raw = readNextPublicEnvKey("NEXT_PUBLIC_MAP_QUALITY_TIER", "perf").toLowerCase();
  if (raw === "balanced") return "balanced";
  if (raw === "rich") return "rich";
  return "perf";
}

/** Si activé, coupe agressivement labels/effets pendant interaction pour sécuriser les devices faibles. */
export function isMapMobileHardModeEnabled(): boolean {
  return readNextPublicEnvKey("NEXT_PUBLIC_MAP_MOBILE_HARD_MODE", "1") !== "0";
}

/**
 * Legacy : spike « zéro SVG » (variables d’env). Le renderer WebGL utilise désormais **DeckGL**
 * comme seule vue (`MapDeckViewport`) — plus de double projection SVG + `foreignObject`.
 * Ces flags restent pour d’éventuels outils / métriques ; l’adapter carte ne s’appuie plus dessus.
 */
export function isMapZeroSvgSpikeEnabled(_effectiveRenderer?: "webgl" | "svg"): boolean {
  void _effectiveRenderer;
  const raw = process.env.NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE;
  const trimmed = raw === undefined || raw === null ? "" : String(raw).trim();
  if (trimmed === "0") return false;
  if (trimmed === "1") return true;
  return false;
}

/**
 * Legacy : opt-in explicite provinces WebGL. Les provinces en WebGL sont gérées par
 * `buildWorldMapDeckLayers` + `MapDeckViewport` lorsque `NEXT_PUBLIC_MAP_RENDERER=webgl`.
 */
export function isMapWebglProvincesLayerEnabled(_effectiveRenderer?: "webgl" | "svg"): boolean {
  void _effectiveRenderer;
  const raw = process.env.NEXT_PUBLIC_MAP_WEBGL_PROVINCES;
  const trimmed = raw === undefined || raw === null ? "" : String(raw).trim();
  if (trimmed === "0") return false;
  if (trimmed === "1") return true;
  return false;
}
