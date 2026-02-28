/**
 * Effets en cours par pays : catégories, libellés et helpers d’affichage.
 * Réutilise BUDGET_MINISTRY_KEYS / BUDGET_MINISTRY_LABELS de ruleParameters.
 */

import { BUDGET_MINISTRY_KEYS, BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";
import type { CountryEffect } from "@/types/database";

/** Clés des stats société (pour dropdown et effect_target). */
export const STAT_KEYS = ["militarism", "industry", "science", "stability"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  militarism: "Militarisme",
  industry: "Industrie",
  science: "Science",
  stability: "Stabilité",
};

/** Catégories pour le premier dropdown (libellé FR). */
export const EFFECT_CATEGORY_IDS = [
  "gdp_growth",
  "population_growth",
  "stat_delta",
  "budget_ministry",
  "budget_debt_surplus",
  "military_unit",
] as const;
export type EffectCategoryId = (typeof EFFECT_CATEGORY_IDS)[number];

export const EFFECT_CATEGORY_LABELS: Record<EffectCategoryId, string> = {
  gdp_growth: "Croissance PIB",
  population_growth: "Croissance population",
  stat_delta: "Stats (société)",
  budget_ministry: "Budget ministère",
  budget_debt_surplus: "Allocation de Budget Maximum",
  military_unit: "Unité militaire",
};

/** Sous-type Croissance PIB / Population : base ou par stat. */
export const GROWTH_SUB_IDS = ["base", "per_stat"] as const;
export const GROWTH_SUB_LABELS: Record<string, string> = {
  base: "Base",
  per_stat: "Par stat",
};

/** Sous-type Budget ministère. */
export const BUDGET_EFFECT_SUB_IDS = ["min_pct", "effect_multiplier"] as const;
export const BUDGET_EFFECT_SUB_LABELS: Record<string, string> = {
  min_pct: "Budget minimum forcé",
  effect_multiplier: "Bonus/Malus d'effet",
};

/** Sous-type Unité militaire. */
export const MILITARY_UNIT_EFFECT_SUB_IDS = ["unit_extra", "unit_tech_rate"] as const;
export const MILITARY_UNIT_EFFECT_SUB_LABELS: Record<string, string> = {
  unit_extra: "Bonus/Malus extra (nombre d'unités)",
  unit_tech_rate: "Bonus points technologie (par jour)",
};

/** Construire effect_kind + effect_target + effect_subtype à partir des choix du formulaire. */
export function buildEffectKeys(
  category: EffectCategoryId,
  subChoice: string | null,
  target: string | null
): { effect_kind: string; effect_target: string | null; effect_subtype: string | null } {
  if (category === "gdp_growth") {
    if (subChoice === "base") return { effect_kind: "gdp_growth_base", effect_target: null, effect_subtype: null };
    return { effect_kind: "gdp_growth_per_stat", effect_target: target, effect_subtype: null };
  }
  if (category === "population_growth") {
    if (subChoice === "base") return { effect_kind: "population_growth_base", effect_target: null, effect_subtype: null };
    return { effect_kind: "population_growth_per_stat", effect_target: target, effect_subtype: null };
  }
  if (category === "stat_delta") {
    return { effect_kind: "stat_delta", effect_target: target, effect_subtype: null };
  }
  if (category === "budget_ministry") {
    const effect_kind = subChoice === "min_pct" ? "budget_ministry_min_pct" : "budget_ministry_effect_multiplier";
    return { effect_kind, effect_target: target, effect_subtype: null };
  }
  if (category === "budget_debt_surplus") {
    return { effect_kind: "budget_allocation_cap", effect_target: null, effect_subtype: null };
  }
  if (category === "military_unit") {
    const effect_kind = subChoice === "unit_tech_rate" ? "military_unit_tech_rate" : "military_unit_extra";
    return { effect_kind, effect_target: target, effect_subtype: null };
  }
  return { effect_kind: "", effect_target: null, effect_subtype: null };
}

/** Libellé court pour effect_kind (affichage liste). */
export const EFFECT_KIND_LABELS: Record<string, string> = {
  gdp_growth_base: "Croissance PIB (taux de base)",
  gdp_growth_per_stat: "Croissance PIB (par stat)",
  population_growth_base: "Croissance population (taux de base)",
  population_growth_per_stat: "Croissance population (par stat)",
  stat_delta: "Stat société",
  budget_ministry_min_pct: "Budget ministère (minimum forcé)",
  budget_ministry_effect_multiplier: "Budget ministère (bonus/malus d’effet)",
  budget_allocation_cap: "Allocation de Budget Maximum",
  military_unit_extra: "Unité militaire (bonus/malus extra)",
  military_unit_tech_rate: "Unité militaire (bonus points tech/jour)",
};

/** Description élégante et lisible pour l’admin et le joueur. */
export type GetEffectDescriptionOptions = { rosterUnitName?: (id: string) => string | null };

export function getEffectDescription(e: CountryEffect, options?: GetEffectDescriptionOptions): string {
  const valueStr = formatEffectValue(e.effect_kind, e.value);
  let targetLabel: string | null = null;
  if (e.effect_target) {
    if (e.effect_kind === "military_unit_extra" || e.effect_kind === "military_unit_tech_rate")
      targetLabel = options?.rosterUnitName?.(e.effect_target) ?? e.effect_target;
    else
      targetLabel = STAT_LABELS[e.effect_target as StatKey] ?? BUDGET_MINISTRY_LABELS[e.effect_target] ?? e.effect_target;
  }

  if (e.effect_kind === "budget_ministry_min_pct" && targetLabel) {
    return `Minimum forcé — ${targetLabel} : ${valueStr}`;
  }
  if (e.effect_kind === "budget_ministry_effect_multiplier" && targetLabel) {
    return `Bonus/Malus d’effet — ${targetLabel} : ${valueStr}`;
  }
  if (e.effect_kind === "budget_allocation_cap") {
    return `Allocation de Budget Maximum : ${valueStr}`;
  }
  if (e.effect_kind === "gdp_growth_base") return `Croissance PIB (base) : ${valueStr}`;
  if (e.effect_kind === "gdp_growth_per_stat" && targetLabel) return `Croissance PIB — ${targetLabel} : ${valueStr}`;
  if (e.effect_kind === "population_growth_base") return `Croissance population (base) : ${valueStr}`;
  if (e.effect_kind === "population_growth_per_stat" && targetLabel) return `Croissance population — ${targetLabel} : ${valueStr}`;
  if (e.effect_kind === "stat_delta" && targetLabel) return `Stat — ${targetLabel} : ${valueStr}`;
  if (e.effect_kind === "military_unit_extra" && targetLabel) return `Extra unité — ${targetLabel} : ${valueStr}`;
  if (e.effect_kind === "military_unit_tech_rate" && targetLabel) return `Tech unité — ${targetLabel} : ${valueStr}`;

  const kindLabel = EFFECT_KIND_LABELS[e.effect_kind] ?? e.effect_kind;
  if (targetLabel) return `${kindLabel} — ${targetLabel} : ${valueStr}`;
  return `${kindLabel} : ${valueStr}`;
}

function formatEffectValue(effectKind: string | null | undefined, value: number): string {
  const kind = effectKind ?? "";
  if (kind === "budget_ministry_min_pct") return `${Number(value)} %`;
  if (kind === "budget_ministry_effect_multiplier") return `${(value * 100 - 100).toFixed(0)} %`;
  if (kind === "budget_allocation_cap") return `${value >= 0 ? "+" : ""}${value} %`;
  if (kind.startsWith("gdp_growth") || kind.startsWith("population_growth")) {
    return (value * 100).toFixed(2) + " %";
  }
  if (kind === "military_unit_tech_rate") return `${Number(value)} pts/jour`;
  if (kind === "military_unit_extra") return (Number(value) >= 0 ? "+" : "") + String(Number(value));
  return String(value);
}

/** True si l’effet doit s’afficher en vert (bonus). Minimum forcé = toujours rouge (dépense forcée). */
export function isEffectDisplayPositive(e: CountryEffect): boolean {
  if (e.effect_kind === "budget_ministry_min_pct") return false;
  return Number(e.value) > 0;
}

/** @deprecated Utiliser isEffectDisplayPositive pour l’affichage. */
export function isEffectPositive(value: number): boolean {
  return value > 0;
}

/** Clé budget (effect_target) vers clé pct (country_budget). */
export function budgetKeyToPctKey(budgetKey: string): string {
  return budgetKey.replace(/^budget_/, "pct_");
}

/** Durée restante affichée (jours ou mises à jour). */
export function formatDurationRemaining(e: CountryEffect): string {
  const n = e.duration_remaining;
  return e.duration_kind === "updates"
    ? `${n} mise${n > 1 ? "s" : ""} à jour`
    : `${n} jour${n > 1 ? "s" : ""}`;
}

/** Liste des ministères pour les dropdowns (clé + libellé). */
export function getBudgetMinistryOptions(): { key: string; label: string }[] {
  return BUDGET_MINISTRY_KEYS.map((key) => ({ key, label: BUDGET_MINISTRY_LABELS[key] ?? key }));
}

/** Pour pré-remplir le formulaire d’édition à partir d’un effet existant. */
export function parseEffectToForm(e: CountryEffect): {
  category: EffectCategoryId;
  subChoice: string | null;
  target: string | null;
} {
  if (e.effect_kind === "gdp_growth_base") return { category: "gdp_growth", subChoice: "base", target: null };
  if (e.effect_kind === "gdp_growth_per_stat") return { category: "gdp_growth", subChoice: "per_stat", target: e.effect_target };
  if (e.effect_kind === "population_growth_base") return { category: "population_growth", subChoice: "base", target: null };
  if (e.effect_kind === "population_growth_per_stat") return { category: "population_growth", subChoice: "per_stat", target: e.effect_target };
  if (e.effect_kind === "stat_delta") return { category: "stat_delta", subChoice: null, target: e.effect_target };
  if (e.effect_kind === "budget_ministry_min_pct") return { category: "budget_ministry", subChoice: "min_pct", target: e.effect_target };
  if (e.effect_kind === "budget_ministry_effect_multiplier") return { category: "budget_ministry", subChoice: "effect_multiplier", target: e.effect_target };
  if (e.effect_kind === "budget_allocation_cap") return { category: "budget_debt_surplus", subChoice: null, target: null };
  if (e.effect_kind === "military_unit_extra") return { category: "military_unit", subChoice: "unit_extra", target: e.effect_target };
  if (e.effect_kind === "military_unit_tech_rate") return { category: "military_unit", subChoice: "unit_tech_rate", target: e.effect_target };
  return { category: "gdp_growth", subChoice: "base", target: null };
}

/** Minimum forcé par ministère (pct_*) à partir des effets actifs. */
export function getForcedMinPcts(effects: CountryEffect[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of effects) {
    if (e.effect_kind !== "budget_ministry_min_pct" || !e.effect_target) continue;
    const pctKey = budgetKeyToPctKey(e.effect_target);
    const val = Math.max(0, Number(e.value));
    out[pctKey] = Math.max(out[pctKey] ?? 0, val);
  }
  return out;
}

/** Modificateur total d’allocation (100 + sum des effets budget_allocation_cap). Ex. +20 et -10 => 110. */
export function getAllocationCapPercent(effects: CountryEffect[]): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "budget_allocation_cap") sum += Number(e.value);
  }
  return 100 + sum;
}

/** Somme des bonus/malus extra pour une unité (effets actifs military_unit_extra). */
export function getUnitExtraEffectSum(effects: CountryEffect[], rosterUnitId: string): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "military_unit_extra" && e.effect_target === rosterUnitId && e.duration_remaining > 0) {
      sum += Number(e.value);
    }
  }
  return sum;
}
