export type MapRendererMode = "svg" | "webgl";
export type MapRendererRolloutStage = "off" | "mj-only" | "public-canary" | "all";
export type MapDisplayMode = "mj" | "public";

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

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

export function isCanaryUser(userKey: string, percentage: number): boolean {
  const pct = Math.max(0, Math.min(100, percentage));
  if (pct === 0) return false;
  if (pct === 100) return true;
  const bucket = hashString(userKey) % 100;
  return bucket < pct;
}

export function resolveEffectiveRenderer(
  mode: MapDisplayMode,
  opts?: { requested?: MapRendererMode; stage?: MapRendererRolloutStage; forceSvg?: boolean; userKey?: string | null; canaryPct?: number }
): { requested: MapRendererMode; stage: MapRendererRolloutStage; effective: MapRendererMode; fallback: boolean; reason: string } {
  const requested = opts?.requested ?? getRequestedMapRenderer();
  const stage = opts?.stage ?? getMapRendererRolloutStage();
  const forceSvg = opts?.forceSvg ?? isRendererRollbackForced();
  const canaryPct = Number.isFinite(opts?.canaryPct) ? Number(opts?.canaryPct) : Number(process.env.NEXT_PUBLIC_MAP_RENDERER_CANARY_PCT ?? 5);
  if (forceSvg) return { requested, stage, effective: "svg", fallback: true, reason: "force-svg" };
  if (requested !== "webgl") return { requested, stage, effective: "svg", fallback: false, reason: "requested-svg" };
  if (stage === "off") return { requested, stage, effective: "svg", fallback: true, reason: "rollout-off" };
  if (stage === "all") return { requested, stage, effective: "webgl", fallback: false, reason: "rollout-all" };
  if (stage === "mj-only") {
    return mode === "mj"
      ? { requested, stage, effective: "webgl", fallback: false, reason: "rollout-mj" }
      : { requested, stage, effective: "svg", fallback: true, reason: "public-disabled" };
  }
  // public-canary
  if (mode === "mj") return { requested, stage, effective: "webgl", fallback: false, reason: "mj-with-canary" };
  const key = opts?.userKey?.trim();
  const canary = key ? isCanaryUser(key, canaryPct) : false;
  return canary
    ? { requested, stage, effective: "webgl", fallback: false, reason: "public-canary-on" }
    : { requested, stage, effective: "svg", fallback: true, reason: "public-canary-off" };
}

export type EffectiveRendererResult = ReturnType<typeof resolveEffectiveRenderer>;

/**
 * Same rules as `resolveEffectiveRenderer`, with a safe default for SSR/CLI callers.
 * Prefer passing `mode` explicitly when you know the page context (MJ vs public).
 */
export function getEffectiveMapRenderer(opts?: {
  mode?: MapDisplayMode;
  userKey?: string | null;
}): EffectiveRendererResult {
  const mode = opts?.mode ?? "public";
  return resolveEffectiveRenderer(mode, { userKey: opts?.userKey ?? null });
}

