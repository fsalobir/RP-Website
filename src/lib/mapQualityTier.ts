import type { ZoomLevelRule } from "@/lib/mapDisplayConfig";

export type MapQualityTier = "perf" | "balanced" | "rich";

function parseTier(raw: string | undefined): MapQualityTier {
  const normalized = (raw ?? "").toLowerCase();
  if (normalized === "balanced") return "balanced";
  if (normalized === "rich") return "rich";
  return "perf";
}

export function getConfiguredMapQualityTier(): MapQualityTier {
  return parseTier(process.env.NEXT_PUBLIC_MAP_QUALITY_TIER);
}

export function getQualityTierCapsMultiplier(tier: MapQualityTier, isMobilePerf: boolean): number {
  if (isMobilePerf) {
    if (tier === "rich") return 0.9;
    if (tier === "balanced") return 0.75;
    return 0.62;
  }
  if (tier === "rich") return 1;
  if (tier === "balanced") return 0.86;
  return 0.72;
}

export function getQualityTierLabelMultiplier(tier: MapQualityTier, isMobilePerf: boolean): number {
  if (isMobilePerf) {
    if (tier === "rich") return 0.65;
    if (tier === "balanced") return 0.5;
    return 0.35;
  }
  if (tier === "rich") return 1;
  if (tier === "balanced") return 0.82;
  return 0.6;
}

export function getQualityTierReducedEffects(tier: MapQualityTier): boolean {
  return tier === "perf";
}

export function applyQualityTierToZoomRule(
  baseRule: ZoomLevelRule,
  opts: { tier: MapQualityTier; isMobilePerf: boolean }
): ZoomLevelRule {
  const capMul = getQualityTierCapsMultiplier(opts.tier, opts.isMobilePerf);
  const routeLabelMul = getQualityTierLabelMultiplier(opts.tier, opts.isMobilePerf);
  return {
    ...baseRule,
    caps: {
      maxCities: Math.max(0, Math.floor(baseRule.caps.maxCities * capMul)),
      maxEntities: Math.max(0, Math.floor(baseRule.caps.maxEntities * capMul)),
      maxRouteLabels: Math.max(0, Math.floor(baseRule.caps.maxRouteLabels * routeLabelMul)),
    },
  };
}
