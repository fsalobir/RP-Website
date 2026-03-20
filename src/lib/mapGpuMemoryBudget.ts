export type MapGpuBudgetProfile = "small" | "medium" | "large";

export type MapGpuBudget = {
  maxRouteGeometryCacheEntries: number;
  maxRouteVerticesPerFrame: number;
  maxLabelCount: number;
};

const BUDGETS: Record<MapGpuBudgetProfile, MapGpuBudget> = {
  small: {
    maxRouteGeometryCacheEntries: 280,
    maxRouteVerticesPerFrame: 24000,
    maxLabelCount: 160,
  },
  medium: {
    maxRouteGeometryCacheEntries: 520,
    maxRouteVerticesPerFrame: 42000,
    maxLabelCount: 280,
  },
  large: {
    maxRouteGeometryCacheEntries: 900,
    maxRouteVerticesPerFrame: 72000,
    maxLabelCount: 420,
  },
};

export function getMapGpuBudget(profile: MapGpuBudgetProfile): MapGpuBudget {
  return BUDGETS[profile];
}

export function resolveMapGpuBudgetProfile(opts: { isMobilePerf: boolean; qualityTier: "perf" | "balanced" | "rich" }): MapGpuBudgetProfile {
  if (opts.isMobilePerf) return "small";
  if (opts.qualityTier === "rich") return "large";
  if (opts.qualityTier === "balanced") return "medium";
  return "small";
}

export function trimMapCacheToBudget<K, V>(map: Map<K, V>, maxEntries: number) {
  if (map.size <= maxEntries) return;
  const removeCount = map.size - maxEntries;
  let i = 0;
  for (const key of map.keys()) {
    map.delete(key);
    i += 1;
    if (i >= removeCount) break;
  }
}

