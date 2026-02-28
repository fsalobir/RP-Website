/**
 * Effets par pays : source unique des effect_kinds et résolution « effets pour un pays ».
 *
 * 1) Types d’effets (source unique)
 *    - ALL_EFFECT_KIND_IDS, EFFECT_KIND_META (targetType, valueFormat, label).
 *    - Sets dérivés : EFFECT_KINDS_WITH_STAT_TARGET, _BUDGET_TARGET, _NO_TARGET, _BRANCH_TARGET, _ROSTER_UNIT_TARGET.
 *    - Helpers : getEffectKindValueHelper(kind), formatEffectValue(kind, value), buildEffectKeys, parseEffectToForm.
 *    Pour ajouter un nouveau type : l’étendre ici ; il apparaît partout (Global, Mobilisation, effets actifs pays).
 *
 * 2) Résolution « effets pour un pays » (extensible)
 *    - getEffectsForCountry(context) agrège les effets de toutes les sources dans EFFECT_SOURCES.
 *    - Sources actuelles : country_effects, mobilisation (niveau dérivé du score), global_growth_effects.
 *    Pour ajouter un nouvel « endroit » (ex. traité, événement) : ajouter une source dans EFFECT_SOURCES.
 *
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
export const MILITARY_UNIT_EFFECT_SUB_IDS = ["unit_extra", "unit_tech_rate", "limit_modifier"] as const;
export const MILITARY_UNIT_EFFECT_SUB_LABELS: Record<string, string> = {
  unit_extra: "Bonus/Malus extra (nombre d'unités)",
  unit_tech_rate: "Bonus points technologie (par jour)",
  limit_modifier: "Modificateur de limites (%)",
};

/** Branches militaires pour effect_target du modificateur de limites. */
export const MILITARY_BRANCH_EFFECT_IDS = ["terre", "air", "mer", "strategique"] as const;
export const MILITARY_BRANCH_EFFECT_LABELS: Record<string, string> = {
  terre: "Terre",
  air: "Air",
  mer: "Mer",
  strategique: "Stratégique",
};

/** Niveaux de mobilisation (ordre pour affichage et dérivation du palier actuel). */
export const MOBILISATION_LEVELS: { key: string; label: string }[] = [
  { key: "demobilisation", label: "Démobilisation" },
  { key: "reserve_active", label: "Réserve Active" },
  { key: "mobilisation_partielle", label: "Mobilisation Partielle" },
  { key: "mobilisation_generale", label: "Mobilisation Générale" },
  { key: "guerre_patriotique", label: "Guerre Patriotique" },
];

/** Libellé du palier de mobilisation à partir de sa clé (pour breakdown, tooltips). */
export function getMobilisationLevelLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return MOBILISATION_LEVELS.find((l) => l.key === key)?.label ?? key;
}

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
    if (subChoice === "unit_tech_rate") return { effect_kind: "military_unit_tech_rate", effect_target: target, effect_subtype: null };
    if (subChoice === "limit_modifier") return { effect_kind: "military_unit_limit_modifier", effect_target: target, effect_subtype: null };
    return { effect_kind: "military_unit_extra", effect_target: target, effect_subtype: null };
  }
  return { effect_kind: "", effect_target: null, effect_subtype: null };
}

/** Types de cible pour un effect_kind. */
export type EffectTargetType = "none" | "stat" | "budget_ministry" | "military_branch" | "roster_unit";

/** Format de valeur pour affichage/saisie (formulaires Global, Mobilisation). */
export type EffectValueFormat =
  | "percent_decimal"
  | "raw"
  | "percent_display"
  | "multiplier"
  | "integer"
  | "integer_percent";

/** Métadonnées par effect_kind (source unique pour Sets et helper valeur). */
export interface EffectKindMeta {
  targetType: EffectTargetType;
  valueFormat: EffectValueFormat;
  label: string;
}

/** Liste ordonnée de tous les effect_kinds (ordre stable pour dropdowns). */
export const ALL_EFFECT_KIND_IDS = [
  "gdp_growth_base",
  "gdp_growth_per_stat",
  "population_growth_base",
  "population_growth_per_stat",
  "stat_delta",
  "budget_ministry_min_pct",
  "budget_ministry_effect_multiplier",
  "budget_allocation_cap",
  "military_unit_extra",
  "military_unit_tech_rate",
  "military_unit_limit_modifier",
] as const;

export type EffectKindId = (typeof ALL_EFFECT_KIND_IDS)[number];

/** Métadonnées par effect_kind. */
export const EFFECT_KIND_META: Record<EffectKindId, EffectKindMeta> = {
  gdp_growth_base: { targetType: "none", valueFormat: "percent_decimal", label: "Croissance PIB (taux de base)" },
  gdp_growth_per_stat: { targetType: "stat", valueFormat: "percent_decimal", label: "Croissance PIB (par stat)" },
  population_growth_base: { targetType: "none", valueFormat: "percent_decimal", label: "Croissance population (taux de base)" },
  population_growth_per_stat: { targetType: "stat", valueFormat: "percent_decimal", label: "Croissance population (par stat)" },
  stat_delta: { targetType: "stat", valueFormat: "raw", label: "Stat société" },
  budget_ministry_min_pct: { targetType: "budget_ministry", valueFormat: "percent_display", label: "Budget ministère (minimum forcé)" },
  budget_ministry_effect_multiplier: { targetType: "budget_ministry", valueFormat: "multiplier", label: "Budget ministère (bonus/malus d'effet)" },
  budget_allocation_cap: { targetType: "none", valueFormat: "percent_display", label: "Allocation de Budget Maximum" },
  military_unit_extra: { targetType: "roster_unit", valueFormat: "integer", label: "Unité militaire (bonus/malus extra)" },
  military_unit_tech_rate: { targetType: "roster_unit", valueFormat: "integer", label: "Unité militaire (bonus points tech/jour)" },
  military_unit_limit_modifier: { targetType: "military_branch", valueFormat: "integer_percent", label: "Unité militaire (modificateur de limites %)" },
};

/** Libellé court pour effect_kind (affichage liste). Dérivé des métadonnées, avec fallback. */
export const EFFECT_KIND_LABELS: Record<string, string> = Object.fromEntries(
  ALL_EFFECT_KIND_IDS.map((id) => [id, EFFECT_KIND_META[id].label])
);

/** Sets dérivés pour les formulaires (cible selon le kind). */
const _STAT = new Set<string>(["stat_delta", "gdp_growth_per_stat", "population_growth_per_stat"]);
const _BUDGET = new Set<string>(["budget_ministry_min_pct", "budget_ministry_effect_multiplier"]);
const _NONE = new Set<string>(["gdp_growth_base", "population_growth_base", "budget_allocation_cap"]);
const _BRANCH = new Set<string>(["military_unit_limit_modifier"]);
const _ROSTER = new Set<string>(["military_unit_extra", "military_unit_tech_rate"]);

export const EFFECT_KINDS_WITH_STAT_TARGET: ReadonlySet<string> = _STAT;
export const EFFECT_KINDS_WITH_BUDGET_TARGET: ReadonlySet<string> = _BUDGET;
export const EFFECT_KINDS_NO_TARGET: ReadonlySet<string> = _NONE;
export const EFFECT_KINDS_WITH_BRANCH_TARGET: ReadonlySet<string> = _BRANCH;
export const EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET: ReadonlySet<string> = _ROSTER;

/** Helper valeur pour formulaires (Global, Mobilisation) : libellé, step, conversion affichage ↔ stocké. */
export function getEffectKindValueHelper(effectKind: string): {
  valueLabel: string;
  valueStep: number;
  displayToStored: (displayValue: number) => number;
  storedToDisplay: (storedValue: number) => number;
} {
  const meta: EffectKindMeta | undefined = effectKind
    ? EFFECT_KIND_META[effectKind as EffectKindId]
    : undefined;
  const format = meta?.valueFormat ?? "raw";

  switch (format) {
    case "percent_decimal":
      return {
        valueLabel: "Taux (%)",
        valueStep: 0.01,
        displayToStored: (x) => x / 100,
        storedToDisplay: (x) => x * 100,
      };
    case "raw":
      return {
        valueLabel: "Delta",
        valueStep: 0.01,
        displayToStored: (x) => x,
        storedToDisplay: (x) => x,
      };
    case "percent_display":
      return {
        valueLabel: effectKind === "budget_allocation_cap" ? "% (+/-)" : "Min. %",
        valueStep: 0.01,
        displayToStored: (x) => x,
        storedToDisplay: (x) => x,
      };
    case "multiplier":
      return {
        valueLabel: "Mult.",
        valueStep: 0.01,
        displayToStored: (x) => (100 + x) / 100,
        storedToDisplay: (x) => (x * 100 - 100),
      };
    case "integer":
      return {
        valueLabel: effectKind === "military_unit_tech_rate" ? "Pts/jour" : "Extra",
        valueStep: 1,
        displayToStored: (x) => Math.floor(x),
        storedToDisplay: (x) => Number(x),
      };
    case "integer_percent":
      return {
        valueLabel: "%",
        valueStep: 0.01,
        displayToStored: (x) => x,
        storedToDisplay: (x) => Number(x),
      };
    default:
      return {
        valueLabel: "Valeur",
        valueStep: 0.01,
        displayToStored: (x) => x,
        storedToDisplay: (x) => x,
      };
  }
}

/** Description élégante et lisible pour l’admin et le joueur. */
export type GetEffectDescriptionOptions = { rosterUnitName?: (id: string) => string | null };

export function getEffectDescription(e: CountryEffect | ResolvedEffect, options?: GetEffectDescriptionOptions): string {
  const valueStr = formatEffectValue(e.effect_kind, e.value);
  let targetLabel: string | null = null;
  if (e.effect_target) {
    if (e.effect_kind === "military_unit_extra" || e.effect_kind === "military_unit_tech_rate")
      targetLabel = options?.rosterUnitName?.(e.effect_target) ?? e.effect_target;
    else if (e.effect_kind === "military_unit_limit_modifier")
      targetLabel = MILITARY_BRANCH_EFFECT_LABELS[e.effect_target] ?? e.effect_target;
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
  if (e.effect_kind === "military_unit_limit_modifier" && targetLabel) return `Limites — ${targetLabel} : ${valueStr}`;

  const kindLabel = EFFECT_KIND_LABELS[e.effect_kind] ?? e.effect_kind;
  if (targetLabel) return `${kindLabel} — ${targetLabel} : ${valueStr}`;
  return `${kindLabel} : ${valueStr}`;
}

export function formatEffectValue(effectKind: string | null | undefined, value: number): string {
  const kind = effectKind ?? "";
  if (kind === "budget_ministry_min_pct") return `${Number(value)} %`;
  if (kind === "budget_ministry_effect_multiplier") return `${(value * 100 - 100).toFixed(0)} %`;
  if (kind === "budget_allocation_cap") return `${value >= 0 ? "+" : ""}${value} %`;
  if (kind.startsWith("gdp_growth") || kind.startsWith("population_growth")) {
    return (value * 100).toFixed(2) + " %";
  }
  if (kind === "military_unit_tech_rate") return `${Number(value)} pts/jour`;
  if (kind === "military_unit_extra") return (Number(value) >= 0 ? "+" : "") + String(Number(value));
  if (kind === "military_unit_limit_modifier") return `${Number(value) >= 0 ? "+" : ""}${Number(value)} %`;
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
  if (e.effect_kind === "military_unit_limit_modifier") return { category: "military_unit", subChoice: "limit_modifier", target: e.effect_target };
  return { category: "gdp_growth", subChoice: "base", target: null };
}

/** Effet résolu (country_effects ou agrégé depuis global/mobilisation). Compatible avec les helpers. */
export type ResolvedEffect = {
  effect_kind: string;
  effect_target: string | null;
  value: number;
  duration_remaining?: number;
};

/** Contexte pour résoudre les effets applicables à un pays (sources enregistrées). */
export type EffectResolutionContext = {
  countryId: string;
  countryEffects: CountryEffect[];
  mobilisationLevelEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  globalGrowthEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
};

/** Pseudo-durée pour les effets globaux/mobilisation (toujours actifs). */
const PERMANENT_DURATION = 1;

function countryEffectsSource(ctx: EffectResolutionContext): ResolvedEffect[] {
  return ctx.countryEffects.map((e) => ({
    effect_kind: e.effect_kind,
    effect_target: e.effect_target,
    value: Number(e.value),
    duration_remaining: e.duration_remaining,
  }));
}

function mobilisationEffectsSource(ctx: EffectResolutionContext): ResolvedEffect[] {
  return ctx.mobilisationLevelEffects.map((e) => ({
    effect_kind: e.effect_kind,
    effect_target: e.effect_target ?? null,
    value: Number(e.value),
    duration_remaining: PERMANENT_DURATION,
  }));
}

function globalEffectsSource(ctx: EffectResolutionContext): ResolvedEffect[] {
  return ctx.globalGrowthEffects.map((e) => ({
    effect_kind: e.effect_kind,
    effect_target: e.effect_target ?? null,
    value: Number(e.value),
    duration_remaining: PERMANENT_DURATION,
  }));
}

/** Registry de sources d'effets. Ajouter une source ici pour un nouvel « endroit » sans toucher aux consommateurs. */
export const EFFECT_SOURCES: Array<(ctx: EffectResolutionContext) => ResolvedEffect[]> = [
  countryEffectsSource,
  mobilisationEffectsSource,
  globalEffectsSource,
];

/** Agrège les effets de toutes les sources pour un pays. Utiliser cette liste pour getForcedMinPcts, getAllocationCapPercent, getUnitExtraEffectSum, getLimitModifierPercent, expectedNextTick. */
export function getEffectsForCountry(context: EffectResolutionContext): ResolvedEffect[] {
  const out: ResolvedEffect[] = [];
  for (const source of EFFECT_SOURCES) {
    out.push(...source(context));
  }
  return out;
}

/** Minimum forcé par ministère (pct_*) à partir des effets actifs. */
export function getForcedMinPcts(effects: Array<{ effect_kind: string; effect_target: string | null; value: number }>): Record<string, number> {
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
export function getAllocationCapPercent(effects: Array<{ effect_kind: string; value: number }>): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "budget_allocation_cap") sum += Number(e.value);
  }
  return 100 + sum;
}

/** Somme des bonus/malus extra pour une unité (effets actifs military_unit_extra). */
export function getUnitExtraEffectSum(
  effects: Array<{ effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number }>,
  rosterUnitId: string
): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "military_unit_extra" && e.effect_target === rosterUnitId && (e.duration_remaining ?? 0) > 0) {
      sum += Number(e.value);
    }
  }
  return sum;
}

/** Somme des modificateurs de limite (%) pour une branche (effets military_unit_limit_modifier). */
export function getLimitModifierPercent(
  effects: Array<{ effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number }>,
  branch: string
): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "military_unit_limit_modifier" && e.effect_target === branch && (e.duration_remaining ?? 0) > 0) {
      sum += Number(e.value);
    }
  }
  return sum;
}
