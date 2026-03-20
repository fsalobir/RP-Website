import { isNextPublicEnvEmptyOrWhitespace, readNextPublicEnvKey } from "@/lib/nextPublicEnv";

export type MapRendererMode = "svg" | "webgl";
export type MapRendererRolloutStage = "off" | "mj-only" | "public-canary" | "all";
export type MapDisplayMode = "mj" | "public";

const MAP_ENV_DIAGNOSTIC_KEYS = [
  "NEXT_PUBLIC_MAP_RENDERER",
  "NEXT_PUBLIC_MAP_RENDERER_ROLLOUT",
  "NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG",
  "NEXT_PUBLIC_MAP_RENDERER_CANARY_PCT",
  "NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE",
  "NEXT_PUBLIC_MAP_WEBGL_PROVINCES",
  "NEXT_PUBLIC_MAP_QUALITY_TIER",
  "NEXT_PUBLIC_MAP_MOBILE_HARD_MODE",
] as const;

/** Avertissements build : clés `NEXT_PUBLIC_*` vides côté hébergeur (chaîne vide au lieu d’absent). */
export function getMapEnvBuildWarnings(): string[] {
  const warnings: string[] = [];
  for (const k of MAP_ENV_DIAGNOSTIC_KEYS) {
    if (isNextPublicEnvEmptyOrWhitespace(k)) {
      warnings.push(`${k} est vide → défaut code appliqué`);
    }
  }
  return warnings;
}

/**
 * Defaults are the normal product behaviour (WebGL everywhere). Env vars are optional overrides:
 * e.g. emergency rollback without a code change (`NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1`).
 * `NEXT_PUBLIC_MAP_RENDERER` / `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT` still override when set (build-time).
 * Perf carte (spike SVG + provinces WebGL) : opt-in dans `featureFlags.ts` — pas de config Vercel requise pour la carte « normale » (SVG).
 */
export function getRequestedMapRenderer(): MapRendererMode {
  const raw = readNextPublicEnvKey("NEXT_PUBLIC_MAP_RENDERER", "webgl").toLowerCase();
  return raw === "webgl" ? "webgl" : "svg";
}

/** Étape de rollout (MJ seul, canary, tous). Valeurs inconnues → `all`. */
export function getMapRendererRolloutStage(): MapRendererRolloutStage {
  const raw = readNextPublicEnvKey("NEXT_PUBLIC_MAP_RENDERER_ROLLOUT", "all").toLowerCase();
  if (raw === "mj-only" || raw === "public-canary" || raw === "all") return raw;
  return "all";
}

export function isRendererRollbackForced(): boolean {
  return readNextPublicEnvKey("NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG", "") === "1";
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

/**
 * Renderer effectif : **WebGL pour tous** (MJ + public) dès que le moteur demandé est `webgl`,
 * sans dépendre du rollout / canary (évite tout public en SVG par défaut).
 * Seuls cas SVG : `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1` ou `NEXT_PUBLIC_MAP_RENDERER=svg`.
 */
export function resolveEffectiveRenderer(
  _mode: MapDisplayMode,
  opts?: { requested?: MapRendererMode; stage?: MapRendererRolloutStage; forceSvg?: boolean; userKey?: string | null; canaryPct?: number }
): { requested: MapRendererMode; stage: MapRendererRolloutStage; effective: MapRendererMode; fallback: boolean; reason: string } {
  const requested = opts?.requested ?? getRequestedMapRenderer();
  const stage = opts?.stage ?? getMapRendererRolloutStage();
  const forceSvg = opts?.forceSvg ?? isRendererRollbackForced();
  if (forceSvg) return { requested, stage, effective: "svg", fallback: true, reason: "force-svg" };
  if (requested !== "webgl") return { requested, stage, effective: "svg", fallback: false, reason: "requested-svg" };
  return { requested, stage, effective: "webgl", fallback: false, reason: "webgl-default" };
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

