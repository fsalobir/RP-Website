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
 *
 * 3) Évolution prévue : effets à multiplicateur par stat
 *    Certains effets de lois pourront à terme avoir une valeur modulée par une stat du pays
 *    (ex. valeur_effective = value × (stat / 10)). Pour ce faire, ajouter des champs optionnels
 *    `stat_key` et `stat_multiplier` sur le format d'effet de loi, ou un effect_kind dédié
 *    (ex. military_unit_limit_modifier_sub_type_per_stat). La résolution se fera dans
 *    resolveAllLawEffectsForCountry (laws.ts) en lui passant un contexte élargi (stats du pays).
 */

import { IDEOLOGY_IDS, IDEOLOGY_LABELS, type IdeologyId } from "@/lib/ideology";
import { BUDGET_MINISTRY_KEYS, BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";
import { resolveAllLawEffectsForCountry, type CountryLawRow as LawRow } from "@/lib/laws";
import type { AdminEffectAdded, CountryEffect } from "@/types/database";

/** Tous les effect_kind idéologie (drift + snap) pour les 6 idéologies. */
export const IDEOLOGY_EFFECT_KIND_IDS = [
  ...IDEOLOGY_IDS.map((id) => `ideology_drift_${id}` as const),
  ...IDEOLOGY_IDS.map((id) => `ideology_snap_${id}` as const),
];

/** Clés des stats société (pour dropdown et effect_target). */
export const STAT_KEYS = ["militarism", "industry", "science", "stability"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  militarism: "Militarisme",
  industry: "Industrie",
  science: "Science",
  stability: "Stabilité",
};

/** Sous-types Modificateur d'influence (Global / PIB / Population / Hard Power). */
export const INFLUENCE_MODIFIER_SUB_IDS = ["global", "gdp", "population", "hard_power"] as const;
export const INFLUENCE_MODIFIER_SUB_LABELS: Record<string, string> = {
  global: "Global (toute l'influence)",
  gdp: "PIB (influence économie)",
  population: "Population",
  hard_power: "Hard Power (militaire)",
};

/** Catégories pour le premier dropdown (libellé FR). */
export const EFFECT_CATEGORY_IDS = [
  "gdp_growth",
  "population_growth",
  "stat_delta",
  "budget_ministry",
  "budget_debt_surplus",
  "military_unit",
  "influence_modifier",
  "ideology",
] as const;
export type EffectCategoryId = (typeof EFFECT_CATEGORY_IDS)[number];

export const EFFECT_CATEGORY_LABELS: Record<EffectCategoryId, string> = {
  gdp_growth: "Croissance PIB",
  population_growth: "Croissance population",
  stat_delta: "Stats (société)",
  budget_ministry: "Budget ministère",
  budget_debt_surplus: "Allocation de Budget Maximum",
  military_unit: "Unité militaire",
  influence_modifier: "Modificateur d'influence",
  ideology: "Idéologie",
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
export const MILITARY_UNIT_EFFECT_SUB_IDS = ["unit_extra", "unit_tech_rate", "limit_modifier", "limit_modifier_sub_type", "limit_modifier_roster"] as const;
export const MILITARY_UNIT_EFFECT_SUB_LABELS: Record<string, string> = {
  unit_extra: "Bonus/Malus extra (nombre d'unités)",
  unit_tech_rate: "Bonus points technologie (par jour)",
  limit_modifier: "Modificateur de limites par branche (%)",
  limit_modifier_sub_type: "Modificateur de limites par sous-branche/type (%)",
  limit_modifier_roster: "Modificateur de limites par unité (%)",
};

/** Clé composite pour cible sous-branche/type : "branch:sub_type" (sub_type peut être vide). */
export const SUB_TYPE_TARGET_SEP = ":";

/** Branches militaires pour effect_target du modificateur de limites. */
export const MILITARY_BRANCH_EFFECT_IDS = ["terre", "air", "mer", "strategique"] as const;
export const MILITARY_BRANCH_EFFECT_LABELS: Record<string, string> = {
  terre: "Terre",
  air: "Air",
  mer: "Mer",
  strategique: "Stratégique",
};

export function formatSubTypeTargetLabel(branch: string, subType: string | null): string {
  const branchLabel = MILITARY_BRANCH_EFFECT_LABELS[branch] ?? branch;
  if (!subType || subType.trim() === "") return `${branchLabel} — (tous)`;
  return `${branchLabel} — ${subType}`;
}
export function parseSubTypeTarget(value: string): { branch: string; subType: string | null } {
  const i = value.indexOf(SUB_TYPE_TARGET_SEP);
  if (i < 0) return { branch: value, subType: null };
  const branch = value.slice(0, i);
  const subType = value.slice(i + 1);
  return { branch, subType: subType === "" ? null : subType };
}

/** @deprecated Utiliser LAW_DEFINITIONS depuis `@/lib/laws` à la place. */
export const MOBILISATION_LEVELS: { key: string; label: string }[] = [
  { key: "level_1", label: "Démobilisation" },
  { key: "level_2", label: "Réserve Active" },
  { key: "level_3", label: "Mobilisation Partielle" },
  { key: "level_4", label: "Mobilisation Générale" },
  { key: "level_5", label: "Guerre Patriotique" },
];

/** @deprecated Utiliser getLawLevelLabel depuis `@/lib/laws` à la place. */
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
    if (subChoice === "limit_modifier_sub_type") return { effect_kind: "military_unit_limit_modifier_sub_type", effect_target: target, effect_subtype: null };
    if (subChoice === "limit_modifier_roster") return { effect_kind: "military_unit_limit_modifier_roster", effect_target: target, effect_subtype: null };
    return { effect_kind: "military_unit_extra", effect_target: target, effect_subtype: null };
  }
  if (category === "influence_modifier") {
    const kind =
      subChoice === "global"
        ? "influence_modifier_global"
        : subChoice === "gdp"
          ? "influence_modifier_gdp"
          : subChoice === "population"
            ? "influence_modifier_population"
            : subChoice === "hard_power"
              ? "influence_modifier_hard_power"
              : "influence_modifier_global";
    return { effect_kind: kind, effect_target: null, effect_subtype: null };
  }
  return { effect_kind: "", effect_target: null, effect_subtype: null };
}

/** Types de cible pour un effect_kind. */
export type EffectTargetType = "none" | "stat" | "budget_ministry" | "military_branch" | "roster_unit" | "military_sub_type" | "country";

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
  "military_unit_limit_modifier_sub_type",
  "military_unit_limit_modifier_roster",
  "influence_modifier_global",
  "influence_modifier_gdp",
  "influence_modifier_population",
  "influence_modifier_hard_power",
  "state_actions_grant",
  "relation_delta",
  "ideology_drift_germanic_monarchy",
  "ideology_drift_merina_monarchy",
  "ideology_drift_french_republicanism",
  "ideology_drift_mughal_republicanism",
  "ideology_drift_nilotique_cultism",
  "ideology_drift_satoiste_cultism",
  "ideology_snap_germanic_monarchy",
  "ideology_snap_merina_monarchy",
  "ideology_snap_french_republicanism",
  "ideology_snap_mughal_republicanism",
  "ideology_snap_nilotique_cultism",
  "ideology_snap_satoiste_cultism",
  "procuration_points_per_day",
  "recrutement_bonus_percent",
  "design_bonus_percent",
  "procuration_bonus_percent",
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
  military_unit_limit_modifier: { targetType: "military_branch", valueFormat: "integer_percent", label: "Modificateur de limites par branche (%)" },
  military_unit_limit_modifier_sub_type: { targetType: "military_sub_type", valueFormat: "integer_percent", label: "Modificateur de limites par sous-branche/type (%)" },
  military_unit_limit_modifier_roster: { targetType: "roster_unit", valueFormat: "integer_percent", label: "Modificateur de limites par unité (%)" },
  influence_modifier_global: { targetType: "none", valueFormat: "multiplier", label: "Modificateur d'influence (global)" },
  influence_modifier_gdp: { targetType: "none", valueFormat: "multiplier", label: "Modificateur d'influence (PIB)" },
  influence_modifier_population: { targetType: "none", valueFormat: "multiplier", label: "Modificateur d'influence (population)" },
  influence_modifier_hard_power: { targetType: "none", valueFormat: "multiplier", label: "Modificateur d'influence (Hard Power)" },
  state_actions_grant: { targetType: "none", valueFormat: "integer", label: "Actions d'État (octroi par tick)" },
  relation_delta: { targetType: "country", valueFormat: "raw", label: "Évolution relation bilatérale" },
  ideology_drift_germanic_monarchy: { targetType: "none", valueFormat: "raw", label: "Dérive idéologique (Monarchisme Germanique)" },
  ideology_drift_merina_monarchy: { targetType: "none", valueFormat: "raw", label: "Dérive idéologique (Monarchisme Mérinais)" },
  ideology_drift_french_republicanism: { targetType: "none", valueFormat: "raw", label: "Dérive idéologique (Républicanisme Français)" },
  ideology_drift_mughal_republicanism: { targetType: "none", valueFormat: "raw", label: "Dérive idéologique (Républicanisme Moghol)" },
  ideology_drift_nilotique_cultism: { targetType: "none", valueFormat: "raw", label: "Dérive idéologique (Cultisme Nilotique)" },
  ideology_drift_satoiste_cultism: { targetType: "none", valueFormat: "raw", label: "Dérive idéologique (Cultisme Satoiste)" },
  ideology_snap_germanic_monarchy: { targetType: "none", valueFormat: "raw", label: "Impulsion idéologique (Monarchisme Germanique)" },
  ideology_snap_merina_monarchy: { targetType: "none", valueFormat: "raw", label: "Impulsion idéologique (Monarchisme Mérinais)" },
  ideology_snap_french_republicanism: { targetType: "none", valueFormat: "raw", label: "Impulsion idéologique (Républicanisme Français)" },
  ideology_snap_mughal_republicanism: { targetType: "none", valueFormat: "raw", label: "Impulsion idéologique (Républicanisme Moghol)" },
  ideology_snap_nilotique_cultism: { targetType: "none", valueFormat: "raw", label: "Impulsion idéologique (Cultisme Nilotique)" },
  ideology_snap_satoiste_cultism: { targetType: "none", valueFormat: "raw", label: "Impulsion idéologique (Cultisme Satoiste)" },
  procuration_points_per_day: { targetType: "none", valueFormat: "integer", label: "Points de Procuration (par jour)" },
  recrutement_bonus_percent: { targetType: "none", valueFormat: "percent_display", label: "Bonus de Recrutement (%)" },
  design_bonus_percent: { targetType: "none", valueFormat: "percent_display", label: "Bonus de Design (%)" },
  procuration_bonus_percent: { targetType: "none", valueFormat: "percent_display", label: "Bonus de Procuration (%)" },
};

/** Libellé court pour effect_kind (affichage liste). Dérivé des métadonnées, avec fallback. */
export const EFFECT_KIND_LABELS: Record<string, string> = Object.fromEntries(
  ALL_EFFECT_KIND_IDS.map((id) => [id, EFFECT_KIND_META[id].label])
);

export type EffectKindOptionGroup = {
  label: string;
  options: Array<{ id: EffectKindId; label: string }>;
};

const EFFECT_KIND_GROUP_LABELS = {
  budget: "Budget",
  croissance: "Croissance",
  diplomatie: "Diplomatie",
  ideologie: "Idéologie",
  influence: "Influence",
  militaire: "Militaire",
  societe: "Société",
} as const;

const EFFECT_KIND_GROUP_BY_ID: Record<EffectKindId, keyof typeof EFFECT_KIND_GROUP_LABELS> = {
  gdp_growth_base: "croissance",
  gdp_growth_per_stat: "croissance",
  population_growth_base: "croissance",
  population_growth_per_stat: "croissance",
  stat_delta: "societe",
  budget_ministry_min_pct: "budget",
  budget_ministry_effect_multiplier: "budget",
  budget_allocation_cap: "budget",
  military_unit_extra: "militaire",
  military_unit_tech_rate: "militaire",
  military_unit_limit_modifier: "militaire",
  military_unit_limit_modifier_sub_type: "militaire",
  military_unit_limit_modifier_roster: "militaire",
  influence_modifier_global: "influence",
  influence_modifier_gdp: "influence",
  influence_modifier_population: "influence",
  influence_modifier_hard_power: "influence",
  state_actions_grant: "diplomatie",
  relation_delta: "diplomatie",
  ideology_drift_germanic_monarchy: "ideologie",
  ideology_drift_merina_monarchy: "ideologie",
  ideology_drift_french_republicanism: "ideologie",
  ideology_drift_mughal_republicanism: "ideologie",
  ideology_drift_nilotique_cultism: "ideologie",
  ideology_drift_satoiste_cultism: "ideologie",
  ideology_snap_germanic_monarchy: "ideologie",
  ideology_snap_merina_monarchy: "ideologie",
  ideology_snap_french_republicanism: "ideologie",
  ideology_snap_mughal_republicanism: "ideologie",
  ideology_snap_nilotique_cultism: "ideologie",
  ideology_snap_satoiste_cultism: "ideologie",
  procuration_points_per_day: "militaire",
  recrutement_bonus_percent: "militaire",
  design_bonus_percent: "militaire",
  procuration_bonus_percent: "militaire",
};

export function getEffectKindOptionGroups(allowedKinds?: readonly string[]): EffectKindOptionGroup[] {
  const allowedSet = allowedKinds ? new Set(allowedKinds) : null;
  const groups = new Map<keyof typeof EFFECT_KIND_GROUP_LABELS, Array<{ id: EffectKindId; label: string }>>();

  for (const id of ALL_EFFECT_KIND_IDS) {
    if (allowedSet && !allowedSet.has(id)) continue;
    const groupId = EFFECT_KIND_GROUP_BY_ID[id];
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId)!.push({
      id,
      label: EFFECT_KIND_LABELS[id] ?? id,
    });
  }

  return Array.from(groups.entries())
    .sort((a, b) => EFFECT_KIND_GROUP_LABELS[a[0]].localeCompare(EFFECT_KIND_GROUP_LABELS[b[0]], "fr"))
    .map(([groupId, options]) => ({
      label: EFFECT_KIND_GROUP_LABELS[groupId],
      options: [...options].sort((a, b) => a.label.localeCompare(b.label, "fr")),
    }));
}

/** Sets dérivés pour les formulaires (cible selon le kind). */
const _STAT = new Set<string>(["stat_delta", "gdp_growth_per_stat", "population_growth_per_stat"]);
const _BUDGET = new Set<string>(["budget_ministry_min_pct", "budget_ministry_effect_multiplier"]);
const _NONE = new Set<string>([
  "gdp_growth_base",
  "population_growth_base",
  "budget_allocation_cap",
  "state_actions_grant",
  "influence_modifier_global",
  "influence_modifier_gdp",
  "influence_modifier_population",
  "influence_modifier_hard_power",
  "ideology_drift_germanic_monarchy",
  "ideology_drift_merina_monarchy",
  "ideology_drift_french_republicanism",
  "ideology_drift_mughal_republicanism",
  "ideology_drift_nilotique_cultism",
  "ideology_drift_satoiste_cultism",
  "ideology_snap_germanic_monarchy",
  "ideology_snap_merina_monarchy",
  "ideology_snap_french_republicanism",
  "ideology_snap_mughal_republicanism",
  "ideology_snap_nilotique_cultism",
  "ideology_snap_satoiste_cultism",
  "procuration_points_per_day",
  "recrutement_bonus_percent",
  "design_bonus_percent",
  "procuration_bonus_percent",
]);
const _BRANCH = new Set<string>(["military_unit_limit_modifier"]);
const _ROSTER = new Set<string>(["military_unit_extra", "military_unit_tech_rate", "military_unit_limit_modifier_roster"]);
const _SUB_TYPE = new Set<string>(["military_unit_limit_modifier_sub_type"]);
const _COUNTRY = new Set<string>(["relation_delta"]);

export const EFFECT_KINDS_WITH_STAT_TARGET: ReadonlySet<string> = _STAT;
export const EFFECT_KINDS_WITH_BUDGET_TARGET: ReadonlySet<string> = _BUDGET;
export const EFFECT_KINDS_NO_TARGET: ReadonlySet<string> = _NONE;
export const EFFECT_KINDS_WITH_BRANCH_TARGET: ReadonlySet<string> = _BRANCH;
export const EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET: ReadonlySet<string> = _ROSTER;
export const EFFECT_KINDS_WITH_SUB_TYPE_TARGET: ReadonlySet<string> = _SUB_TYPE;
export const EFFECT_KINDS_WITH_COUNTRY_TARGET: ReadonlySet<string> = _COUNTRY;

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
      if (effectKind.startsWith("influence_modifier_")) {
        return {
          valueLabel: "% (bonus/malus)",
          valueStep: 1,
          displayToStored: (x) => 1 + x / 100,
          storedToDisplay: (x) => (Number(x) - 1) * 100,
        };
      }
      return {
        valueLabel: "Mult.",
        valueStep: 0.01,
        displayToStored: (x) => (100 + x) / 100,
        storedToDisplay: (x) => (x * 100 - 100),
      };
    case "integer":
      return {
        valueLabel: effectKind === "military_unit_tech_rate" || effectKind === "procuration_points_per_day" ? "Pts/jour" : "Extra",
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
export type GetEffectDescriptionOptions = {
  rosterUnitName?: (id: string) => string | null;
  countryName?: (id: string) => string | null;
};

export function getEffectDescription(e: CountryEffect | ResolvedEffect, options?: GetEffectDescriptionOptions): string {
  const valueStr = formatEffectValue(e.effect_kind, e.value);
  let targetLabel: string | null = null;
  if (e.effect_target) {
    if (e.effect_kind === "military_unit_extra" || e.effect_kind === "military_unit_tech_rate" || e.effect_kind === "military_unit_limit_modifier_roster")
      targetLabel = options?.rosterUnitName?.(e.effect_target) ?? e.effect_target;
    else if (e.effect_kind === "military_unit_limit_modifier_sub_type" && e.effect_target)
      targetLabel = (() => { const p = parseSubTypeTarget(e.effect_target); return formatSubTypeTargetLabel(p.branch, p.subType); })();
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
  if (e.effect_kind === "military_unit_limit_modifier" && targetLabel) return `Limites branche — ${targetLabel} : ${valueStr}`;
  if (e.effect_kind === "military_unit_limit_modifier_sub_type" && targetLabel) return `Limites sous-branche/type — ${targetLabel} : ${valueStr}`;
  if (e.effect_kind === "military_unit_limit_modifier_roster" && targetLabel) return `Limites unité — ${targetLabel} : ${valueStr}`;
  if (e.effect_kind === "influence_modifier_global") return `Modificateur influence (global) : ${valueStr}`;
  if (e.effect_kind === "influence_modifier_gdp") return `Modificateur influence (PIB) : ${valueStr}`;
  if (e.effect_kind === "influence_modifier_population") return `Modificateur influence (population) : ${valueStr}`;
  if (e.effect_kind === "influence_modifier_hard_power") return `Modificateur influence (Hard Power) : ${valueStr}`;
  if (e.effect_kind === "relation_delta" && e.effect_target) {
    const otherName = options?.countryName?.(e.effect_target) ?? e.effect_target;
    return `Relation bilatérale — ${otherName} : ${valueStr} par tick`;
  }
  if (e.effect_kind.startsWith("ideology_drift_")) {
    const id = e.effect_kind.replace("ideology_drift_", "") as IdeologyId;
    const label = IDEOLOGY_IDS.includes(id) ? IDEOLOGY_LABELS[id] : id;
    return `Dérive idéologique — ${label} : ${valueStr}`;
  }
  if (e.effect_kind.startsWith("ideology_snap_")) {
    const id = e.effect_kind.replace("ideology_snap_", "") as IdeologyId;
    const label = IDEOLOGY_IDS.includes(id) ? IDEOLOGY_LABELS[id] : id;
    return `Impulsion idéologique — ${label} : ${valueStr}`;
  }

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
  if (kind === "military_unit_limit_modifier" || kind === "military_unit_limit_modifier_sub_type" || kind === "military_unit_limit_modifier_roster") return `${Number(value) >= 0 ? "+" : ""}${Number(value)} %`;
  if (kind.startsWith("influence_modifier_")) {
    const pct = (Number(value) - 1) * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} %`;
  }
  if (kind === "relation_delta") return `${Number(value) >= 0 ? "+" : ""}${Number(value)}`;
  if (kind.startsWith("ideology_drift_") || kind.startsWith("ideology_snap_")) {
    return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}`;
  }
  if (kind === "procuration_points_per_day") return `${Number(value)} pts/jour`;
  if (kind === "recrutement_bonus_percent" || kind === "design_bonus_percent" || kind === "procuration_bonus_percent") {
    return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)} %`;
  }
  return String(value);
}

/** Limite max pour le nombre de jours des effets durables (formulaires + serveur). */
export const DURATION_DAYS_MAX = 100;

/** Normalise admin_effect_added (objet unique ou tableau) en tableau. Rétrocompat ancien format. */
export function normalizeAdminEffectsAdded(raw: unknown): AdminEffectAdded[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter(
      (e): e is AdminEffectAdded =>
        e != null && typeof e === "object" && typeof (e as Record<string, unknown>).name === "string" && typeof (e as Record<string, unknown>).effect_kind === "string"
    ) as AdminEffectAdded[];
  }
  if (typeof raw === "object" && typeof (raw as Record<string, unknown>).name === "string" && typeof (raw as Record<string, unknown>).effect_kind === "string") {
    return [raw as AdminEffectAdded];
  }
  return [];
}

export type FormatAdminEffectLabelLookups = {
  rosterUnits?: { id: string; name_fr: string }[];
  countries?: { id: string; name: string }[];
};

/** Libellé lisible pour un effet admin (demandes, Discord). Ex. "One Shot : Up Tech (Lance Roquette Multiple : +100 pts/jour)" */
export function formatAdminEffectLabel(
  effect: Pick<AdminEffectAdded, "name" | "effect_kind" | "effect_target" | "value" | "application">,
  lookups?: FormatAdminEffectLabelLookups
): string {
  const kind = effect.effect_kind;
  const valueStr = formatEffectValue(kind, Number(effect.value));
  let targetLabel = "";
  if (effect.effect_target) {
    if (EFFECT_KINDS_WITH_STAT_TARGET.has(kind)) targetLabel = STAT_LABELS[effect.effect_target as StatKey] ?? effect.effect_target;
    else if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(kind))
      targetLabel = getBudgetMinistryOptions().find((o) => o.key === effect.effect_target)?.label ?? effect.effect_target;
    else if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(kind)) targetLabel = MILITARY_BRANCH_EFFECT_LABELS[effect.effect_target] ?? effect.effect_target;
    else if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(kind))
      targetLabel = lookups?.rosterUnits?.find((u) => u.id === effect.effect_target)?.name_fr ?? effect.effect_target;
    else if (EFFECT_KINDS_WITH_COUNTRY_TARGET.has(kind)) targetLabel = lookups?.countries?.find((c) => c.id === effect.effect_target)?.name ?? effect.effect_target;
  }
  const part = targetLabel ? `${targetLabel} : ${valueStr}` : valueStr;
  const applicationLabel = effect.application === "immediate" ? "One Shot" : "Effet durable";
  return `${applicationLabel} : ${effect.name} (${part})`;
}

/**
 * Version courte (brève) pour Discord, surtout utile pour les demandes d'up.
 * Exemples : "Militarisme +1", "Véhicule Anti-Aérien // Nombre +1", "Drone MALE // Technologie +100 pts/jour".
 */
export function formatAdminEffectShortForDiscord(
  effect: Pick<AdminEffectAdded, "effect_kind" | "effect_target" | "value">,
  lookups?: FormatAdminEffectLabelLookups
): string {
  const kind = effect.effect_kind;
  const value = Number(effect.value);
  const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

  if (kind === "stat_delta" && effect.effect_target) {
    const statLabel = STAT_LABELS[effect.effect_target as StatKey] ?? effect.effect_target;
    return `${statLabel} ${signed(Math.round(value))}`;
  }

  if ((kind === "military_unit_extra" || kind === "military_unit_tech_rate") && effect.effect_target) {
    const unitLabel = lookups?.rosterUnits?.find((u) => u.id === effect.effect_target)?.name_fr ?? effect.effect_target;
    if (kind === "military_unit_extra") return `${unitLabel} // Nombre ${signed(Math.round(value))}`;
    return `${unitLabel} // Technologie ${signed(Math.round(value))} pts/jour`;
  }

  // Fallback : rester neutre, sans inventer une thématique.
  const valueStr = formatEffectValue(kind, value);
  if (effect.effect_target) return `${effect.effect_target} : ${valueStr}`;
  return valueStr;
}

/** True si l’effet doit s’afficher en vert (bonus). Minimum forcé = toujours rouge (dépense forcée).
 * Accepte indifféremment un CountryEffect complet ou un effet « résolu » minimal (effect_kind + value).
 */
export function isEffectDisplayPositive(
  e: Pick<CountryEffect, "effect_kind" | "value"> | CountryEffect
): boolean {
  if (e.effect_kind === "budget_ministry_min_pct") return false;
  if (e.effect_kind.startsWith("influence_modifier_")) return Number(e.value) > 1;
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

/** Durée restante affichée (jours, mises à jour ou permanent). */
export function formatDurationRemaining(e: CountryEffect): string {
  if (e.duration_kind === "permanent") return "Permanent";
  const n = e.duration_remaining;
  return e.duration_kind === "updates"
    ? `${n} mise${n > 1 ? "s" : ""} à jour`
    : `${n} jour${n > 1 ? "s" : ""}`;
}

/** Liste des ministères pour les dropdowns (clé + libellé). */
export function getBudgetMinistryOptions(): { key: string; label: string }[] {
  return BUDGET_MINISTRY_KEYS.map((key) => ({ key, label: BUDGET_MINISTRY_LABELS[key] ?? key }));
}

/** Cible par défaut pour un effect_kind (pour formulaire unifié par kind). */
export function getDefaultTargetForKind(
  effectKind: string,
  rosterUnitIds?: string[],
  countryIds?: string[],
  subTypeTargetKeys?: string[]
): string | null {
  if (EFFECT_KINDS_WITH_STAT_TARGET.has(effectKind)) return STAT_KEYS[0];
  if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(effectKind)) return getBudgetMinistryOptions()[0]?.key ?? BUDGET_MINISTRY_KEYS[0];
  if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(effectKind)) return MILITARY_BRANCH_EFFECT_IDS[0];
  if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectKind)) return rosterUnitIds?.[0] ?? null;
  if (EFFECT_KINDS_WITH_SUB_TYPE_TARGET.has(effectKind)) return subTypeTargetKeys?.[0] ?? MILITARY_BRANCH_EFFECT_IDS[0] + SUB_TYPE_TARGET_SEP;
  if (EFFECT_KINDS_WITH_COUNTRY_TARGET.has(effectKind)) return countryIds?.[0] ?? null;
  return null;
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
  if (e.effect_kind === "military_unit_limit_modifier_sub_type") return { category: "military_unit", subChoice: "limit_modifier_sub_type", target: e.effect_target };
  if (e.effect_kind === "military_unit_limit_modifier_roster") return { category: "military_unit", subChoice: "limit_modifier_roster", target: e.effect_target };
  if (e.effect_kind === "influence_modifier_global") return { category: "influence_modifier", subChoice: "global", target: null };
  if (e.effect_kind === "influence_modifier_gdp") return { category: "influence_modifier", subChoice: "gdp", target: null };
  if (e.effect_kind === "influence_modifier_population") return { category: "influence_modifier", subChoice: "population", target: null };
  if (e.effect_kind === "influence_modifier_hard_power") return { category: "influence_modifier", subChoice: "hard_power", target: null };
  if (e.effect_kind === "relation_delta") return { category: "gdp_growth", subChoice: "base", target: e.effect_target };
  return { category: "gdp_growth", subChoice: "base", target: null };
}

/** Effet résolu (country_effects ou agrégé depuis global/mobilisation, idéologie). Compatible avec les helpers. */
export type ResolvedEffect = {
  effect_kind: string;
  effect_target: string | null;
  value: number;
  duration_remaining?: number;
  /** Présent pour les effets issus de country_effects ; 'permanent' = n'expire jamais. */
  duration_kind?: string;
  /** Source de l'effet pour affichage (ex. Généralités). */
  source?: "country" | "law" | "global" | "perk" | "ai" | "ideology";
  /** Libellé affiché (ex. "Avantage : Complexe militaro-industriel"). */
  sourceLabel?: string;
};

/** Contexte pour résoudre les effets applicables à un pays (sources enregistrées). */
export type EffectResolutionContext = {
  countryId: string;
  countryEffects: CountryEffect[];
  /** Effets agrégés de toutes les lois (mobilisation + 4 lois sectorielles) pour le niveau courant du pays. */
  lawLevelEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  /** @deprecated Alias pour lawLevelEffects, conservé pour rétrocompat. Utiliser lawLevelEffects. */
  mobilisationLevelEffects?: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  globalGrowthEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  /** Statut IA du pays : 'major' | 'minor' | null. Si fourni, les effets IA correspondants sont inclus. */
  ai_status?: string | null;
  /** Effets appliqués aux pays IA majeurs (règle ai_major_effects). */
  aiMajorEffects?: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  /** Effets appliqués aux pays IA mineurs (règle ai_minor_effects). */
  aiMinorEffects?: Array<{ effect_kind: string; effect_target: string | null; value: number; sourceLabel?: string }>;
  /** Effets des avantages actifs pour ce pays (précalculés côté page). */
  perkEffects?: Array<{ effect_kind: string; effect_target: string | null; value: number; sourceLabel?: string }>;
  /** Scores idéologie du pays (6 idéologies, somme 100). Pour les effets proportionnels par idéologie. */
  ideologyScores?: Record<string, number>;
  /** Règle ideology_effects : liste d'entrées { ideology_id, effect_kind, effect_target, value } (value = effet à 100 %). */
  ideologyEffectsConfig?: Array<{ ideology_id: string; effect_kind: string; effect_target: string | null; value: number }>;
};

/** Pseudo-durée pour les effets globaux/mobilisation (toujours actifs). */
const PERMANENT_DURATION = 1;

function countryEffectsSource(ctx: EffectResolutionContext): ResolvedEffect[] {
  return ctx.countryEffects.map((e) => ({
    effect_kind: e.effect_kind,
    effect_target: e.effect_target,
    value: Number(e.value),
    duration_remaining: e.duration_remaining,
    duration_kind: e.duration_kind,
    source: "country" as const,
    sourceLabel: e.name || "Effet actif",
  }));
}

function lawLevelEffectsSource(ctx: EffectResolutionContext): ResolvedEffect[] {
  const effects = ctx.lawLevelEffects ?? ctx.mobilisationLevelEffects ?? [];
  return effects.map((e) => ({
    effect_kind: e.effect_kind,
    effect_target: e.effect_target ?? null,
    value: Number(e.value),
    duration_remaining: PERMANENT_DURATION,
    source: "law" as const,
    sourceLabel: "Loi",
  }));
}

function globalEffectsSource(ctx: EffectResolutionContext): ResolvedEffect[] {
  return ctx.globalGrowthEffects.map((e) => ({
    effect_kind: e.effect_kind,
    effect_target: e.effect_target ?? null,
    value: Number(e.value),
    duration_remaining: PERMANENT_DURATION,
    source: "global" as const,
    sourceLabel: "Global",
  }));
}

function aiEffectsSource(ctx: EffectResolutionContext): ResolvedEffect[] {
  if (ctx.ai_status === "major" && ctx.aiMajorEffects?.length) {
    return ctx.aiMajorEffects.map((e) => ({
      effect_kind: e.effect_kind,
      effect_target: e.effect_target ?? null,
      value: Number(e.value),
      duration_remaining: PERMANENT_DURATION,
      source: "ai" as const,
      sourceLabel: "IA",
    }));
  }
  if (ctx.ai_status === "minor" && ctx.aiMinorEffects?.length) {
    return ctx.aiMinorEffects.map((e) => ({
      effect_kind: e.effect_kind,
      effect_target: e.effect_target ?? null,
      value: Number(e.value),
      duration_remaining: PERMANENT_DURATION,
      source: "ai" as const,
      sourceLabel: "IA",
    }));
  }
  return [];
}

function perkEffectsSource(ctx: EffectResolutionContext): ResolvedEffect[] {
  const effects = ctx.perkEffects ?? [];
  return effects.map((e) => ({
    effect_kind: e.effect_kind,
    effect_target: e.effect_target ?? null,
    value: Number(e.value),
    duration_remaining: PERMANENT_DURATION,
    duration_kind: "permanent",
    source: "perk" as const,
    sourceLabel: e.sourceLabel ?? "Avantage",
  }));
}

/** Nombre de décimales pour les valeurs d’effets idéologiques (lisibilité et filtrage des résidus). */
const IDEOLOGY_EFFECT_DECIMALS = 4;

function ideologyEffectsSource(ctx: EffectResolutionContext): ResolvedEffect[] {
  const scores = ctx.ideologyScores;
  const config = ctx.ideologyEffectsConfig;
  if (!scores || !config?.length) return [];
  const out: ResolvedEffect[] = [];
  const factor = 10 ** IDEOLOGY_EFFECT_DECIMALS;
  for (const entry of config) {
    if (!entry || typeof entry.effect_kind !== "string" || typeof entry.value !== "number") continue;
    const id = entry.ideology_id as IdeologyId;
    if (!IDEOLOGY_IDS.includes(id)) continue;
    const score = Number(scores[id]);
    if (!Number.isFinite(score)) continue;
    const ratio = score / 100;
    const meta = EFFECT_KIND_META[entry.effect_kind as EffectKindId];
    const isMultiplier = meta?.valueFormat === "multiplier";
    const rawValue = isMultiplier
      ? 1 + (entry.value - 1) * ratio
      : entry.value * ratio;
    const effectiveValue = Math.round(rawValue * factor) / factor;
    if (isMultiplier ? effectiveValue === 1 : effectiveValue === 0) continue;
    out.push({
      effect_kind: entry.effect_kind,
      effect_target: entry.effect_target ?? null,
      value: effectiveValue,
      duration_remaining: PERMANENT_DURATION,
      source: "ideology" as const,
      sourceLabel: IDEOLOGY_LABELS[id] ?? `Idéologie : ${id}`,
    });
  }
  return out;
}

/** Registry de sources d'effets. Ajouter une source ici pour un nouvel « endroit » sans toucher aux consommateurs. */
export const EFFECT_SOURCES: Array<(ctx: EffectResolutionContext) => ResolvedEffect[]> = [
  countryEffectsSource,
  lawLevelEffectsSource,
  globalEffectsSource,
  perkEffectsSource,
  aiEffectsSource,
  ideologyEffectsSource,
];

/** Agrège les effets de toutes les sources pour un pays. Utiliser cette liste pour getForcedMinPcts, getAllocationCapPercent, getUnitExtraEffectSum, getLimitModifierPercent, expectedNextTick. */
export function getEffectsForCountry(context: EffectResolutionContext): ResolvedEffect[] {
  const out: ResolvedEffect[] = [];
  for (const source of EFFECT_SOURCES) {
    out.push(...source(context));
  }
  return out;
}

/** Effets à passer à getExpectedNextTick uniquement (country_effects + lois + idéologie). Exclut global_growth_effects pour éviter de les compter deux fois (déjà dans getGlobalGrowthRates). */
export function getEffectsForCountryTickRates(context: EffectResolutionContext): ResolvedEffect[] {
  return [
    ...countryEffectsSource(context),
    ...lawLevelEffectsSource(context),
    ...ideologyEffectsSource(context),
  ];
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

function isEffectActiveByDuration(e: { duration_remaining?: number; duration_kind?: string }): boolean {
  return e.duration_kind === "permanent" || (e.duration_remaining ?? 0) > 0;
}

/** Somme des bonus/malus extra pour une unité (effets actifs military_unit_extra). */
export function getUnitExtraEffectSum(
  effects: Array<{ effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number; duration_kind?: string }>,
  rosterUnitId: string
): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "military_unit_extra" && e.effect_target === rosterUnitId && isEffectActiveByDuration(e)) {
      sum += Number(e.value);
    }
  }
  return sum;
}

/** Somme des modificateurs de limite (%) pour une branche (effets military_unit_limit_modifier). */
export function getLimitModifierPercent(
  effects: Array<{ effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number; duration_kind?: string }>,
  branch: string
): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "military_unit_limit_modifier" && e.effect_target === branch && isEffectActiveByDuration(e)) {
      sum += Number(e.value);
    }
  }
  return sum;
}

/** Somme des modificateurs de limite (%) pour une sous-branche/type (effets military_unit_limit_modifier_sub_type). effect_target = "branch:sub_type". */
export function getSubTypeLimitModifierPercent(
  effects: Array<{ effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number; duration_kind?: string }>,
  branch: string,
  subType: string | null
): number {
  const key = `${branch}${SUB_TYPE_TARGET_SEP}${subType ?? ""}`;
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "military_unit_limit_modifier_sub_type" && e.effect_target === key && isEffectActiveByDuration(e)) {
      sum += Number(e.value);
    }
  }
  return sum;
}

/** Somme des modificateurs de limite (%) pour une unité roster (effets military_unit_limit_modifier_roster). */
export function getRosterUnitLimitModifierPercent(
  effects: Array<{ effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number; duration_kind?: string }>,
  rosterUnitId: string
): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "military_unit_limit_modifier_roster" && e.effect_target === rosterUnitId && isEffectActiveByDuration(e)) {
      sum += Number(e.value);
    }
  }
  return sum;
}

/** Modificateurs d'influence (multiplier stocké : 1 = 100 %, 1.2 = 120 %). Pour application dans computeInfluence. */
export type InfluenceModifiers = {
  global: number;
  gdp: number;
  population: number;
  hard_power: number;
};

const DEFAULT_INFLUENCE_MODIFIERS: InfluenceModifiers = {
  global: 1,
  gdp: 1,
  population: 1,
  hard_power: 1,
};

/** Produit des multiplicateurs d'influence à partir des effets (value = multiplicateur stocké). */
export function getInfluenceModifiersFromEffects(
  effects: Array<{ effect_kind: string; value: number; duration_remaining?: number; duration_kind?: string }>,
  isEffectActive: (e: { duration_remaining?: number; duration_kind?: string }) => boolean
): InfluenceModifiers {
  const out = { ...DEFAULT_INFLUENCE_MODIFIERS };
  for (const e of effects) {
    if (!isEffectActive(e)) continue;
    const mult = Number(e.value);
    if (e.effect_kind === "influence_modifier_global") out.global *= mult;
    else if (e.effect_kind === "influence_modifier_gdp") out.gdp *= mult;
    else if (e.effect_kind === "influence_modifier_population") out.population *= mult;
    else if (e.effect_kind === "influence_modifier_hard_power") out.hard_power *= mult;
  }
  return out;
}

type CountryEffectRow = {
  country_id: string;
  effect_kind: string;
  effect_target: string | null;
  value: number;
  duration_remaining?: number;
  duration_kind?: string;
};

type CountryLawRow = { country_id: string; law_key: string; score: number };

/**
 * Construit la map countryId → InfluenceModifiers pour une liste de pays.
 * Utilise `country_laws` et le registre centralisé des lois pour résoudre les effets de toutes les lois.
 */
export function getInfluenceModifiersByCountry(
  countryIds: string[],
  countryEffectsRows: CountryEffectRow[],
  countryLawRows: CountryLawRow[],
  ruleParametersByKey: Record<string, { value: unknown }>,
  globalGrowthEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>
): Map<string, InfluenceModifiers> {
  const lawsByCountry = new Map<string, LawRow[]>();
  for (const r of countryLawRows) {
    const list = lawsByCountry.get(r.country_id) ?? [];
    list.push({ country_id: r.country_id, law_key: r.law_key, score: r.score, target_score: 0 });
    lawsByCountry.set(r.country_id, list);
  }
  const effectsByCountry = new Map<string, CountryEffectRow[]>();
  for (const r of countryEffectsRows) {
    const list = effectsByCountry.get(r.country_id) ?? [];
    list.push(r);
    effectsByCountry.set(r.country_id, list);
  }
  const out = new Map<string, InfluenceModifiers>();
  const isActive = (e: { duration_remaining?: number; duration_kind?: string }) =>
    e.duration_kind === "permanent" || (e.duration_remaining ?? 0) > 0;
  for (const countryId of countryIds) {
    const lawRows = lawsByCountry.get(countryId) ?? [];
    const lawEffects = resolveAllLawEffectsForCountry(lawRows, ruleParametersByKey);
    const countryEffects = (effectsByCountry.get(countryId) ?? []).map((e) => ({
      ...e,
      id: "",
      name: "",
      effect_subtype: null,
      duration_kind: (e.duration_kind ?? "days") as "days" | "updates" | "permanent",
      created_at: "",
      updated_at: "",
    })) as CountryEffect[];
    const context: EffectResolutionContext = {
      countryId,
      countryEffects,
      lawLevelEffects: lawEffects,
      globalGrowthEffects,
    };
    const effects = getEffectsForCountry(context);
    const mods = getInfluenceModifiersFromEffects(effects, isActive);
    out.set(countryId, mods);
  }
  return out;
}
