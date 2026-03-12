/**
 * Requis dynamiques pour les avantages.
 * Source unique des types (stat, gdp, population, influence, law_level) et de la résolution d'activation.
 */

import { getLawDefinition, getLawLevelKeyFromScore, LAW_DEFINITIONS } from "@/lib/laws";
import type { CountryLawRow } from "@/lib/laws";
import { formatGdp, formatNumber } from "@/lib/format";

export const REQUIREMENT_KIND_STAT = "stat";
export const REQUIREMENT_KIND_GDP = "gdp";
export const REQUIREMENT_KIND_POPULATION = "population";
export const REQUIREMENT_KIND_INFLUENCE = "influence";
export const REQUIREMENT_KIND_LAW_LEVEL = "law_level";

export const ALL_REQUIREMENT_KIND_IDS = [
  REQUIREMENT_KIND_STAT,
  REQUIREMENT_KIND_GDP,
  REQUIREMENT_KIND_POPULATION,
  REQUIREMENT_KIND_INFLUENCE,
  REQUIREMENT_KIND_LAW_LEVEL,
] as const;

export type RequirementKindId = (typeof ALL_REQUIREMENT_KIND_IDS)[number];

export const REQUIREMENT_KIND_META: Record<
  RequirementKindId,
  { label: string; needsTarget: boolean; targetLabel?: string; targetOptions?: { value: string; label: string }[] }
> = {
  [REQUIREMENT_KIND_STAT]: {
    label: "Statistique",
    needsTarget: true,
    targetLabel: "Stat",
    targetOptions: [
      { value: "militarism", label: "Militarisme" },
      { value: "industry", label: "Industrie" },
      { value: "science", label: "Science" },
      { value: "stability", label: "Stabilité" },
    ],
  },
  [REQUIREMENT_KIND_GDP]: {
    label: "PIB",
    needsTarget: false,
  },
  [REQUIREMENT_KIND_POPULATION]: {
    label: "Population",
    needsTarget: false,
  },
  [REQUIREMENT_KIND_INFLUENCE]: {
    label: "Influence",
    needsTarget: false,
  },
  [REQUIREMENT_KIND_LAW_LEVEL]: {
    label: "Niveau de loi",
    needsTarget: true,
    targetLabel: "Loi",
    targetOptions: LAW_DEFINITIONS.map((d) => ({ value: d.lawKey, label: d.title_fr })),
  },
};

export type PerkRequirementRow = {
  id?: string;
  requirement_kind: string;
  requirement_target: string | null;
  value: number;
};

export type PerkWithRequirements = {
  id: string;
  perk_requirements?: PerkRequirementRow[];
};

export type PerkActivationContext = {
  country: {
    militarism: number | null;
    industry: number | null;
    science: number | null;
    stability: number | null;
    gdp: number | null;
    population: number | null;
  };
  /** Influence du pays (score). Si absent, requis influence non évalués. */
  influenceValue?: number | null;
  /** Lignes country_laws / country_mobilisation pour law_level. */
  countryLawRows?: CountryLawRow[];
  /** rule_parameters (configRuleKey -> level_thresholds) pour résoudre le niveau à partir du score. */
  ruleParametersByKey?: Record<string, { value: unknown }>;
};

/**
 * Vérifie si un seul requis est satisfait.
 */
function isRequirementSatisfied(
  req: PerkRequirementRow,
  ctx: PerkActivationContext
): boolean {
  const kind = req.requirement_kind;
  const target = req.requirement_target ?? undefined;
  const value = Number(req.value);

  if (kind === REQUIREMENT_KIND_STAT && target) {
    const stat = ctx.country[target as keyof typeof ctx.country];
    if (stat == null) return false;
    return Number(stat) >= value;
  }
  if (kind === REQUIREMENT_KIND_GDP) {
    const gdp = ctx.country.gdp ?? 0;
    return Number(gdp) >= value;
  }
  if (kind === REQUIREMENT_KIND_POPULATION) {
    const pop = ctx.country.population ?? 0;
    return Number(pop) >= value;
  }
  if (kind === REQUIREMENT_KIND_INFLUENCE) {
    if (ctx.influenceValue == null) return false;
    return Number(ctx.influenceValue) >= value;
  }
  if (kind === REQUIREMENT_KIND_LAW_LEVEL && target) {
    const def = getLawDefinition(target);
    if (!def || !ctx.countryLawRows?.length || !ctx.ruleParametersByKey) return false;
    const lawRow = ctx.countryLawRows.find((r) => r.law_key === target);
    if (!lawRow) return false;
    const config = ctx.ruleParametersByKey[def.configRuleKey]?.value as { level_thresholds?: Record<string, number> } | undefined;
    const levelKey = getLawLevelKeyFromScore(lawRow.score, config?.level_thresholds, def.levels);
    const levelIndex = def.levels.findIndex((l) => l.key === levelKey) + 1; // 1-based
    return levelIndex >= value;
  }
  return false;
}

/**
 * Un avantage est actif si tous ses requis (perk_requirements) sont satisfaits.
 * S'il n'a aucun requis, il est actif pour tout le monde.
 * Compatibilité : si le perk n'a pas de perk_requirements mais a des min_* (legacy), on ne les utilise plus ici
 * (la migration a copié min_* vers perk_requirements).
 */
export function isPerkActive(
  perk: PerkWithRequirements,
  ctx: PerkActivationContext
): boolean {
  const reqs = perk.perk_requirements ?? [];
  if (reqs.length === 0) return true;
  return reqs.every((r) => isRequirementSatisfied(r, ctx));
}

/**
 * Libellé court pour affichage (ex. "Militarisme ≥ 5", "PIB ≥ 1,2 Bn").
 */
/**
 * Pour le formulaire admin : libellé du champ valeur, step, et conversion affichage ↔ stockage.
 * PIB : affichage en milliards (1.2), stockage en valeur brute (1.2e9).
 */
export function getRequirementValueHelper(kind: string): {
  valueLabel: string;
  valueStep: number;
  displayToStored: (display: number) => number;
  storedToDisplay: (stored: number) => number;
} {
  if (kind === REQUIREMENT_KIND_GDP) {
    return {
      valueLabel: "PIB min (Bn)",
      valueStep: 0.1,
      displayToStored: (d) => d * 1_000_000_000,
      storedToDisplay: (s) => s / 1_000_000_000,
    };
  }
  if (kind === REQUIREMENT_KIND_POPULATION) {
    return { valueLabel: "Population min", valueStep: 1_000_000, displayToStored: (d) => d, storedToDisplay: (s) => s };
  }
  if (kind === REQUIREMENT_KIND_STAT) {
    return { valueLabel: "Seuil (0–10 ou -3–3)", valueStep: 1, displayToStored: (d) => d, storedToDisplay: (s) => s };
  }
  if (kind === REQUIREMENT_KIND_INFLUENCE) {
    return { valueLabel: "Influence min", valueStep: 1, displayToStored: (d) => d, storedToDisplay: (s) => s };
  }
  if (kind === REQUIREMENT_KIND_LAW_LEVEL) {
    return { valueLabel: "Niveau min (1–5)", valueStep: 1, displayToStored: (d) => d, storedToDisplay: (s) => s };
  }
  return { valueLabel: "Valeur", valueStep: 1, displayToStored: (d) => d, storedToDisplay: (s) => s };
}

export function formatRequirementLabel(
  req: PerkRequirementRow,
  lawLabelByKey?: (lawKey: string) => string
): string {
  const kind = req.requirement_kind;
  const value = Number(req.value);

  if (kind === REQUIREMENT_KIND_STAT && req.requirement_target) {
    const meta = REQUIREMENT_KIND_META[REQUIREMENT_KIND_STAT];
    const label = meta.targetOptions?.find((o) => o.value === req.requirement_target)?.label ?? req.requirement_target;
    return `${label} ≥ ${value}`;
  }
  if (kind === REQUIREMENT_KIND_GDP) {
    return `PIB ≥ ${formatGdp(value)}`;
  }
  if (kind === REQUIREMENT_KIND_POPULATION) {
    return `Population ≥ ${formatNumber(value)}`;
  }
  if (kind === REQUIREMENT_KIND_INFLUENCE) {
    return `Influence ≥ ${formatNumber(value)}`;
  }
  if (kind === REQUIREMENT_KIND_LAW_LEVEL && req.requirement_target) {
    const def = getLawDefinition(req.requirement_target);
    const lawLabel = lawLabelByKey
      ? lawLabelByKey(req.requirement_target)
      : def?.title_fr ?? req.requirement_target;
    const levelLabel = def?.levels[Math.min(Math.max(0, Math.floor(value) - 1), (def.levels.length ?? 1) - 1)]?.label ?? `niveau ${value}`;
    return `${lawLabel} ≥ ${levelLabel}`;
  }
  return `${kind} ≥ ${value}`;
}
