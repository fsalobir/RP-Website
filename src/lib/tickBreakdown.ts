/**
 * Breakdown détaillé de tous les facteurs et effets appliqués à un pays au passage de jour.
 * Utilisé par l’onglet Debug (admin) et préparé pour le futur Rapport du Cabinet.
 */

import type { CountryEffect } from "@/types/database";
import {
  getEffectDescription,
  getEffectsForCountry,
  getForcedMinPcts,
  getAllocationCapPercent,
  getLimitModifierPercent,
  getUnitExtraEffectSum,
  STAT_LABELS,
  type ResolvedEffect,
  type StatKey,
} from "@/lib/countryEffects";
import { BUDGET_MINISTRY_LABELS } from "@/lib/ruleParameters";
import {
  getExpectedNextTick,
  type CountrySnapshot,
  type BudgetPcts,
  type WorldAverages,
  type ExpectedNextTickResult,
} from "@/lib/expectedNextTick";

export type { CountrySnapshot, BudgetPcts, WorldAverages, ExpectedNextTickResult };

export type TickBreakdownContribution = {
  label: string;
  value: number;
  tooltip?: string;
};

export type TickBreakdownRateCategory = {
  contributions: TickBreakdownContribution[];
  totalRate: number;
  expectedValue: number;
};

export type TickBreakdownStatCategory = {
  contributions: TickBreakdownContribution[];
  totalDelta: number;
  expectedValue: number;
};

export type TickBreakdownConstraints = {
  forcedMinPcts: Array<{ label: string; value: number }>;
  allocationCapPercent: number;
  limitModifierByBranch: Array<{ branch: string; label: string; percent: number }>;
  /** Toutes les unités roster avec la somme des bonus/malus extra (effets globaux + actifs + mobilisation). */
  unitExtras: Array<{ unitLabel: string; extra: number }>;
};

/** Liste exhaustive de tous les effets globaux (règles) qui s’appliquent au pays. */
export type TickBreakdownGlobalEffectLine = { description: string };

/** Liste exhaustive des effets actifs (country_effects) qui s’appliquent. */
export type TickBreakdownActiveEffectLine = { description: string };

/** Liste exhaustive des effets de mobilisation qui s’appliquent. */
export type TickBreakdownMobilisationEffectLine = { description: string };

export type TickBreakdown = {
  population: TickBreakdownRateCategory;
  gdp: TickBreakdownRateCategory;
  militarism: TickBreakdownStatCategory;
  industry: TickBreakdownStatCategory;
  science: TickBreakdownStatCategory;
  stability: TickBreakdownStatCategory;
  constraints: TickBreakdownConstraints;
  /** Liste exhaustive : tous les effets globaux (règles) appliqués. */
  globalEffectsExhaustive: TickBreakdownGlobalEffectLine[];
  /** Liste exhaustive : tous les effets actifs (country_effects) appliqués. */
  activeEffectsExhaustive: TickBreakdownActiveEffectLine[];
  /** Liste exhaustive : tous les effets du niveau de mobilisation appliqués. */
  mobilisationEffectsExhaustive: TickBreakdownMobilisationEffectLine[];
};

type EffectLike = { effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number };

function growthValue(val: number): number {
  return Math.abs(val) > 1 ? val / 100 : val;
}

function addContribution(
  list: TickBreakdownContribution[],
  label: string,
  value: number,
  tooltip?: string
) {
  if (Math.abs(value) < 1e-9) return;
  list.push({ label, value, tooltip });
}

/** Construit le texte du tooltip pour une contribution avec gravité (une ligne par bloc, horizontal). */
function formatGravityTooltip(
  base: number,
  applied: number,
  worldAvg: number,
  countryVal: number,
  gravityPct: number,
): string {
  if (worldAvg === 0) {
    return `Base : ${base.toFixed(3)} point(s). Pas de gravité (moyenne = 0).`;
  }
  const k = gravityPct / 100;
  const ratio = (worldAvg - countryVal) / worldAvg;
  const factor = base >= 0 ? 1 + k * ratio : 1 + k * (-ratio);
  const factorClamped = Math.max(0.1, Math.min(2, factor));
  const appliedFromFormula = base * factorClamped;
  const formulaPart =
    base >= 0
      ? `1 + (${gravityPct}/100) × (moyenne − pays) / moyenne`
      : `1 + (${gravityPct}/100) × (pays − moyenne) / moyenne`;
  return [
    `Base (sans gravité) : ${base.toFixed(3)} point(s)`,
    `Gravité : moyenne ${worldAvg.toFixed(2)} · pays ${countryVal.toFixed(2)} · param. ${gravityPct} %`,
    `Facteur = ${formulaPart} = ${factorClamped.toFixed(2)}`,
    `Résultat : ${base.toFixed(3)} × ${factorClamped.toFixed(2)} = ${appliedFromFormula.toFixed(3)} point(s)`,
  ].join("\n");
}

export type TickBreakdownContext = {
  countryEffects: CountryEffect[];
  mobilisationLevelEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  globalGrowthEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
};

export type GetTickBreakdownOptions = {
  mobilisationLevelName?: string;
  rosterUnitName?: (id: string) => string | null;
  /** Liste des unités roster (id, name_fr) pour afficher les extra par unité dans les contraintes. */
  rosterUnitsForExtra?: Array<{ id: string; name_fr: string }>;
};

const MILITARY_BRANCHES = ["terre", "air", "mer", "strategique"] as const;
const BRANCH_LABELS: Record<string, string> = {
  terre: "Terre",
  air: "Air",
  mer: "Mer",
  strategique: "Stratégique",
};

/** Construit le breakdown détaillé et appelle getExpectedNextTick pour les totaux et valeurs attendues. */
export function getTickBreakdown(
  country: CountrySnapshot,
  pcts: BudgetPcts,
  rulesByKey: Record<string, { value: unknown }>,
  worldAvgs: WorldAverages,
  context: TickBreakdownContext,
  options: GetTickBreakdownOptions = {}
): { breakdown: TickBreakdown; expected: ExpectedNextTickResult } {
  const { mobilisationLevelName = "—", rosterUnitName, rosterUnitsForExtra = [] } = options;
  const mil = country.militarism ?? 0;
  const ind = country.industry ?? 0;
  const sci = country.science ?? 0;
  const stab = country.stability ?? 0;

  const resolvedEffects = getEffectsForCountry({
    countryId: "",
    countryEffects: context.countryEffects,
    mobilisationLevelEffects: context.mobilisationLevelEffects,
    globalGrowthEffects: context.globalGrowthEffects,
  });

  const expected = getExpectedNextTick(
    country,
    pcts,
    rulesByKey,
    worldAvgs,
    resolvedEffects
  );

  const popContributions: TickBreakdownContribution[] = [];
  const gdpContributions: TickBreakdownContribution[] = [];
  const milContributions: TickBreakdownContribution[] = [];
  const indContributions: TickBreakdownContribution[] = [];
  const sciContributions: TickBreakdownContribution[] = [];
  const stabContributions: TickBreakdownContribution[] = [];

  // 1) Global growth effects (from rules)
  const globalArr = context.globalGrowthEffects;
  for (const e of globalArr) {
    const kind = e.effect_kind;
    const target = e.effect_target;
    const value = Number(e.value);
    if (Number.isNaN(value)) continue;
    const statVal = target === "militarism" ? mil : target === "industry" ? ind : target === "science" ? sci : target === "stability" ? stab : 0;
    const statLabel = target ? (STAT_LABELS[target as StatKey] ?? target) : null;

    if (kind === "population_growth_base") {
      const v = growthValue(value);
      addContribution(popContributions, "Croissance globale (base)", v, "population_growth_base");
    } else if (kind === "population_growth_per_stat" && statLabel) {
      const v = growthValue(value) * statVal;
      addContribution(popContributions, `Croissance globale (par stat – ${statLabel})`, v, "population_growth_per_stat");
    } else if (kind === "gdp_growth_base") {
      const v = growthValue(value);
      addContribution(gdpContributions, "Croissance globale (base)", v, "gdp_growth_base");
    } else if (kind === "gdp_growth_per_stat" && statLabel) {
      const v = growthValue(value) * statVal;
      addContribution(gdpContributions, `Croissance globale (par stat – ${statLabel})`, v, "gdp_growth_per_stat");
    } else if (kind === "stat_delta" && target && statLabel) {
      const list = target === "militarism" ? milContributions : target === "industry" ? indContributions : target === "science" ? sciContributions : stabContributions;
      addContribution(list, `Stat globale – ${statLabel}`, value, "stat_delta");
    }
  }

  // 2) Country effects (effets actifs)
  const effectDescOpts = rosterUnitName ? { rosterUnitName } : undefined;
  for (const e of context.countryEffects) {
    if (e.duration_remaining != null && e.duration_remaining <= 0) continue;
    const label = `Effet actif : ${getEffectDescription(e, effectDescOpts)}`;
    addEffectContributions(e, label, mil, ind, sci, stab, popContributions, gdpContributions, milContributions, indContributions, sciContributions, stabContributions);
  }

  // 3) Mobilisation level effects
  const mobPrefix = `Mobilisation (${mobilisationLevelName})`;
  for (const e of context.mobilisationLevelEffects) {
    const resolved: ResolvedEffect = { effect_kind: e.effect_kind, effect_target: e.effect_target, value: e.value, duration_remaining: 1 };
    const label = `${mobPrefix} : ${getEffectDescription(resolved, effectDescOpts)}`;
    addEffectContributions(resolved, label, mil, ind, sci, stab, popContributions, gdpContributions, milContributions, indContributions, sciContributions, stabContributions);
  }

  // 4) Budget (from expected.inputs – already per ministry with gravity)
  for (const [name, val] of Object.entries(expected.inputs.budget_pop_sources)) {
    addContribution(popContributions, `Ministère ${name}`, val, "budget");
  }
  for (const [name, val] of Object.entries(expected.inputs.budget_gdp_sources)) {
    addContribution(gdpContributions, `Ministère ${name}`, val, "budget");
  }
  const milGravity = expected.inputs.budget_mil_gravity_info;
  for (const [name, val] of Object.entries(expected.inputs.budget_mil_sources)) {
    const g = milGravity?.[name];
    const tooltip = g
      ? formatGravityTooltip(g.base, val, g.worldAvg, g.countryVal, g.gravityPct)
      : undefined;
    addContribution(milContributions, `Ministère ${name}`, val, tooltip);
  }
  const indGravity = expected.inputs.budget_ind_gravity_info;
  for (const [name, val] of Object.entries(expected.inputs.budget_ind_sources)) {
    const g = indGravity?.[name];
    const tooltip = g
      ? formatGravityTooltip(g.base, val, g.worldAvg, g.countryVal, g.gravityPct)
      : undefined;
    addContribution(indContributions, `Ministère ${name}`, val, tooltip);
  }
  const sciGravity = expected.inputs.budget_sci_gravity_info;
  for (const [name, val] of Object.entries(expected.inputs.budget_sci_sources)) {
    const g = sciGravity?.[name];
    const tooltip = g
      ? formatGravityTooltip(g.base, val, g.worldAvg, g.countryVal, g.gravityPct)
      : undefined;
    addContribution(sciContributions, `Ministère ${name}`, val, tooltip);
  }
  for (const [name, val] of Object.entries(expected.inputs.budget_stab_sources)) {
    addContribution(stabContributions, `Ministère ${name}`, val, "budget");
  }

  const forcedMinPcts = getForcedMinPcts(resolvedEffects);
  const allocationCap = getAllocationCapPercent(resolvedEffects);
  const forcedMinList = Object.entries(forcedMinPcts)
    .filter(([, v]) => v > 0)
    .map(([pctKey, value]) => ({
      label: BUDGET_MINISTRY_LABELS[pctKey.replace(/^pct_/, "budget_")] ?? pctKey,
      value,
    }));

  const limitModifierByBranch = MILITARY_BRANCHES.map((branch) => ({
    branch,
    label: BRANCH_LABELS[branch] ?? branch,
    percent: getLimitModifierPercent(resolvedEffects, branch),
  })).filter((x) => Math.abs(x.percent) > 1e-9);

  /** Toutes les unités avec leur somme extra (globaux + actifs + mobilisation) — liste exhaustive. */
  const unitExtras = rosterUnitsForExtra
    .map((u) => ({ unitLabel: u.name_fr, extra: getUnitExtraEffectSum(resolvedEffects, u.id) }));

  /** Effets déjà détaillés dans les blocs Population / PIB / Stats : ne pas les répéter dans "Autres effets". */
  const effectKindsAlreadyInBreakdown = new Set([
    "population_growth_base",
    "population_growth_per_stat",
    "gdp_growth_base",
    "gdp_growth_per_stat",
    "stat_delta",
  ]);

  const globalEffectsExhaustive: TickBreakdownGlobalEffectLine[] = globalArr
    .filter((e) => !effectKindsAlreadyInBreakdown.has(e.effect_kind))
    .map((e) => {
      const resolved: ResolvedEffect = {
        effect_kind: e.effect_kind,
        effect_target: e.effect_target ?? null,
        value: Number(e.value),
        duration_remaining: 1,
      };
      return { description: getEffectDescription(resolved, effectDescOpts) };
    });

  const activeEffectsExhaustive: TickBreakdownActiveEffectLine[] = context.countryEffects
    .filter((e) => e.duration_remaining != null && e.duration_remaining > 0 && !effectKindsAlreadyInBreakdown.has(e.effect_kind))
    .map((e) => ({ description: getEffectDescription(e, effectDescOpts) }));

  const mobilisationEffectsExhaustive: TickBreakdownMobilisationEffectLine[] = context.mobilisationLevelEffects
    .filter((e) => !effectKindsAlreadyInBreakdown.has(e.effect_kind))
    .map((e) => {
      const resolved: ResolvedEffect = {
        effect_kind: e.effect_kind,
        effect_target: e.effect_target ?? null,
        value: e.value,
        duration_remaining: 1,
      };
      return { description: getEffectDescription(resolved, effectDescOpts) };
    });

  const breakdown: TickBreakdown = {
    population: {
      contributions: popContributions,
      totalRate: expected.inputs.pop_total_rate,
      expectedValue: expected.population,
    },
    gdp: {
      contributions: gdpContributions,
      totalRate: expected.inputs.gdp_total_rate,
      expectedValue: expected.gdp,
    },
    militarism: {
      contributions: milContributions,
      totalDelta: expected.inputs.delta_mil + expected.inputs.budget_mil,
      expectedValue: expected.militarism,
    },
    industry: {
      contributions: indContributions,
      totalDelta: expected.inputs.delta_ind + expected.inputs.budget_ind,
      expectedValue: expected.industry,
    },
    science: {
      contributions: sciContributions,
      totalDelta: expected.inputs.delta_sci + expected.inputs.budget_sci,
      expectedValue: expected.science,
    },
    stability: {
      contributions: stabContributions,
      totalDelta: expected.inputs.delta_stab + expected.inputs.budget_stab,
      expectedValue: expected.stability,
    },
    constraints: {
      forcedMinPcts: forcedMinList,
      allocationCapPercent: allocationCap,
      limitModifierByBranch,
      unitExtras,
    },
    globalEffectsExhaustive,
    activeEffectsExhaustive,
    mobilisationEffectsExhaustive,
  };

  return { breakdown, expected };
}

function addEffectContributions(
  e: EffectLike,
  label: string,
  mil: number,
  ind: number,
  sci: number,
  stab: number,
  popContributions: TickBreakdownContribution[],
  gdpContributions: TickBreakdownContribution[],
  milContributions: TickBreakdownContribution[],
  indContributions: TickBreakdownContribution[],
  sciContributions: TickBreakdownContribution[],
  stabContributions: TickBreakdownContribution[]
) {
  const kind = e.effect_kind;
  const target = e.effect_target;
  const value = Number(e.value);
  const statVal = target === "militarism" ? mil : target === "industry" ? ind : target === "science" ? sci : target === "stability" ? stab : 0;

  if (kind === "population_growth_base") {
    addContribution(popContributions, label, growthValue(value));
  } else if (kind === "population_growth_per_stat") {
    addContribution(popContributions, label, growthValue(value) * statVal);
  } else if (kind === "gdp_growth_base") {
    addContribution(gdpContributions, label, growthValue(value));
  } else if (kind === "gdp_growth_per_stat") {
    addContribution(gdpContributions, label, growthValue(value) * statVal);
  } else if (kind === "stat_delta" && target) {
    const list = target === "militarism" ? milContributions : target === "industry" ? indContributions : target === "science" ? sciContributions : stabContributions;
    addContribution(list, label, value);
  }
}
