export type PowerBalanceConfig = {
  neutralRatio: number;
  minimumRatio: number;
  maximumRatio: number;
  maximumPenalty: number;
  maximumBonus: number;
};

export const STATE_ACTION_STAT_RANGES: Record<string, { min: number; max: number }> = {
  militarism: { min: 0, max: 10 },
  industry: { min: 0, max: 10 },
  science: { min: 0, max: 10 },
  stability: { min: -3, max: 3 },
};

export function getPowerBalanceConfig(paramsSchema: Record<string, unknown>): PowerBalanceConfig {
  const raw = (paramsSchema.equilibre_des_forces ?? {}) as Record<string, unknown>;
  return {
    neutralRatio: typeof raw.ratio_equilibre === "number" ? raw.ratio_equilibre : 1,
    minimumRatio: typeof raw.ratio_min === "number" ? raw.ratio_min : 0.5,
    maximumRatio: typeof raw.ratio_max === "number" ? raw.ratio_max : 2,
    maximumPenalty: typeof raw.malus_max === "number" ? raw.malus_max : 20,
    maximumBonus: typeof raw.bonus_max === "number" ? raw.bonus_max : 20,
  };
}

export function computeRelationModifier(relation: number, amplitude: number): number {
  return Math.round((relation / 100) * amplitude);
}

export function computePowerBalanceModifier(ratio: number, config: PowerBalanceConfig): number {
  const {
    neutralRatio,
    minimumRatio,
    maximumRatio,
    maximumPenalty,
    maximumBonus,
  } = config;

  if (ratio <= minimumRatio) return -maximumPenalty;
  if (ratio >= maximumRatio) return maximumBonus;
  if (ratio < neutralRatio) {
    const range = neutralRatio - minimumRatio;
    return range > 0 ? Math.round((-maximumPenalty * (neutralRatio - ratio)) / range) : 0;
  }
  if (ratio > neutralRatio) {
    const range = maximumRatio - neutralRatio;
    return range > 0 ? Math.round((maximumBonus * (ratio - neutralRatio)) / range) : 0;
  }
  return 0;
}

export function computeStatModifierBreakdown(
  rangesConfig: Record<string, { min: number; max: number }>,
  stats: Record<string, number>
): { total: number; byStat: Record<string, number> } {
  const byStat: Record<string, number> = {};
  let total = 0;
  for (const [statKey, range] of Object.entries(rangesConfig)) {
    const statRange = STATE_ACTION_STAT_RANGES[statKey];
    if (!statRange) continue;
    const value = stats[statKey] ?? statRange.min;
    const t = (value - statRange.min) / (statRange.max - statRange.min || 1);
    const modifier = Math.round(range.min + t * (range.max - range.min));
    byStat[statKey] = modifier;
    total += modifier;
  }
  return { total, byStat };
}
