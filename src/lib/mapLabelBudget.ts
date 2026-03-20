import type { MapZoomLevelId } from "@/lib/mapZoomLevels";

export type RoutePathForLabels = {
  id: string;
  tier: string;
  labelX: number;
  labelY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const TIER_PRIORITY: Record<string, number> = {
  national: 0,
  regional: 1,
  local: 2,
};

/**
 * Deterministic label budget: sort by tier (national first), then by distance from viewport center in projection space.
 */
export function pickRouteLabelOrder(
  paths: RoutePathForLabels[],
  viewportCenterProj: [number, number] | null,
  maxLabels: number
): string[] {
  if (paths.length === 0 || maxLabels <= 0) return [];
  const cx = viewportCenterProj?.[0] ?? 0;
  const cy = viewportCenterProj?.[1] ?? 0;
  const scored = paths.map((p) => {
    const midX = (p.minX + p.maxX) * 0.5;
    const midY = (p.minY + p.maxY) * 0.5;
    const d2 = (midX - cx) * (midX - cx) + (midY - cy) * (midY - cy);
    const tp = TIER_PRIORITY[p.tier] ?? 3;
    return { id: p.id, tp, d2 };
  });
  scored.sort((a, b) => {
    if (a.tp !== b.tp) return a.tp - b.tp;
    return a.d2 - b.d2;
  });
  const out: string[] = [];
  const limit = Math.min(maxLabels, scored.length);
  for (let i = 0; i < limit; i++) out.push(scored[i].id);
  return out;
}

export function computeRouteLabelCap(args: {
  renderZoomLevel: MapZoomLevelId;
  maxRouteLabelsRule: number;
  isInteractionLite: boolean;
  isMobilePerf: boolean;
  governorLabelFactor: number;
}): number {
  const { renderZoomLevel, maxRouteLabelsRule, isInteractionLite, isMobilePerf, governorLabelFactor } = args;
  const capByLevel =
    renderZoomLevel === "monde" ? 35 : renderZoomLevel === "continent" ? 90 : renderZoomLevel === "nation" ? 220 : 400;
  const interactionCap = isInteractionLite ? Math.max(10, Math.floor(capByLevel * 0.25)) : capByLevel;
  const mobileCap = isMobilePerf ? Math.max(0, Math.floor(interactionCap * 0.6)) : interactionCap;
  const base = Math.min(mobileCap, maxRouteLabelsRule);
  const g = Math.max(0.35, Math.min(1.25, governorLabelFactor));
  return Math.max(0, Math.floor(base * g));
}
