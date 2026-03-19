export type MapRendererMode = "svg" | "webgl";
export type MapRendererRolloutStage = "off" | "mj-only" | "public-canary" | "all";

export function getRequestedMapRenderer(): MapRendererMode {
  const raw = (process.env.NEXT_PUBLIC_MAP_RENDERER ?? "svg").toLowerCase();
  return raw === "webgl" ? "webgl" : "svg";
}

export function getMapRendererRolloutStage(): MapRendererRolloutStage {
  const raw = (process.env.NEXT_PUBLIC_MAP_RENDERER_ROLLOUT ?? "off").toLowerCase();
  if (raw === "mj-only" || raw === "public-canary" || raw === "all") return raw;
  return "off";
}

export function isRendererRollbackForced(): boolean {
  return process.env.NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG === "1";
}

/**
 * Tant que la couche WebGL n'est pas finalisée, on force un fallback SVG.
 * Cette fonction centralise la bascule pour la migration progressive.
 */
export function getEffectiveMapRenderer(): { requested: MapRendererMode; effective: "svg"; fallback: boolean } {
  const requested = getRequestedMapRenderer();
  const fallback = requested === "webgl" || isRendererRollbackForced();
  return { requested, effective: "svg", fallback };
}

