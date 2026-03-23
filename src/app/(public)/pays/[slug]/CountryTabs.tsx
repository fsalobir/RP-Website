"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Country } from "@/types/database";
import type { MilitaryBranch } from "@/types/database";
import type { CountryBudget } from "@/types/database";
import type { CountryEffect } from "@/types/database";
import type { CountryUpdateLog } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import {
  ALL_EFFECT_KIND_IDS,
  DURATION_DAYS_MAX,
  getDefaultTargetForKind,
  getEffectKindValueHelper,
  getForcedMinPcts,
  getAllocationCapPercent,
  budgetKeyToPctKey,
  getLimitModifierPercent,
  getEffectsForCountry,
  getEffectsForCountryTickRates,
} from "@/lib/countryEffects";
import { resolveAllLawEffectsForCountry, getLawEffectsForLevel, getLawLevelKeyFromScore, getLawLevelLabel, LAW_DEFINITIONS, type CountryLawRow } from "@/lib/laws";
import { getTickBreakdown } from "@/lib/tickBreakdown";
import { saveMilitaryUnit } from "./actions";
import type { RosterRowByBranch } from "./countryTabsTypes";
import type { FoggedRoster } from "@/lib/intelFog";
import type { InfluenceResult } from "@/lib/influence";
import { computeHardPowerByCountry, type HardPowerByBranch } from "@/lib/hardPower";
import { CountryTabGeneral } from "./CountryTabGeneral";
import { CountryTabMilitary } from "./CountryTabMilitary";
import { CountryTabPerks } from "./CountryTabPerks";
import { CountryTabBudget } from "./CountryTabBudget";
import { CountryTabDebug } from "./CountryTabDebug";
import { CountryTabCabinet } from "./CountryTabCabinet";
import { CountryTabStateActions } from "./CountryTabStateActions";
import { CountryTabLaws } from "./CountryTabLaws";
import { CountryTabEtatMajor } from "./CountryTabEtatMajor";
import { InfoTooltipWithWikiLink } from "@/components/ui/InfoTooltipWithWikiLink";
/** Subset of CountryEtatMajorFocus used by the page (only the 4 focus roster ids). */
export type EtatMajorFocusForTabs = Pick<
  import("@/types/database").CountryEtatMajorFocus,
  "design_roster_unit_id" | "recrutement_roster_unit_id" | "procuration_roster_unit_id" | "stock_roster_unit_id"
> | null;

const BUDGET_MINISTRIES = [
  { key: "pct_etat" as const, label: "Ministère d'État", tooltip: "Génère des actions d'état.", group: 1 as const },
  { key: "pct_interieur" as const, label: "Ministère de l'Intérieur", tooltip: "Augmente significativement la stabilité.", group: 1 as const },
  { key: "pct_affaires_etrangeres" as const, label: "Ministère des Affaires étrangères", tooltip: "Augmente modérément la stabilité et le PIB.", group: 1 as const },
  { key: "pct_recherche" as const, label: "Ministère de la Recherche", tooltip: "Augmente significativement le niveau de science.", group: 2 as const },
  { key: "pct_education" as const, label: "Ministère de l'Éducation", tooltip: "Augmente modérément le niveau de science et la stabilité.", group: 2 as const },
  { key: "pct_sante" as const, label: "Ministère de la Santé", tooltip: "Augmente significativement la population.", group: 2 as const },
  { key: "pct_infrastructure" as const, label: "Ministère de l'Infrastructure", tooltip: "Augmente modérément le PIB et l'industrie.", group: 3 as const },
  { key: "pct_industrie" as const, label: "Ministère de l'Industrie", tooltip: "Augmente significativement le niveau d'industrie.", group: 3 as const },
  { key: "pct_defense" as const, label: "Ministère de la Défense", tooltip: "Augmente significativement le niveau de militarisme.", group: 3 as const },
  { key: "pct_procuration_militaire" as const, label: "Procuration Militaire", tooltip: "Points de procuration pour l'État Major (unités Soutien, Air, Mer).", group: 3 as const },
];

type BudgetPctKey = (typeof BUDGET_MINISTRIES)[number]["key"];

const DEFAULT_BUDGET_FRACTION = 0.1;

function getDefaultPcts(): Record<BudgetPctKey, number> {
  return {
    pct_etat: 0,
    pct_education: 0,
    pct_recherche: 0,
    pct_infrastructure: 0,
    pct_sante: 0,
    pct_industrie: 0,
    pct_defense: 0,
    pct_interieur: 0,
    pct_affaires_etrangeres: 0,
    pct_procuration_militaire: 0,
  };
}

export function CountryTabs({
  country,
  macros,
  limits,
  perksDef,
  perkCategories = [],
  activePerkIds = new Set<string>(),
  perkEffects = [],
  unlockedPerkIds,
  budget,
  effects,
  rankPopulation,
  rankGdp,
  rankInfluence,
  rankHardPower,
  rankHardPowerByType,
  isAdmin,
  isPlayerForThisCountry = false,
  assignedPlayerEmail = null,
  updateLogs,
  ruleParametersByKey,
  worldAverages,
  rosterByBranch,
  countryLawRows = [],
  worldDate,
  influenceResult = null,
  previousInfluenceValue = null,
  lastCronInfluenceAfterValue = null,
  hardPowerByBranch = null,
  ai_status = null,
  aiMajorEffects = [],
  aiMinorEffects = [],
  sphereData = { totalPopulation: 0, totalGdp: 0, masterInfluence: 0, totalInfluence: 0, countries: [] },
  ideologySummary = null,
  stateActionTypes = [],
  stateActionBalance = 0,
  stateActionRequests = [],
  incomingTargetRequests = [],
  countriesForTarget = [],
  countriesList = [],
  emitterCountry = { name: "", flag_url: null, regime: null, influence: null },
  intelLevel = null,
  foggedRoster = null,
  etatMajorFocus = null,
}: {
  country: Country;
  macros: { key: string; value: number }[];
  limits: { limit_value: number; military_unit_types: { name_fr: string; branch: MilitaryBranch } | null }[];
  perksDef: Array<{
    id: string;
    name_fr: string;
    description_fr: string | null;
    modifier: string | null;
    min_militarism: number | null;
    min_industry: number | null;
    min_science: number | null;
    min_stability: number | null;
    category_id?: string | null;
    icon_url?: string | null;
    icon_size?: number | null;
    perk_categories?: { id: string; name_fr: string; sort_order: number } | null;
    perk_effects?: Array<{ effect_kind: string; effect_target: string | null; effect_subtype?: string | null; value: number }>;
  }>;
  perkCategories?: Array<{ id: string; name_fr: string; sort_order: number }>;
  activePerkIds?: Set<string>;
  perkEffects?: Array<{ effect_kind: string; effect_target: string | null; value: number; sourceLabel?: string }>;
  unlockedPerkIds: Set<string>;
  budget: CountryBudget | null;
  effects: CountryEffect[];
  rankPopulation: number;
  rankGdp: number;
  rankInfluence: number;
  rankHardPower: number;
  rankHardPowerByType: { terre: number; air: number; mer: number; strategique: number };
  isAdmin: boolean;
  isPlayerForThisCountry?: boolean;
  assignedPlayerEmail?: string | null;
  updateLogs: CountryUpdateLog[];
  ruleParametersByKey: Record<string, { value: unknown }>;
  worldAverages: { pop_avg: number; gdp_avg: number; mil_avg: number; ind_avg: number; sci_avg: number; stab_avg: number } | null;
  rosterByBranch: Record<MilitaryBranch, RosterRowByBranch[]>;
  countryLawRows?: CountryLawRow[];
  worldDate?: { month: number; year: number };
  influenceResult?: InfluenceResult | null;
  previousInfluenceValue?: number | null;
  lastCronInfluenceAfterValue?: number | null;
  hardPowerByBranch?: HardPowerByBranch | null;
  ai_status?: string | null;
  aiMajorEffects?: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  aiMinorEffects?: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  sphereData?: {
    totalPopulation: number;
    totalGdp: number;
    masterInfluence: number;
    totalInfluence: number;
    countries: Array<{
      id: string;
      name: string;
      slug: string;
      flag_url: string | null;
      population: number | null;
      gdp: number | null;
      share_pct: number;
      is_annexed: boolean;
      controlStatus: "Contesté" | "Occupé" | "Annexé";
      influenceGiven: number;
      contributionPopulation: number;
      contributionGdp: number;
    }>;
  };
  ideologySummary?: {
    scores: Record<import("@/lib/ideology").IdeologyId, number>;
    drift: Record<import("@/lib/ideology").IdeologyId, number>;
    dominant: import("@/lib/ideology").IdeologyId;
    centerDistance: number;
    breakdown: {
      neighbors: Record<import("@/lib/ideology").IdeologyId, number>;
      effects: Record<import("@/lib/ideology").IdeologyId, number>;
      neighborContributors: Array<{
        countryId: string;
        name: string;
        slug: string;
        flag_url: string | null;
        ideology: import("@/lib/ideology").IdeologyId;
        value: number;
        weight: number;
      }>;
    };
  } | null;
  stateActionTypes?: Array<{ id: string; key: string; label_fr: string; cost: number; params_schema: Record<string, unknown> | null }>;
  stateActionBalance?: number;
  stateActionRequests?: Array<{ id: string; action_type_id: string; status: string; payload: Record<string, unknown> | null; created_at: string; refusal_message: string | null; dice_results?: { success_roll?: { roll: number; modifier: number; total: number }; impact_roll?: { roll: number; modifier: number; total: number } } | null; admin_effect_added?: Record<string, unknown> | null; state_action_types?: { key: string; label_fr: string } | null }>;
  incomingTargetRequests?: Array<{ id: string; action_type_id: string; status: string; payload: Record<string, unknown> | null; created_at: string; state_action_types?: { key: string; label_fr: string } | null; country?: { id: string; name: string; slug: string; flag_url: string | null } | null }>;
  countriesForTarget?: Array<{ id: string; name: string; flag_url: string | null; regime: string | null; influence: number; relation: number }>;
  countriesList?: Array<{ id: string; name: string }>;
  emitterCountry?: { name: string; flag_url: string | null; regime: string | null; influence: number | null };
  intelLevel?: number | null;
  foggedRoster?: FoggedRoster | null;
  etatMajorFocus?: EtatMajorFocusForTabs;
}) {
  const canEditCountry = isAdmin || isPlayerForThisCountry;
  const canSeeCabinetAndBudget = isAdmin || isPlayerForThisCountry;
  const rankEmoji = (r: number) => (r === 1 ? "👑" : r === 2 ? "🥈" : r === 3 ? "🥉" : null);
  const router = useRouter();
  const [tab, setTab] = useState<"general" | "military" | "etat_major" | "perks" | "budget" | "laws" | "cabinet" | "state_actions" | "debug">(canSeeCabinetAndBudget ? "cabinet" : "general");
  const [budgetFraction, setBudgetFraction] = useState(DEFAULT_BUDGET_FRACTION);
  const [pcts, setPcts] = useState<Record<BudgetPctKey, number>>(getDefaultPcts);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [effectsFormOpen, setEffectsFormOpen] = useState(false);
  const [editingEffect, setEditingEffect] = useState<CountryEffect | null>(null);
  const [effectName, setEffectName] = useState("");
  const [effectKind, setEffectKind] = useState<string>(ALL_EFFECT_KIND_IDS[0]);
  const [effectTarget, setEffectTarget] = useState<string | null>(null);
  const [effectValue, setEffectValue] = useState("");
  const [effectDurationKind, setEffectDurationKind] = useState<"days" | "updates" | "permanent">("days");
  const [effectDurationRemaining, setEffectDurationRemaining] = useState("7");
  const [effectSaving, setEffectSaving] = useState(false);
  const [effectError, setEffectError] = useState<string | null>(null);
  const [militaryEdit, setMilitaryEdit] = useState<Record<string, { current_level: number; extra_count: number }>>({});
  const militaryEditInitialized = useRef(false);
  const [localHardPowerByBranch, setLocalHardPowerByBranch] = useState<HardPowerByBranch | null>(null);
  const [militarySavingId, setMilitarySavingId] = useState<string | null>(null);
  const [militaryError, setMilitaryError] = useState<string | null>(null);
  const [militarySubtypeOpen, setMilitarySubtypeOpen] = useState<Record<string, boolean>>({});
  
  const [generalName, setGeneralName] = useState("");
  const [generalRegime, setGeneralRegime] = useState("");
  const [generalFlagUrl, setGeneralFlagUrl] = useState("");
  const [generalFlagFile, setGeneralFlagFile] = useState<File | null>(null);
  const [generalFlagPreview, setGeneralFlagPreview] = useState<string | null>(null);
  const [generalEditMode, setGeneralEditMode] = useState(false);
  const [generalSaving, setGeneralSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const rosterUnitsFlat = useMemo(() => {
    const out: { id: string; name_fr: string }[] = [];
    for (const b of ["terre", "air", "mer", "strategique"] as const) {
      for (const row of rosterByBranch[b]) {
        out.push({ id: row.unit.id, name_fr: row.unit.name_fr });
      }
    }
    return out;
  }, [rosterByBranch]);

  const lawLevelEffects = useMemo(
    () => resolveAllLawEffectsForCountry(countryLawRows, ruleParametersByKey),
    [countryLawRows, ruleParametersByKey]
  );

  const mobilisationLevelKey = useMemo(() => {
    const mobRow = countryLawRows.find((r) => r.law_key === "mobilisation");
    if (!mobRow) return null;
    const mobDef = LAW_DEFINITIONS.find((d) => d.lawKey === "mobilisation")!;
    const config = ruleParametersByKey[mobDef.configRuleKey]?.value as { level_thresholds?: Record<string, number> } | undefined;
    return getLawLevelKeyFromScore(mobRow.score, config?.level_thresholds, mobDef.levels);
  }, [countryLawRows, ruleParametersByKey]);

  const stateActionEffectLookups = useMemo(() => {
    const rosterUnits = rosterByBranch
      ? [rosterByBranch.terre, rosterByBranch.air, rosterByBranch.mer, rosterByBranch.strategique]
          .flat()
          .map((row) => ({ id: row.unit.id, name_fr: row.unit.name_fr ?? "" }))
      : [];
    return { rosterUnits, countries: countriesList ?? [] };
  }, [rosterByBranch, countriesList]);

  const globalGrowthEffects = useMemo(() => {
    const raw = ruleParametersByKey.global_growth_effects?.value;
    const arr = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === "object" && Array.isArray((raw as { value?: unknown }).value))
        ? (raw as { value: unknown[] }).value
        : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e: unknown): e is { effect_kind: string; effect_target: string | null; value: number } =>
        e != null &&
        typeof (e as { effect_kind?: unknown }).effect_kind === "string" &&
        typeof (e as { value?: unknown }).value === "number"
    ).map((e) => {
      const rawTarget = (e as { effect_target?: string | null }).effect_target;
      const effect_target =
        rawTarget == null ? null : typeof rawTarget === "string" ? rawTarget : String(rawTarget);
      return {
        effect_kind: (e as { effect_kind: string }).effect_kind,
        effect_target,
        value: Number((e as { value: number }).value),
      };
    });
  }, [ruleParametersByKey.global_growth_effects?.value]);

  const lawEffectsByLaw = useMemo(() => {
    return LAW_DEFINITIONS.map((def) => {
      const lawRow = countryLawRows.find((r) => r.law_key === def.lawKey);
      if (!lawRow) return null;
      const config = ruleParametersByKey[def.configRuleKey]?.value as { level_thresholds?: Record<string, number> } | undefined;
      const currentLevelKey = getLawLevelKeyFromScore(lawRow.score, config?.level_thresholds, def.levels);
      const currentLevelLabel = def.levels.find((l) => l.key === currentLevelKey)?.label ?? currentLevelKey;
      const effects = getLawEffectsForLevel(def.lawKey, currentLevelKey, ruleParametersByKey);
      return {
        lawLabel: def.title_fr,
        levelLabel: currentLevelLabel,
        effects,
      };
    }).filter((x): x is { lawLabel: string; levelLabel: string; effects: Array<{ effect_kind: string; effect_target: string | null; value: number }> } => x != null);
  }, [countryLawRows, ruleParametersByKey]);

  const ideologyEffectsConfig = useMemo(() => {
    const raw = ruleParametersByKey.ideology_effects?.value;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e: unknown): e is { ideology_id: string; effect_kind: string; effect_target: string | null; value: number } =>
        e != null &&
        typeof (e as { ideology_id?: unknown }).ideology_id === "string" &&
        typeof (e as { effect_kind?: unknown }).effect_kind === "string" &&
        typeof (e as { value?: unknown }).value === "number"
    ).map((e) => ({
      ideology_id: e.ideology_id,
      effect_kind: e.effect_kind,
      effect_target: e.effect_target ?? null,
      value: Number(e.value),
    }));
  }, [ruleParametersByKey.ideology_effects?.value]);

  const resolvedEffects = useMemo(
    () =>
      getEffectsForCountry({
        countryId: country.id,
        countryEffects: effects,
        lawLevelEffects,
        globalGrowthEffects,
        ai_status,
        aiMajorEffects,
        aiMinorEffects,
        perkEffects,
        ideologyScores: ideologySummary?.scores,
        ideologyEffectsConfig: ideologyEffectsConfig.length > 0 ? ideologyEffectsConfig : undefined,
      }),
    [country.id, effects, lawLevelEffects, globalGrowthEffects, ai_status, aiMajorEffects, aiMinorEffects, perkEffects, ideologySummary?.scores, ideologyEffectsConfig]
  );

  const effectsForTick = useMemo(
    () =>
      getEffectsForCountryTickRates({
        countryId: country.id,
        countryEffects: effects,
        lawLevelEffects,
        globalGrowthEffects,
        ai_status,
        aiMajorEffects,
        aiMinorEffects,
        perkEffects,
        ideologyScores: ideologySummary?.scores,
        ideologyEffectsConfig: ideologyEffectsConfig.length > 0 ? ideologyEffectsConfig : undefined,
      }),
    [country.id, effects, lawLevelEffects, globalGrowthEffects, ai_status, aiMajorEffects, aiMinorEffects, perkEffects, ideologySummary?.scores, ideologyEffectsConfig]
  );

  const tickBreakdownResult = useMemo(() => {
    if (!worldAverages || Object.keys(ruleParametersByKey).length === 0) return null;
    const snapshot = {
      population: Number(country.population ?? 0),
      gdp: Number(country.gdp ?? 0),
      militarism: Number(country.militarism ?? 0),
      industry: Number(country.industry ?? 0),
      science: Number(country.science ?? 0),
      stability: Number(country.stability ?? 0),
    };
    const budgetPcts = {
      pct_sante: pcts.pct_sante ?? 0,
      pct_education: pcts.pct_education ?? 0,
      pct_recherche: pcts.pct_recherche ?? 0,
      pct_infrastructure: pcts.pct_infrastructure ?? 0,
      pct_industrie: pcts.pct_industrie ?? 0,
      pct_defense: pcts.pct_defense ?? 0,
      pct_interieur: pcts.pct_interieur ?? 0,
      pct_affaires_etrangeres: pcts.pct_affaires_etrangeres ?? 0,
      pct_procuration_militaire: pcts.pct_procuration_militaire ?? 0,
    };
    return getTickBreakdown(
      snapshot,
      budgetPcts,
      ruleParametersByKey,
      worldAverages,
      {
        countryEffects: effects,
        lawLevelEffects,
        globalGrowthEffects,
        ai_status,
        aiMajorEffects,
        aiMinorEffects,
        perkEffects,
        ideologyScores: ideologySummary?.scores,
        ideologyEffectsConfig: ideologyEffectsConfig.length > 0 ? ideologyEffectsConfig : undefined,
        lawEffectsByLaw,
      },
      {
        mobilisationLevelName: getLawLevelLabel("mobilisation", mobilisationLevelKey),
        rosterUnitName: (id) => rosterUnitsFlat.find((u) => u.id === id)?.name_fr ?? null,
        rosterUnitsForExtra: rosterUnitsFlat,
      }
    );
  }, [
    worldAverages,
    ruleParametersByKey,
    country.population,
    country.gdp,
    country.militarism,
    country.industry,
    country.science,
    country.stability,
    pcts,
    effects,
    lawLevelEffects,
    globalGrowthEffects,
    ai_status,
    aiMajorEffects,
    aiMinorEffects,
    perkEffects,
    mobilisationLevelKey,
    ideologySummary?.scores,
    ideologyEffectsConfig,
    lawEffectsByLaw,
    rosterUnitsFlat,
  ]);

  const cabinetFundingByMinistry = useMemo(() => {
    return Object.fromEntries(
      BUDGET_MINISTRIES.map((ministry) => {
        const budgetKey = ministry.key.replace(/^pct_/, "budget_");
        const ruleValue = ruleParametersByKey[budgetKey]?.value;
        const minPct =
          ruleValue && typeof ruleValue === "object" && !Array.isArray(ruleValue)
            ? Number((ruleValue as { min_pct?: unknown }).min_pct ?? 5)
            : 5;
        return [
          budgetKey,
          {
            pct: Number(pcts[ministry.key] ?? 0),
            minPct: Number.isNaN(minPct) ? 5 : Math.max(0, minPct),
          },
        ];
      })
    ) as Record<string, { pct: number; minPct: number }>;
  }, [pcts, ruleParametersByKey]);

  useEffect(() => {
    militaryEditInitialized.current = false;
  }, [country.id]);

  useEffect(() => {
    if (!canSeeCabinetAndBudget && (tab === "cabinet" || tab === "budget" || tab === "etat_major")) {
      setTab("general");
    }
  }, [canSeeCabinetAndBudget, tab]);

  useEffect(() => {
    const next: Record<string, { current_level: number; extra_count: number }> = {};
    const branches: MilitaryBranch[] = ["terre", "air", "mer", "strategique"];
    for (const b of branches) {
      for (const row of rosterByBranch[b]) {
        const points = Math.max(0, row.countryState?.current_level ?? 0);
        const extra = Math.max(0, row.countryState?.extra_count ?? 0);
        next[row.unit.id] = { current_level: points, extra_count: extra };
      }
    }
    if (Object.keys(next).length && !militaryEditInitialized.current) {
      setMilitaryEdit(next);
      militaryEditInitialized.current = true;
    }
  }, [rosterByBranch]);

  useEffect(() => {
    const branches: MilitaryBranch[] = ["terre", "air", "mer", "strategique"];
    const rosterUnits = rosterByBranch.terre
      .concat(rosterByBranch.air, rosterByBranch.mer, rosterByBranch.strategique)
      .map((row) => ({ id: row.unit.id, branch: row.unit.branch, base_count: row.unit.base_count ?? 0 }));
    const rosterLevels = rosterByBranch.terre
      .concat(rosterByBranch.air, rosterByBranch.mer, rosterByBranch.strategique)
      .flatMap((row) =>
        row.levels.map((l) => ({ unit_id: row.unit.id, level: l.level, hard_power: l.hard_power ?? 0 }))
      );
    const countryUnits = rosterByBranch.terre
      .concat(rosterByBranch.air, rosterByBranch.mer, rosterByBranch.strategique)
      .map((row) => {
        const edit = militaryEdit[row.unit.id] ?? { current_level: 0, extra_count: 0 };
        return {
          country_id: country.id,
          roster_unit_id: row.unit.id,
          current_level: edit.current_level,
          extra_count: edit.extra_count,
        };
      });
    if (countryUnits.length === 0) return;
    const hardPowerMap = computeHardPowerByCountry(countryUnits, rosterUnits, rosterLevels);
    const hp = hardPowerMap.get(country.id) ?? null;
    if (hp) setLocalHardPowerByBranch(hp);
  }, [country.id, militaryEdit, rosterByBranch]);

  useEffect(() => {
    setGeneralName(country.name ?? "");
    setGeneralRegime(country.regime ?? "");
    setGeneralFlagUrl(country.flag_url ?? "");
    setGeneralFlagFile(null);
    setGeneralFlagPreview(null);
  }, [country.id, country.name, country.regime, country.flag_url]);

  useEffect(() => {
    if (!generalFlagFile) {
      setGeneralFlagPreview(null);
      return;
    }
    const url = URL.createObjectURL(generalFlagFile);
    setGeneralFlagPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [generalFlagFile]);

  useEffect(() => {
    if (!budget) return;
    setBudgetFraction(Number(budget.budget_fraction) || DEFAULT_BUDGET_FRACTION);
    const forcedMinPctsInit = getForcedMinPcts(resolvedEffects);
    const raw: Record<string, number> = {
      pct_etat: Number(budget.pct_etat) || 0,
      pct_education: Number(budget.pct_education) || 0,
      pct_recherche: Number(budget.pct_recherche) || 0,
      pct_infrastructure: Number(budget.pct_infrastructure) || 0,
      pct_sante: Number(budget.pct_sante) || 0,
      pct_industrie: Number(budget.pct_industrie) || 0,
      pct_defense: Number(budget.pct_defense) || 0,
      pct_interieur: Number(budget.pct_interieur) || 0,
      pct_affaires_etrangeres: Number(budget.pct_affaires_etrangeres) || 0,
      pct_procuration_militaire: Number((budget as { pct_procuration_militaire?: number }).pct_procuration_militaire) || 0,
    };
    BUDGET_MINISTRIES.forEach((m) => {
      const minVal = forcedMinPctsInit[m.key] ?? 0;
      raw[m.key] = Math.max(raw[m.key], minVal);
    });
    setPcts(raw);
  }, [budget?.id, resolvedEffects]);

  const totalPct = BUDGET_MINISTRIES.reduce((s, m) => s + pcts[m.key], 0);
  const forcedMinPcts = getForcedMinPcts(resolvedEffects);
  const allocationCap = getAllocationCapPercent(resolvedEffects);
  const gdpNum = Number(country.gdp) || 0;
  const totalBudgetAnnual = gdpNum * budgetFraction;
  const totalBudgetMonthly = totalBudgetAnnual / 12;
  const totalBudgetMonthlyBn = totalBudgetMonthly / 1e9;

  const limitsByBranch = limits.reduce<Record<MilitaryBranch, { name_fr: string; limit_value: number }[]>>(
    (acc, row) => {
      const branch = row.military_unit_types?.branch ?? "terre";
      if (!acc[branch]) acc[branch] = [];
      acc[branch].push({
        name_fr: row.military_unit_types?.name_fr ?? "—",
        limit_value: row.limit_value,
      });
      return acc;
    },
    { terre: [], air: [], mer: [], strategique: [] }
  );

  const effectiveLimitByBranch = useMemo(() => {
    const out: Record<MilitaryBranch, number> = { terre: 0, air: 0, mer: 0, strategique: 0 };
    for (const b of ["terre", "air", "mer", "strategique"] as const) {
      const rows = limitsByBranch[b] ?? [];
      const base = rows.reduce((s, r) => s + r.limit_value, 0);
      const mod = getLimitModifierPercent(resolvedEffects, b) / 100;
      out[b] = Math.round(base * (1 + mod));
    }
    return out;
  }, [limitsByBranch, resolvedEffects]);

  const panelClass =
    "rounded-lg border p-6";
  const panelStyle = {
    background: "var(--background-panel)",
    borderColor: "var(--border)",
  };

  const handleSaveGeneral = async () => {
    setGeneralError(null);
    setGeneralSaving(true);
    const supabase = createClient();
    let flagUrl: string | null = generalFlagUrl.trim() || null;
    if (generalFlagFile) {
      const ext = generalFlagFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("flags").upload(path, generalFlagFile, {
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadErr) {
        setGeneralError(uploadErr.message);
        setGeneralSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("flags").getPublicUrl(path);
      flagUrl = urlData.publicUrl;
    }
    const { error } = await supabase
      .from("countries")
      .update({
        name: generalName.trim() || country.name,
        regime: generalRegime.trim() || null,
        flag_url: flagUrl,
      })
      .eq("id", country.id);
    if (error) setGeneralError(error.message);
    setGeneralSaving(false);
    if (!error) {
      setGeneralFlagFile(null);
      setGeneralFlagPreview(null);
      setGeneralEditMode(false);
      router.refresh();
    }
  };

  const handleCancelGeneralEdit = () => {
    setGeneralEditMode(false);
    setGeneralError(null);
    setGeneralFlagFile(null);
    setGeneralFlagPreview(null);
  };

  const handleEditEffect = (e: CountryEffect) => {
    setEditingEffect(e);
    setEffectKind(e.effect_kind);
    setEffectTarget(e.effect_target);
    setEffectName(e.name);
    const helper = getEffectKindValueHelper(e.effect_kind);
    setEffectValue(String(helper.storedToDisplay(Number(e.value))));
    setEffectDurationKind((e.duration_kind === "updates" ? "days" : e.duration_kind) as "days" | "updates" | "permanent");
    setEffectDurationRemaining(String(e.duration_remaining));
    setEffectsFormOpen(true);
  };

  const otherCountriesForRelation = countriesList.filter((c) => c.id !== country.id);

  const handleDeleteEffect = async (e: CountryEffect) => {
    if (!confirm("Supprimer cet effet ?")) return;
    setEffectError(null);
    const supabase = createClient();
    const { error } = await supabase.from("country_effects").delete().eq("id", e.id);
    if (error) {
      setEffectError(error.message || "La suppression a échoué.");
      return;
    }
    router.refresh();
  };

  const handleOpenNewEffect = () => {
    setEditingEffect(null);
    setEffectName("");
    const firstKind = ALL_EFFECT_KIND_IDS[0];
    setEffectKind(firstKind);
    const otherCountryIds = countriesList.filter((c) => c.id !== country.id).map((c) => c.id);
    setEffectTarget(getDefaultTargetForKind(firstKind, rosterUnitsFlat.map((u) => u.id), otherCountryIds));
    setEffectValue("");
    setEffectDurationKind("days");
    setEffectDurationRemaining("7");
    setEffectError(null);
    setEffectsFormOpen(true);
  };

  const handleSaveEffect = async () => {
    setEffectError(null);
    setEffectSaving(true);
    const valueNum = Number(effectValue);
    if (Number.isNaN(valueNum)) {
      setEffectError("Valeur invalide.");
      setEffectSaving(false);
      return;
    }
    const effect_kind = effectKind;
    const effect_target = effectTarget;
    if (effect_kind === "budget_ministry_min_pct" && valueNum < 0) {
      setEffectError("Le minimum forcé doit être une valeur positive.");
      setEffectSaving(false);
      return;
    }
    const isPermanent = effectDurationKind === "permanent";
    const durationRaw = Number(effectDurationRemaining);
    if (!isPermanent && (!Number.isFinite(durationRaw) || durationRaw < 1)) {
      setEffectError("La durée doit être d'au moins 1 jour.");
      setEffectSaving(false);
      return;
    }
    const durationNum = isPermanent ? 0 : Math.min(DURATION_DAYS_MAX, Math.max(1, Math.floor(durationRaw)));
    const valueToStore = getEffectKindValueHelper(effect_kind).displayToStored(valueNum);
    const supabase = createClient();
    const row = {
      name: effectName.trim(),
      effect_kind,
      effect_target: effect_target || null,
      effect_subtype: null,
      value: valueToStore,
      duration_kind: isPermanent ? "permanent" : effectDurationKind,
      duration_remaining: durationNum,
    };
    let err: string | null = null;
    if (editingEffect) {
      const { error } = await supabase.from("country_effects").update(row).eq("id", editingEffect.id);
      if (error) err = error.message;
    } else {
      const { error } = await supabase.from("country_effects").insert({ ...row, country_id: country.id });
      if (error) err = error.message;
    }
    if (!err && !editingEffect) {
      if (effect_kind === "budget_ministry_min_pct" && effect_target) {
        const pctKey = budgetKeyToPctKey(effect_target);
        const current = budget ? { ...budget } : null;
        const curPcts: Record<string, number> = current
          ? {
              pct_etat: Number(current.pct_etat) || 0,
              pct_education: Number(current.pct_education) || 0,
              pct_recherche: Number(current.pct_recherche) || 0,
              pct_infrastructure: Number(current.pct_infrastructure) || 0,
              pct_sante: Number(current.pct_sante) || 0,
              pct_industrie: Number(current.pct_industrie) || 0,
              pct_defense: Number(current.pct_defense) || 0,
              pct_interieur: Number(current.pct_interieur) || 0,
              pct_affaires_etrangeres: Number(current.pct_affaires_etrangeres) || 0,
            }
          : getDefaultPcts();
        const forcedVal = Math.max(0, valueNum);
        curPcts[pctKey] = Math.max(curPcts[pctKey] ?? 0, forcedVal);
        let total = BUDGET_MINISTRIES.reduce((s, m) => s + (curPcts[m.key] ?? 0), 0);
        if (total > 100) {
          const others = BUDGET_MINISTRIES.filter((mm) => mm.key !== pctKey);
          const othersSum = others.reduce((s, m) => s + (curPcts[m.key] ?? 0), 0);
          const targetOthers = 100 - curPcts[pctKey];
          if (othersSum > 0 && targetOthers >= 0) {
            const scale = targetOthers / othersSum;
            others.forEach((m) => { curPcts[m.key] = (curPcts[m.key] ?? 0) * scale; });
          }
          total = BUDGET_MINISTRIES.reduce((s, m) => s + (curPcts[m.key] ?? 0), 0);
        }
        if (current?.id) {
          await supabase.from("country_budget").update({ ...curPcts, updated_at: new Date().toISOString() }).eq("id", current.id);
        } else {
          await supabase.from("country_budget").insert({
            country_id: country.id,
            budget_fraction: DEFAULT_BUDGET_FRACTION,
            ...curPcts,
          });
        }
      } else if (effect_kind === "budget_allocation_cap" && valueNum < 0) {
        const cap = 100 + valueNum;
        const current = budget;
        if (current && cap > 0) {
          const curPcts: Record<string, number> = {
            pct_etat: Number(current.pct_etat) || 0,
            pct_education: Number(current.pct_education) || 0,
            pct_recherche: Number(current.pct_recherche) || 0,
            pct_infrastructure: Number(current.pct_infrastructure) || 0,
            pct_sante: Number(current.pct_sante) || 0,
            pct_industrie: Number(current.pct_industrie) || 0,
            pct_defense: Number(current.pct_defense) || 0,
            pct_interieur: Number(current.pct_interieur) || 0,
            pct_affaires_etrangeres: Number(current.pct_affaires_etrangeres) || 0,
            pct_procuration_militaire: Number((current as { pct_procuration_militaire?: number }).pct_procuration_militaire) || 0,
          };
          const total = BUDGET_MINISTRIES.reduce((s, m) => s + curPcts[m.key], 0);
          if (total > 0) {
            const scale = cap / total;
            BUDGET_MINISTRIES.forEach((m) => { curPcts[m.key] = curPcts[m.key] * scale; });
            const { error: budgetErr } = await supabase
              .from("country_budget")
              .update({ ...curPcts, updated_at: new Date().toISOString() })
              .eq("id", current.id);
            if (budgetErr && !err) err = budgetErr.message;
          }
        }
      }
    }
    setEffectError(err);
    setEffectSaving(false);
    if (!err) {
      setEffectsFormOpen(false);
      setEditingEffect(null);
      router.refresh();
    }
  };

  const handleCloseEffectForm = () => {
    setEffectsFormOpen(false);
    setEditingEffect(null);
    setEffectError(null);
  };

  

  const handleSaveMilitaryUnit = async (rosterUnitId: string, currentLevel: number, extraCount: number) => {
    setMilitaryError(null);
    setMilitarySavingId(rosterUnitId);
    const slug = country.slug ?? "";
    const result = await saveMilitaryUnit(country.id, slug, rosterUnitId, currentLevel, extraCount);
    setMilitarySavingId(null);
    if (result.error) {
      setMilitaryError(result.error);
    } else {
      setMilitaryEdit((prev) => ({
        ...prev,
        [rosterUnitId]: { current_level: currentLevel, extra_count: extraCount },
      }));
    }
  };

  const handleSaveBudget = async () => {
    if (totalPct > allocationCap) {
      setBudgetError(`La somme des allocations ne doit pas dépasser ${allocationCap} %.`);
      return;
    }
    setBudgetError(null);
    setBudgetSaving(true);
    const supabase = createClient();
    if (budget?.id) {
      const toUpdate: Record<string, unknown> = { ...pcts, updated_at: new Date().toISOString() };
      if (isAdmin) toUpdate.budget_fraction = budgetFraction;
      const { error } = await supabase.from("country_budget").update(toUpdate).eq("id", budget.id);
      if (error) setBudgetError(error.message);
    } else {
      const { error } = await supabase.from("country_budget").insert({
        country_id: country.id,
        budget_fraction: budgetFraction,
        ...pcts,
      });
      if (error) setBudgetError(error.message);
    }
    setBudgetSaving(false);
  };

  const glassPanelClass = "rounded-2xl border border-white/25";
  const glassPanelStyle = { background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" as const };
  const glassTextClass = "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]";
  const glassMutedClass = "text-white/90";

  return (
    <div>
      <div
        className={`mb-8 flex flex-wrap items-center gap-6 p-6 ${glassPanelClass}`}
        style={glassPanelStyle}
      >
        {country.flag_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={country.flag_url}
            alt=""
            width={80}
            height={53}
            className="h-[53px] w-20 rounded border border-white/25 object-cover"
          />
        ) : (
          <div className="h-[53px] w-20 rounded border border-white/25 bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className={`text-2xl font-bold ${glassTextClass}`}>
            {country.name}
          </h1>
          {country.regime && (
            <p className={glassMutedClass}>{country.regime}</p>
          )}
          {assignedPlayerEmail && (
            <p className={`mt-1 text-sm ${glassMutedClass}`}>
              Joueur : {assignedPlayerEmail}
            </p>
          )}
        </div>
        {canEditCountry && !generalEditMode && (
          <>
            <button
              type="button"
              onClick={() => {
                setGeneralName(country.name ?? "");
                setGeneralRegime(country.regime ?? "");
                setGeneralFlagUrl(country.flag_url ?? "");
                setGeneralFlagFile(null);
                setGeneralFlagPreview(null);
                setGeneralError(null);
                setGeneralEditMode(true);
              }}
              className="shrink-0 rounded-lg border border-white/25 px-3 py-1.5 text-sm text-white/90 hover:text-white hover:bg-white/15 transition-colors"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              Éditer
            </button>
            {isAdmin && (
              <Link
                href={`/admin/pays/${country.id}`}
                className="shrink-0 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0f1419] hover:opacity-90"
              >
                [Admin] Editer
              </Link>
            )}
          </>
        )}
      </div>

      {canEditCountry && generalEditMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="general-edit-modal-title"
        >
          <div
            className="mx-4 max-w-lg rounded-lg border p-6 shadow-lg"
            style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="general-edit-modal-title" className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Changer informations nationales
            </h2>
            {generalError && <p className="mb-2 text-sm text-[var(--danger)]">{generalError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Nom du pays</label>
                <input
                  type="text"
                  value={generalName}
                  onChange={(e) => setGeneralName(e.target.value)}
                  className="w-full rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Régime</label>
                <input
                  type="text"
                  value={generalRegime}
                  onChange={(e) => setGeneralRegime(e.target.value)}
                  className="w-full rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Drapeau</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(e) => setGeneralFlagFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                  id="country-flag-upload-modal"
                />
                <label
                  htmlFor="country-flag-upload-modal"
                  className="inline-block cursor-pointer rounded border border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0f1419] hover:opacity-90"
                >
                  Upload
                </label>
                {generalFlagFile && (
                  <span className="ml-2 text-xs text-[var(--foreground-muted)]">{generalFlagFile.name}</span>
                )}
                {(generalFlagPreview || generalFlagUrl) && (
                  <div className="mt-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={generalFlagPreview ?? generalFlagUrl ?? ""}
                      alt=""
                      className="h-10 w-14 rounded border object-cover"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={generalSaving}
                onClick={handleSaveGeneral}
                className="rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#0f1419" }}
              >
                {generalSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={handleCancelGeneralEdit}
                className="rounded border border-[var(--border)] bg-[var(--background-elevated)] py-2 px-4 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`tab-list mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-white/25 px-4 py-3`}
        style={glassPanelStyle}
      >
        {canSeeCabinetAndBudget && (
          <button
            type="button"
            className={`tab rounded-lg border-b-2 px-3 py-2 text-sm transition-colors ${tab === "cabinet" ? "border-[var(--accent)] text-[var(--accent)]" : `border-transparent ${glassMutedClass} hover:text-white`}`}
            data-state={tab === "cabinet" ? "active" : "inactive"}
            onClick={() => setTab("cabinet")}
          >
            Rapport du Cabinet
          </button>
        )}
        <button
          type="button"
          className={`tab rounded-lg border-b-2 px-3 py-2 text-sm transition-colors ${tab === "general" ? "border-[var(--accent)] text-[var(--accent)]" : `border-transparent ${glassMutedClass} hover:text-white`}`}
          data-state={tab === "general" ? "active" : "inactive"}
          onClick={() => setTab("general")}
        >
          Généralités
        </button>
        <button
          type="button"
          className={`tab rounded-lg border-b-2 px-3 py-2 text-sm transition-colors ${tab === "military" ? "border-[var(--accent)] text-[var(--accent)]" : `border-transparent ${glassMutedClass} hover:text-white`}`}
          data-state={tab === "military" ? "active" : "inactive"}
          onClick={() => setTab("military")}
        >
          Militaire
        </button>
        {canSeeCabinetAndBudget && (
          <button
            type="button"
            className={`tab rounded-lg border-b-2 px-3 py-2 text-sm transition-colors ${tab === "etat_major" ? "border-[var(--accent)] text-[var(--accent)]" : `border-transparent ${glassMutedClass} hover:text-white`}`}
            data-state={tab === "etat_major" ? "active" : "inactive"}
            onClick={() => setTab("etat_major")}
          >
            État Major
          </button>
        )}
        <button
          type="button"
          className={`tab rounded-lg border-b-2 px-3 py-2 text-sm transition-colors ${tab === "perks" ? "border-[var(--accent)] text-[var(--accent)]" : `border-transparent ${glassMutedClass} hover:text-white`}`}
          data-state={tab === "perks" ? "active" : "inactive"}
          onClick={() => setTab("perks")}
        >
          Avantages
        </button>
        {canSeeCabinetAndBudget && (
          <button
            type="button"
            className={`tab rounded-lg border-b-2 px-3 py-2 text-sm transition-colors ${tab === "budget" ? "border-[var(--accent)] text-[var(--accent)]" : `border-transparent ${glassMutedClass} hover:text-white`}`}
            data-state={tab === "budget" ? "active" : "inactive"}
            onClick={() => setTab("budget")}
          >
            Budget
          </button>
        )}
        <button
          type="button"
          className={`tab rounded-lg border-b-2 px-3 py-2 text-sm transition-colors ${tab === "laws" ? "border-[var(--accent)] text-[var(--accent)]" : `border-transparent ${glassMutedClass} hover:text-white`}`}
          data-state={tab === "laws" ? "active" : "inactive"}
          onClick={() => setTab("laws")}
        >
          Lois
        </button>
        {isPlayerForThisCountry && (
          <button
            type="button"
            className={`tab rounded-lg border-b-2 px-3 py-2 text-sm transition-colors ${tab === "state_actions" ? "border-[var(--accent)] text-[var(--accent)]" : `border-transparent ${glassMutedClass} hover:text-white`}`}
            data-state={tab === "state_actions" ? "active" : "inactive"}
            onClick={() => setTab("state_actions")}
          >
            Actions d'État
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className={`tab rounded-lg border-b-2 px-3 py-2 text-sm transition-colors ${tab === "debug" ? "border-[var(--accent)] text-[var(--accent)]" : `border-transparent ${glassMutedClass} hover:text-white`}`}
            data-state={tab === "debug" ? "active" : "inactive"}
            onClick={() => setTab("debug")}
          >
            Debug
          </button>
        )}
        <span className="ml-2 inline-flex items-center self-center text-white/80" onClick={(e) => e.stopPropagation()}>
          <InfoTooltipWithWikiLink
            text="La fiche pays se lit onglet par onglet : Rapport du Cabinet, Généralités, Militaire, Avantages, Budget, Lois et Actions d'État (selon votre accès)."
            wikiSectionId="fiche-pays-onglets"
            side="bottom"
          />
        </span>
      </div>

      {tab === "general" && (
        <CountryTabGeneral
          country={country}
          rankPopulation={rankPopulation}
          rankGdp={rankGdp}
          rankInfluence={rankInfluence}
          rankHardPower={rankHardPower}
          rankHardPowerByType={rankHardPowerByType}
          rankEmoji={rankEmoji}
          panelClass={panelClass}
          panelStyle={panelStyle}
          canEditCountry={canEditCountry}
          effects={effects}
          isAdmin={isAdmin}
          rosterUnitsFlat={rosterUnitsFlat}
          effectsFormOpen={effectsFormOpen}
          setEffectsFormOpen={setEffectsFormOpen}
          editingEffect={editingEffect}
          setEditingEffect={setEditingEffect}
          effectName={effectName}
          setEffectName={setEffectName}
          effectKind={effectKind}
          setEffectKind={setEffectKind}
          effectTarget={effectTarget}
          setEffectTarget={setEffectTarget}
          effectValue={effectValue}
          setEffectValue={setEffectValue}
          effectDurationKind={effectDurationKind}
          setEffectDurationKind={setEffectDurationKind}
          effectDurationRemaining={effectDurationRemaining}
          setEffectDurationRemaining={setEffectDurationRemaining}
          effectError={effectError}
          setEffectError={setEffectError}
          effectSaving={effectSaving}
          onEditEffect={handleEditEffect}
          onDeleteEffect={handleDeleteEffect}
          onOpenNewEffect={handleOpenNewEffect}
          onSaveEffect={handleSaveEffect}
          onCloseEffectForm={handleCloseEffectForm}
          influenceResult={influenceResult}
          displayInfluence={sphereData.totalInfluence != null ? Math.round(sphereData.totalInfluence) : (influenceResult?.influence != null ? Math.round(influenceResult.influence) : null)}
          hardPowerByBranch={localHardPowerByBranch ?? hardPowerByBranch}
          sphereData={sphereData}
          ideologySummary={ideologySummary}
          countryLawRows={countryLawRows}
          ruleParametersByKey={ruleParametersByKey}
          otherCountriesForRelation={otherCountriesForRelation}
          resolvedEffects={resolvedEffects}
        />
      )}

      {tab === "military" && (
        <CountryTabMilitary
          countryId={country.id}
          panelClass={panelClass}
          panelStyle={panelStyle}
          canEditCountry={canEditCountry}
          militaryError={militaryError}
          militarySubtypeOpen={militarySubtypeOpen}
          setMilitarySubtypeOpen={setMilitarySubtypeOpen}
          rosterByBranch={rosterByBranch}
          effectiveLimitByBranch={effectiveLimitByBranch}
          militaryEdit={militaryEdit}
          setMilitaryEdit={setMilitaryEdit}
          militarySavingId={militarySavingId}
          isAdmin={isAdmin}
          effects={resolvedEffects}
          onSaveMilitaryUnit={handleSaveMilitaryUnit}
          intelLevel={intelLevel}
          foggedRoster={foggedRoster}
        />
      )}

      {tab === "etat_major" && canSeeCabinetAndBudget && (
        <CountryTabEtatMajor
          countryId={country.id}
          countrySlug={country.slug ?? ""}
          country={country}
          etatMajorFocus={etatMajorFocus}
          rosterByBranch={rosterByBranch}
          ruleParametersByKey={ruleParametersByKey}
          resolvedEffects={resolvedEffects}
          pctProcurationMilitaire={pcts.pct_procuration_militaire ?? 0}
          panelClass={panelClass}
          panelStyle={panelStyle}
          canEditCountry={canEditCountry}
        />
      )}

      {tab === "perks" && (
        <CountryTabPerks
          perksDef={perksDef}
          perkCategories={perkCategories}
          activePerkIds={activePerkIds}
          rosterUnitsFlat={rosterUnitsFlat}
          country={country}
          panelClass={panelClass}
          panelStyle={panelStyle}
        />
      )}

      {tab === "budget" && (
        <CountryTabBudget
          country={country}
          panelClass={panelClass}
          panelStyle={panelStyle}
          budgetFraction={budgetFraction}
          setBudgetFraction={setBudgetFraction}
          pcts={pcts}
          setPcts={setPcts}
          totalPct={totalPct}
          forcedMinPcts={forcedMinPcts}
          allocationCap={allocationCap}
          totalBudgetMonthly={totalBudgetMonthly}
          totalBudgetMonthlyBn={totalBudgetMonthlyBn}
          BUDGET_MINISTRIES={BUDGET_MINISTRIES}
          budgetError={budgetError}
          budgetSaving={budgetSaving}
          canEditCountry={canEditCountry}
          isAdmin={isAdmin}
          budget={budget}
          onSaveBudget={handleSaveBudget}
          effects={resolvedEffects}
          rosterUnitsFlat={rosterUnitsFlat}
          updateLogs={updateLogs}
          ruleParametersByKey={ruleParametersByKey}
          worldAverages={worldAverages}
          effectsForTick={effectsForTick}
        />
      )}

      {tab === "laws" && (
        <CountryTabLaws
          countryId={country.id}
          countrySlug={country.slug ?? ""}
          panelClass={panelClass}
          panelStyle={panelStyle}
          canEditCountry={canEditCountry}
          countryLawRows={countryLawRows}
          ruleParametersByKey={ruleParametersByKey}
          rosterUnitsFlat={rosterUnitsFlat}
        />
      )}

      {tab === "state_actions" && isPlayerForThisCountry && stateActionTypes && stateActionRequests && countriesForTarget && (
        <CountryTabStateActions
          countryId={country.id}
          types={stateActionTypes}
          balance={stateActionBalance ?? 0}
          requests={stateActionRequests}
          incomingTargetRequests={incomingTargetRequests ?? []}
          countriesForTarget={countriesForTarget}
          emitterCountry={emitterCountry}
          effectLookups={stateActionEffectLookups}
          panelClass={panelClass}
          panelStyle={panelStyle}
        />
      )}

      {tab === "cabinet" && (
        <CountryTabCabinet
          breakdown={tickBreakdownResult?.breakdown ?? null}
          expected={tickBreakdownResult?.expected ?? null}
          country={country}
          worldDate={worldDate ?? null}
          worldAverages={worldAverages ?? null}
          lastUpdateLog={updateLogs[0] ?? null}
          fundingByMinistry={cabinetFundingByMinistry}
          influenceValue={sphereData.totalInfluence != null ? Math.round(sphereData.totalInfluence) : (influenceResult?.influence ?? null)}
          previousInfluenceValue={previousInfluenceValue}
          lastCronInfluenceAfterValue={lastCronInfluenceAfterValue}
          panelClass={panelClass}
          panelStyle={panelStyle}
        />
      )}

      {tab === "debug" && tickBreakdownResult && (
        <CountryTabDebug
          breakdown={tickBreakdownResult.breakdown}
          expected={tickBreakdownResult.expected}
          country={country}
          latestUpdateLog={updateLogs[0] ?? null}
          panelClass={panelClass}
          panelStyle={panelStyle}
        />
      )}
    </div>
  );
}