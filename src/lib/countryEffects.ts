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
] as const;
export type EffectCategoryId = (typeof EFFECT_CATEGORY_IDS)[number];

export const EFFECT_CATEGORY_LABELS: Record<EffectCategoryId, string> = {
  gdp_growth: "Croissance PIB",
  population_growth: "Croissance population",
  stat_delta: "Stats (société)",
  budget_ministry: "Budget ministère",
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
  return { effect_kind: "", effect_target: null, effect_subtype: null };
}

/** Libellé court pour effect_kind (affichage liste). */
export const EFFECT_KIND_LABELS: Record<string, string> = {
  gdp_growth_base: "Croissance PIB (base)",
  gdp_growth_per_stat: "Croissance PIB (par stat)",
  population_growth_base: "Croissance population (base)",
  population_growth_per_stat: "Croissance population (par stat)",
  stat_delta: "Stat société",
  budget_ministry_min_pct: "Budget ministère (minimum forcé)",
  budget_ministry_effect_multiplier: "Budget ministère (bonus/malus effet)",
};

/** Description lisible d’un effet (nom du type + cible + valeur). */
export function getEffectDescription(e: CountryEffect): string {
  const kindLabel = EFFECT_KIND_LABELS[e.effect_kind] ?? e.effect_kind;
  const targetLabel = e.effect_target
    ? STAT_LABELS[e.effect_target as StatKey] ?? BUDGET_MINISTRY_LABELS[e.effect_target] ?? e.effect_target
    : "";
  const valueStr = formatEffectValue(e.effect_kind, e.value);
  if (targetLabel) return `${kindLabel} — ${targetLabel} : ${valueStr}`;
  return `${kindLabel} : ${valueStr}`;
}

function formatEffectValue(effectKind: string, value: number): string {
  if (effectKind === "budget_ministry_min_pct") return `${value} %`;
  if (effectKind === "budget_ministry_effect_multiplier") return `${(value * 100 - 100).toFixed(0)} %`;
  if (effectKind.startsWith("gdp_growth") || effectKind.startsWith("population_growth")) {
    return (value * 100).toFixed(2) + " %";
  }
  return String(value);
}

/** True si l’effet est un bonus (affichage vert). */
export function isEffectPositive(value: number): boolean {
  return value > 0;
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
  return { category: "gdp_growth", subChoice: "base", target: null };
}
