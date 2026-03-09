"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Country } from "@/types/database";
import type { MilitaryBranch } from "@/types/database";
import type { CountryBudget } from "@/types/database";
import type { CountryEffect } from "@/types/database";
import type { CountryUpdateLog } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import {
  ALL_EFFECT_KIND_IDS,
  getDefaultTargetForKind,
  getForcedMinPcts,
  getAllocationCapPercent,
  budgetKeyToPctKey,
  getLimitModifierPercent,
  getEffectsForCountry,
  getEffectsForCountryTickRates,
  getMobilisationLevelLabel,
} from "@/lib/countryEffects";
import { getTickBreakdown } from "@/lib/tickBreakdown";
import { setMobilisationTarget, saveMilitaryUnit, getCountryMilitaryUnits } from "./actions";
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
  };
}

export function CountryTabs({
  country,
  macros,
  limits,
  perksDef,
  unlockedPerkIds,
  budget,
  effects,
  rankPopulation,
  rankGdp,
  isAdmin,
  isPlayerForThisCountry = false,
  assignedPlayerEmail = null,
  updateLogs,
  ruleParametersByKey,
  worldAverages,
  rosterByBranch,
  mobilisationConfig,
  mobilisationState,
  worldDate,
  influenceResult = null,
  previousInfluenceValue = null,
  lastCronInfluenceAfterValue = null,
  hardPowerByBranch = null,
  ai_status = null,
  aiMajorEffects = [],
  aiMinorEffects = [],
  sphereData = { totalPopulation: 0, totalGdp: 0, countries: [] },
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
}: {
  country: Country;
  macros: { key: string; value: number }[];
  limits: { limit_value: number; military_unit_types: { name_fr: string; branch: MilitaryBranch } | null }[];
  perksDef: { id: string; name_fr: string; description_fr: string | null; modifier: string | null; min_militarism: number | null; min_industry: number | null; min_science: number | null; min_stability: number | null }[];
  unlockedPerkIds: Set<string>;
  budget: CountryBudget | null;
  effects: CountryEffect[];
  rankPopulation: number;
  rankGdp: number;
  isAdmin: boolean;
  isPlayerForThisCountry?: boolean;
  assignedPlayerEmail?: string | null;
  updateLogs: CountryUpdateLog[];
  ruleParametersByKey: Record<string, { value: unknown }>;
  worldAverages: { pop_avg: number; gdp_avg: number; mil_avg: number; ind_avg: number; sci_avg: number; stab_avg: number } | null;
  rosterByBranch: Record<MilitaryBranch, RosterRowByBranch[]>;
  mobilisationConfig?: { level_thresholds?: Record<string, number>; daily_step?: number };
  mobilisationState?: { score: number; target_score: number } | null;
  worldDate?: { month: number; year: number };
  influenceResult?: InfluenceResult | null;
  previousInfluenceValue?: number | null;
  lastCronInfluenceAfterValue?: number | null;
  hardPowerByBranch?: HardPowerByBranch | null;
  ai_status?: string | null;
  aiMajorEffects?: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  aiMinorEffects?: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  sphereData?: { totalPopulation: number; totalGdp: number; countries: Array<{ id: string; name: string; slug: string; population: number | null; gdp: number | null }> };
  ideologySummary?: {
    scores: { monarchism: number; republicanism: number; cultism: number };
    drift: { monarchism: number; republicanism: number; cultism: number };
    dominant: "monarchism" | "republicanism" | "cultism";
    centerDistance: number;
    breakdown: {
      neighbors: { monarchism: number; republicanism: number; cultism: number };
      effects: { monarchism: number; republicanism: number; cultism: number };
      neighborContributors: Array<{
        countryId: string;
        name: string;
        slug: string;
        flag_url: string | null;
        ideology: "monarchism" | "republicanism" | "cultism";
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
}) {
  const canEditCountry = isAdmin || isPlayerForThisCountry;
  const canSeeCabinetAndBudget = isAdmin || isPlayerForThisCountry;
  const rankEmoji = (r: number) => (r === 1 ? "👑" : r === 2 ? "🥈" : r === 3 ? "🥉" : null);
  const router = useRouter();
  const [tab, setTab] = useState<"general" | "military" | "perks" | "budget" | "cabinet" | "state_actions" | "debug">(canSeeCabinetAndBudget ? "cabinet" : "general");
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
  const [mobilisationSetting, setMobilisationSetting] = useState<string | null>(null);
  const [mobilisationError, setMobilisationError] = useState<string | null>(null);
  const [mobilisationMessage, setMobilisationMessage] = useState<string | null>(null);
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

  const mobilisationLevelKey = useMemo(() => {
    if (!mobilisationConfig?.level_thresholds || mobilisationState == null) return null;
    const score = mobilisationState.score ?? 0;
    const entries = Object.entries(mobilisationConfig.level_thresholds)
      .filter(([, val]) => typeof val === "number")
      .sort(([, a], [, b]) => (b as number) - (a as number));
    const found = entries.find(([, val]) => (val as number) <= score);
    return found?.[0] ?? null;
  }, [mobilisationConfig?.level_thresholds, mobilisationState?.score]);

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
    if (!Array.isArray(raw)) return [];
    return raw.filter(
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

  const mobilisationLevelEffects = useMemo(() => {
    const raw = ruleParametersByKey.mobilisation_level_effects?.value;
    if (!Array.isArray(raw) || !mobilisationLevelKey) return [];
    return raw
      .filter(
        (e: unknown): e is { level: string; effect_kind: string; effect_target: string | null; value: number } =>
          e != null &&
          typeof (e as { level?: string }).level === "string" &&
          (e as { level: string }).level === mobilisationLevelKey &&
          typeof (e as { effect_kind?: unknown }).effect_kind === "string" &&
          typeof (e as { value?: unknown }).value === "number"
      )
      .map((e) => ({
        effect_kind: e.effect_kind,
        effect_target: e.effect_target ?? null,
        value: Number(e.value),
      }));
  }, [ruleParametersByKey.mobilisation_level_effects?.value, mobilisationLevelKey]);

  const resolvedEffects = useMemo(
    () =>
      getEffectsForCountry({
        countryId: country.id,
        countryEffects: effects,
        mobilisationLevelEffects,
        globalGrowthEffects,
        ai_status,
        aiMajorEffects,
        aiMinorEffects,
      }),
    [country.id, effects, mobilisationLevelEffects, globalGrowthEffects, ai_status, aiMajorEffects, aiMinorEffects]
  );

  const effectsForTick = useMemo(
    () =>
      getEffectsForCountryTickRates({
        countryId: country.id,
        countryEffects: effects,
        mobilisationLevelEffects,
        globalGrowthEffects,
        ai_status,
        aiMajorEffects,
        aiMinorEffects,
      }),
    [country.id, effects, mobilisationLevelEffects, globalGrowthEffects, ai_status, aiMajorEffects, aiMinorEffects]
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
    };
    return getTickBreakdown(
      snapshot,
      budgetPcts,
      ruleParametersByKey,
      worldAverages,
      { countryEffects: effects, mobilisationLevelEffects, globalGrowthEffects, ai_status, aiMajorEffects, aiMinorEffects },
      {
        mobilisationLevelName: getMobilisationLevelLabel(mobilisationLevelKey),
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
    mobilisationLevelEffects,
    globalGrowthEffects,
    ai_status,
    aiMajorEffects,
    aiMinorEffects,
    mobilisationLevelKey,
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
    const t = setTimeout(() => {
      militaryEditInitialized.current = false;
      router.refresh();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        militaryEditInitialized.current = false;
        router.refresh();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (!canSeeCabinetAndBudget && (tab === "cabinet" || tab === "budget")) {
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
    let cancelled = false;
    getCountryMilitaryUnits(country.id).then((res) => {
      if (cancelled) return;
      if (res.error) return;
      const map: Record<string, { current_level: number; extra_count: number }> = {};
      for (const u of res.units ?? []) {
        map[u.roster_unit_id] = {
          current_level: Math.max(0, u.current_level),
          extra_count: Math.max(0, u.extra_count),
        };
      }
      const branches: MilitaryBranch[] = ["terre", "air", "mer", "strategique"];
      const next: Record<string, { current_level: number; extra_count: number }> = {};
      for (const b of branches) {
        for (const row of rosterByBranch[b]) {
          next[row.unit.id] = map[row.unit.id] ?? { current_level: 0, extra_count: 0 };
        }
      }
      if (Object.keys(next).length) {
        setMilitaryEdit(next);
        militaryEditInitialized.current = true;
      }
      const rosterUnits = rosterByBranch.terre
        .concat(rosterByBranch.air, rosterByBranch.mer, rosterByBranch.strategique)
        .map((row) => ({ id: row.unit.id, branch: row.unit.branch, base_count: row.unit.base_count ?? 0 }));
      const rosterLevels = rosterByBranch.terre
        .concat(rosterByBranch.air, rosterByBranch.mer, rosterByBranch.strategique)
        .flatMap((row) =>
          row.levels.map((l) => ({ unit_id: row.unit.id, level: l.level, hard_power: l.hard_power ?? 0 }))
        );
      const countryUnits = (res.units ?? []).map((u) => ({
        country_id: country.id,
        roster_unit_id: u.roster_unit_id,
        current_level: u.current_level,
        extra_count: u.extra_count,
      }));
      const hardPowerMap = computeHardPowerByCountry(countryUnits, rosterUnits, rosterLevels);
      const hp = hardPowerMap.get(country.id) ?? null;
      if (hp) setLocalHardPowerByBranch(hp);
    });
    return () => {
      cancelled = true;
    };
  }, [country.id, rosterByBranch]);

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
    const raw = {
      pct_etat: Number(budget.pct_etat) || 0,
      pct_education: Number(budget.pct_education) || 0,
      pct_recherche: Number(budget.pct_recherche) || 0,
      pct_infrastructure: Number(budget.pct_infrastructure) || 0,
      pct_sante: Number(budget.pct_sante) || 0,
      pct_industrie: Number(budget.pct_industrie) || 0,
      pct_defense: Number(budget.pct_defense) || 0,
      pct_interieur: Number(budget.pct_interieur) || 0,
      pct_affaires_etrangeres: Number(budget.pct_affaires_etrangeres) || 0,
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
    setEffectValue(
      e.effect_kind.startsWith("gdp_growth") || e.effect_kind.startsWith("population_growth")
        ? String(Number(e.value) * 100)
        : e.effect_kind.startsWith("influence_modifier_")
          ? String(Number(e.value) * 100 - 100)
          : e.effect_kind === "budget_ministry_effect_multiplier"
            ? String(Number(e.value) * 100 - 100)
            : String(e.value)
    );
    setEffectDurationKind((e.duration_kind === "updates" ? "days" : e.duration_kind) as "days" | "updates" | "permanent");
    setEffectDurationRemaining(String(e.duration_remaining));
    setEffectsFormOpen(true);
  };

  const otherCountriesForRelation = countriesList.filter((c) => c.id !== country.id);

  const handleDeleteEffect = async (e: CountryEffect) => {
    if (!confirm("Supprimer cet effet ?")) return;
    const supabase = createClient();
    await supabase.from("country_effects").delete().eq("id", e.id);
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
    const durationNum = isPermanent ? 0 : Math.min(100, Math.max(0, Math.floor(Number(effectDurationRemaining) || 0)));
    const isGrowthEffect =
      effect_kind === "gdp_growth_base" ||
      effect_kind === "gdp_growth_per_stat" ||
      effect_kind === "population_growth_base" ||
      effect_kind === "population_growth_per_stat";
    const isMilitaryUnitEffect =
      effect_kind === "military_unit_extra" || effect_kind === "military_unit_tech_rate" || effect_kind === "military_unit_limit_modifier";
    const isInfluenceModifier = effect_kind.startsWith("influence_modifier_");
    const isMultiplierEffect = isInfluenceModifier || effect_kind === "budget_ministry_effect_multiplier";
    const valueToStore = isGrowthEffect
      ? valueNum / 100
      : effect_kind === "military_unit_limit_modifier"
        ? valueNum
        : isMilitaryUnitEffect
          ? Math.floor(valueNum)
          : isMultiplierEffect
            ? (100 + valueNum) / 100
            : valueNum;
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
          };
          const total = BUDGET_MINISTRIES.reduce((s, m) => s + curPcts[m.key], 0);
          if (total > 0) {
            const scale = cap / total;
            BUDGET_MINISTRIES.forEach((m) => { curPcts[m.key] = curPcts[m.key] * scale; });
            await supabase.from("country_budget").update({ ...curPcts, updated_at: new Date().toISOString() }).eq("id", current.id);
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

  const handleMobilisationClick = async (threshold: number) => {
    setMobilisationError(null);
    setMobilisationMessage(null);
    try {
      const result = await setMobilisationTarget(country.id, threshold);
      if (result.error) {
        setMobilisationError(result.error);
        setMobilisationSetting(null);
      } else {
        setMobilisationMessage("Objectif de mobilisation mis à jour. Les services suivront désormais cette montée en puissance au fil des prochains jours.");
        await router.refresh();
      }
      // En cas de succès, le loader est retiré par le useEffect quand target_score reflète la mise à jour
    } catch (error) {
      setMobilisationSetting(null);
      throw error;
    }
  };

  // Retirer le loader de mobilisation uniquement quand les données reçues reflètent la nouvelle cible (surbrillance à jour)
  useEffect(() => {
    if (!mobilisationSetting || mobilisationState == null || !mobilisationConfig?.level_thresholds) return;
    const wantedThreshold = mobilisationConfig.level_thresholds[mobilisationSetting];
    if (typeof wantedThreshold === "number" && mobilisationState.target_score === wantedThreshold) {
      setMobilisationSetting(null);
    }
  }, [mobilisationState?.target_score, mobilisationSetting, mobilisationConfig?.level_thresholds]);

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

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-6">
        {country.flag_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={country.flag_url}
            alt=""
            width={80}
            height={53}
            className="h-[53px] w-20 rounded border border-[var(--border)] object-cover"
            style={{ borderColor: "var(--border)" }}
          />
        ) : (
          <div
            className="h-[53px] w-20 rounded border border-[var(--border)] bg-[var(--background-elevated)]"
            style={{ borderColor: "var(--border)" }}
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {country.name}
          </h1>
          {country.regime && (
            <p className="text-[var(--foreground-muted)]">{country.regime}</p>
          )}
          {assignedPlayerEmail && (
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Joueur : {assignedPlayerEmail}
            </p>
          )}
        </div>
        {canEditCountry && !generalEditMode && (
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
            className="shrink-0 rounded border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--accent)] hover:border-[var(--accent-muted)]"
          >
            Éditer
          </button>
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

      <div className="tab-list mb-6" style={{ borderColor: "var(--border)" }}>
        {canSeeCabinetAndBudget && (
          <button
            type="button"
            className={`tab ${tab === "cabinet" ? "tab-active" : ""}`}
            data-state={tab === "cabinet" ? "active" : "inactive"}
            onClick={() => setTab("cabinet")}
            style={
              tab === "cabinet"
                ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
                : undefined
            }
          >
            Rapport du Cabinet
          </button>
        )}
        <button
          type="button"
          className={`tab ${tab === "general" ? "tab-active" : ""}`}
          data-state={tab === "general" ? "active" : "inactive"}
          onClick={() => setTab("general")}
          style={
            tab === "general"
              ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
              : undefined
          }
        >
          Généralités
        </button>
        <button
          type="button"
          className={`tab ${tab === "military" ? "tab-active" : ""}`}
          data-state={tab === "military" ? "active" : "inactive"}
          onClick={() => setTab("military")}
          style={
            tab === "military"
              ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
              : undefined
          }
        >
          Militaire
        </button>
        <button
          type="button"
          className={`tab ${tab === "perks" ? "tab-active" : ""}`}
          data-state={tab === "perks" ? "active" : "inactive"}
          onClick={() => setTab("perks")}
          style={
            tab === "perks"
              ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
              : undefined
          }
        >
          Avantages
        </button>
        {canSeeCabinetAndBudget && (
          <button
            type="button"
            className={`tab ${tab === "budget" ? "tab-active" : ""}`}
            data-state={tab === "budget" ? "active" : "inactive"}
            onClick={() => setTab("budget")}
            style={
              tab === "budget"
                ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
                : undefined
            }
          >
            Budget
          </button>
        )}
        {isPlayerForThisCountry && (
          <button
            type="button"
            className={`tab ${tab === "state_actions" ? "tab-active" : ""}`}
            data-state={tab === "state_actions" ? "active" : "inactive"}
            onClick={() => setTab("state_actions")}
            style={
              tab === "state_actions"
                ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
                : undefined
            }
          >
            Actions d'État
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className={`tab ${tab === "debug" ? "tab-active" : ""}`}
            data-state={tab === "debug" ? "active" : "inactive"}
            onClick={() => setTab("debug")}
            style={
              tab === "debug"
                ? { color: "var(--accent)", borderBottomColor: "var(--accent)" }
                : undefined
            }
          >
            Debug
          </button>
        )}
      </div>

      {tab === "general" && (
        <CountryTabGeneral
          country={country}
          rankPopulation={rankPopulation}
          rankGdp={rankGdp}
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
          hardPowerByBranch={localHardPowerByBranch ?? hardPowerByBranch}
          sphereData={sphereData}
          ideologySummary={ideologySummary}
          otherCountriesForRelation={otherCountriesForRelation}
        />
      )}

      {tab === "military" && (
        <CountryTabMilitary
          countryId={country.id}
          panelClass={panelClass}
          panelStyle={panelStyle}
          canEditCountry={canEditCountry}
          mobilisationConfig={mobilisationConfig}
          mobilisationState={mobilisationState}
          mobilisationSetting={mobilisationSetting}
          mobilisationError={mobilisationError}
          mobilisationMessage={mobilisationMessage}
          onMobilisationClick={handleMobilisationClick}
          setMobilisationSetting={setMobilisationSetting}
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

      {tab === "perks" && (
        <CountryTabPerks
          perksDef={perksDef}
          unlockedPerkIds={unlockedPerkIds}
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
          influenceValue={influenceResult?.influence ?? null}
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
          panelClass={panelClass}
          panelStyle={panelStyle}
        />
      )}
    </div>
  );
}