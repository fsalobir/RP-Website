"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { revalidateCountryPageGlobals } from "@/app/admin/regles/actions";
import type { RuleParameter } from "@/types/database";
import {
  getRuleLabel,
  BUDGET_MINISTRY_KEYS,
  BUDGET_MINISTRY_LABELS,
  BUDGET_EFFECT_TYPES,
  BUDGET_EFFECT_TYPE_LABELS,
  getEffectsListForMinistry,
  type BudgetMinistryValue,
  type BudgetMinistryEffectDef,
} from "@/lib/ruleParameters";
import { MOIS_LABELS } from "@/lib/worldDate";
import {
  ALL_EFFECT_KIND_IDS,
  EFFECT_KIND_LABELS,
  EFFECT_KINDS_WITH_STAT_TARGET,
  EFFECT_KINDS_WITH_BUDGET_TARGET,
  EFFECT_KINDS_NO_TARGET,
  EFFECT_KINDS_WITH_BRANCH_TARGET,
  EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET,
  STAT_KEYS,
  STAT_LABELS,
  MILITARY_BRANCH_EFFECT_IDS,
  MILITARY_BRANCH_EFFECT_LABELS,
  getBudgetMinistryOptions,
  getEffectKindValueHelper,
  formatEffectValue,
} from "@/lib/countryEffects";
import { MatriceDiplomatiqueForm } from "@/app/admin/matrice-diplomatique/MatriceDiplomatiqueForm";

function CollapsibleBlock({
  title,
  open,
  onToggle,
  children,
  variant = "default",
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: "default" | "section";
}) {
  const isSection = variant === "section";
  return (
    <div
      className={isSection ? "mb-8 rounded-lg border-2 last:mb-0" : "border-b"}
      style={{
        borderColor: isSection ? "var(--border)" : "var(--border-muted)",
        background: isSection ? "var(--background-panel)" : undefined,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-2 text-left transition-colors hover:opacity-90 ${isSection ? "px-5 py-4" : "px-4 py-2.5"}`}
        style={{ background: isSection ? "var(--background-elevated)" : "var(--background-elevated)" }}
      >
        <span
          className={isSection ? "text-base font-semibold text-[var(--foreground)]" : "text-sm font-medium text-[var(--foreground)]"}
        >
          {title}
        </span>
        <span
          className="block shrink-0 transition-transform duration-300 ease-out"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          <svg width={isSection ? 20 : 16} height={isSection ? 20 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div
        className="grid"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.25s ease-out",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={isSection ? "border-t py-1" : "divide-y"}
            style={{ borderColor: "var(--border-muted)" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

type GlobalGrowthEffectEntry = {
  effect_kind: string;
  effect_target: string | null;
  value: number;
};

type CountryForMatrice = { id: string; name: string; slug: string };

export function ReglesForm({
  rules,
  rosterUnits = [],
  countries: countriesForMatrice,
  relationMap: relationMapForMatrice,
}: {
  rules: RuleParameter[];
  rosterUnits?: { id: string; name_fr: string }[];
  countries?: CountryForMatrice[];
  relationMap?: Record<string, number>;
}) {
  const [items, setItems] = useState(rules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalGrowthOpen, setGlobalGrowthOpen] = useState(true);
  const [globalEffectFormOpen, setGlobalEffectFormOpen] = useState(false);
  const [globalEffectEditIndex, setGlobalEffectEditIndex] = useState<number | null>(null);
  const [globalEffectKind, setGlobalEffectKind] = useState<string>("gdp_growth_base");
  const [globalEffectTarget, setGlobalEffectTarget] = useState<string | null>(null);
  const [globalEffectValue, setGlobalEffectValue] = useState<string>("");
  const [budgetOpen, setBudgetOpen] = useState(true);
  const [budgetMinistryOpen, setBudgetMinistryOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BUDGET_MINISTRY_KEYS.map((k) => [k, true]))
  );
  const [simulatorMinistry, setSimulatorMinistry] = useState<string>(BUDGET_MINISTRY_KEYS[0]);
  const [simulatorBase, setSimulatorBase] = useState<string>("5");
  const [simulatorWorldAvg, setSimulatorWorldAvg] = useState<string>("5");
  const [simulatorAllocationPct, setSimulatorAllocationPct] = useState<number>(10);
  const [mobilisationOpen, setMobilisationOpen] = useState(false);
  const [worldDateOpen, setWorldDateOpen] = useState(false);
  const [influenceOpen, setInfluenceOpen] = useState(false);
  const [sphereOpen, setSphereOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [matriceOpen, setMatriceOpen] = useState(true);
  const [diplomatieOpen, setDiplomatieOpen] = useState(true);
  const [effetsGlobauxOpen, setEffetsGlobauxOpen] = useState(true);
  const [loisOpen, setLoisOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMajorFormOpen, setAiMajorFormOpen] = useState(false);
  const [aiMajorEditIndex, setAiMajorEditIndex] = useState<number | null>(null);
  const [aiMajorEffectKind, setAiMajorEffectKind] = useState<string>("gdp_growth_base");
  const [aiMajorEffectTarget, setAiMajorEffectTarget] = useState<string | null>(null);
  const [aiMajorEffectValue, setAiMajorEffectValue] = useState<string>("");
  const [aiMinorFormOpen, setAiMinorFormOpen] = useState(false);
  const [aiMinorEditIndex, setAiMinorEditIndex] = useState<number | null>(null);
  const [aiMinorEffectKind, setAiMinorEffectKind] = useState<string>("gdp_growth_base");
  const [aiMinorEffectTarget, setAiMinorEffectTarget] = useState<string | null>(null);
  const [aiMinorEffectValue, setAiMinorEffectValue] = useState<string>("");

  const supabase = createClient();

  const updateValue = (id: string, value: unknown) => {
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, value } : r))
    );
  };

  async function saveAll() {
    if (items.length === 0) return;
    setError(null);
    setSaving(true);
    let hadError = false;
    for (const row of items) {
      const { error: err } = await supabase
        .from("rule_parameters")
        .update({ value: row.value })
        .eq("id", row.id);
      if (err) {
        setError(err.message);
        hadError = true;
        break;
      }
    }
    if (!hadError) {
      await revalidateCountryPageGlobals();
    }
    setSaving(false);
  }

  const rulesByKey = useMemo(() => new Map(items.map((r) => [r.key, r])), [items]);
  const mobilisationConfigKey = "mobilisation_config";
  const mobilisationEffectsKey = "mobilisation_level_effects";
  const globalGrowthEffectsKey = "global_growth_effects";
  const aiMajorEffectsKey = "ai_major_effects";
  const aiMinorEffectsKey = "ai_minor_effects";
  const worldDateKey = "world_date";
  const worldDateAdvanceKey = "world_date_advance_months";
  const influenceConfigKey = "influence_config";
  const sphereInfluencePctKey = "sphere_influence_pct";
  const statsDiceModifierRangesKey = "stats_dice_modifier_ranges";

  const globalGrowthEffectsRule = useMemo(() => items.find((r) => r.key === globalGrowthEffectsKey), [items]);
  const worldDateRule = useMemo(() => items.find((r) => r.key === worldDateKey), [items]);
  const worldDateAdvanceRule = useMemo(() => items.find((r) => r.key === worldDateAdvanceKey), [items]);
  const influenceConfigRule = useMemo(() => items.find((r) => r.key === influenceConfigKey), [items]);
  const sphereInfluencePctRule = useMemo(() => items.find((r) => r.key === sphereInfluencePctKey), [items]);

  type SphereInfluencePctValue = { contested?: number; occupied?: number; annexed?: number };
  function getSphereInfluencePct(): SphereInfluencePctValue {
    if (sphereInfluencePctRule?.value && typeof sphereInfluencePctRule.value === "object" && sphereInfluencePctRule.value !== null) {
      return sphereInfluencePctRule.value as SphereInfluencePctValue;
    }
    return { contested: 50, occupied: 80, annexed: 100 };
  }
  function updateSphereInfluencePct(patch: Partial<SphereInfluencePctValue>) {
    if (!sphereInfluencePctRule) return;
    updateValue(sphereInfluencePctRule.id, { ...getSphereInfluencePct(), ...patch });
  }

  type InfluenceConfigValue = {
    mult_gdp?: number;
    mult_population?: number;
    mult_military?: number;
    stability_modifier_min?: number;
    stability_modifier_max?: number;
    gravity_pct_gdp?: number;
    gravity_pct_population?: number;
    gravity_pct_military?: number;
  };
  function getInfluenceConfig(): InfluenceConfigValue {
    if (!influenceConfigRule?.value || typeof influenceConfigRule.value !== "object") {
      return { mult_gdp: 1e-9, mult_population: 1e-7, mult_military: 0.01, stability_modifier_min: 0, stability_modifier_max: 1, gravity_pct_gdp: 50, gravity_pct_population: 50, gravity_pct_military: 50 };
    }
    return influenceConfigRule.value as InfluenceConfigValue;
  }
  function updateInfluenceConfig(patch: Partial<InfluenceConfigValue>) {
    if (!influenceConfigRule) return;
    updateValue(influenceConfigRule.id, { ...getInfluenceConfig(), ...patch });
  }

  function getGlobalGrowthEffects(): GlobalGrowthEffectEntry[] {
    if (!globalGrowthEffectsRule?.value || !Array.isArray(globalGrowthEffectsRule.value)) return [];
    return (globalGrowthEffectsRule.value as GlobalGrowthEffectEntry[]).filter(
      (e) => e && typeof e.effect_kind === "string" && typeof e.value === "number"
    );
  }
  function setGlobalGrowthEffects(arr: GlobalGrowthEffectEntry[]) {
    if (!globalGrowthEffectsRule) return;
    updateValue(globalGrowthEffectsRule.id, arr);
  }
  function addGlobalEffect(entry: GlobalGrowthEffectEntry) {
    setGlobalGrowthEffects([...getGlobalGrowthEffects(), entry]);
  }
  function updateGlobalEffectAtIndex(index: number, entry: GlobalGrowthEffectEntry) {
    const arr = getGlobalGrowthEffects();
    const next = arr.map((e, i) => (i === index ? entry : e));
    setGlobalGrowthEffects(next);
  }
  function removeGlobalEffect(index: number) {
    setGlobalGrowthEffects(getGlobalGrowthEffects().filter((_, i) => i !== index));
  }
  function getDefaultTargetForKindGlobal(effectKind: string): string | null {
    if (EFFECT_KINDS_WITH_STAT_TARGET.has(effectKind)) return STAT_KEYS[0];
    if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(effectKind)) return getBudgetMinistryOptions()[0]?.key ?? BUDGET_MINISTRY_KEYS[0];
    if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(effectKind)) return MILITARY_BRANCH_EFFECT_IDS[0];
    if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectKind)) return rosterUnits[0]?.id ?? null;
    return null;
  }
  function openAddGlobalEffect() {
    const firstKind = ALL_EFFECT_KIND_IDS[0];
    setGlobalEffectKind(firstKind);
    setGlobalEffectTarget(getDefaultTargetForKindGlobal(firstKind));
    setGlobalEffectValue("");
    setGlobalEffectEditIndex(null);
    setGlobalEffectFormOpen(true);
  }
  function openEditGlobalEffect(index: number) {
    const arr = getGlobalGrowthEffects();
    const e = arr[index];
    if (!e) return;
    const helper = getEffectKindValueHelper(e.effect_kind);
    setGlobalEffectKind(e.effect_kind);
    setGlobalEffectTarget(e.effect_target);
    setGlobalEffectValue(String(helper.storedToDisplay(Number(e.value))));
    setGlobalEffectEditIndex(index);
    setGlobalEffectFormOpen(true);
  }
  function saveGlobalEffectForm() {
    const valueNum = Number(globalEffectValue);
    if (Number.isNaN(valueNum)) return;
    const helper = getEffectKindValueHelper(globalEffectKind);
    const valueStored = helper.displayToStored(valueNum);
    const needsTarget =
      EFFECT_KINDS_WITH_STAT_TARGET.has(globalEffectKind) ||
      EFFECT_KINDS_WITH_BUDGET_TARGET.has(globalEffectKind) ||
      EFFECT_KINDS_WITH_BRANCH_TARGET.has(globalEffectKind) ||
      EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(globalEffectKind);
    const entry: GlobalGrowthEffectEntry = {
      effect_kind: globalEffectKind,
      effect_target: needsTarget ? globalEffectTarget : null,
      value: valueStored,
    };
    if (globalEffectEditIndex !== null) {
      updateGlobalEffectAtIndex(globalEffectEditIndex, entry);
    } else {
      addGlobalEffect(entry);
    }
    setGlobalEffectFormOpen(false);
  }
  function labelForGlobalEffect(e: GlobalGrowthEffectEntry): string {
    const kindLabel = EFFECT_KIND_LABELS[e.effect_kind] ?? e.effect_kind;
    let targetLabel: string | null = null;
    if (e.effect_target) {
      if (EFFECT_KINDS_WITH_STAT_TARGET.has(e.effect_kind))
        targetLabel = STAT_LABELS[e.effect_target as keyof typeof STAT_LABELS] ?? e.effect_target;
      else if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(e.effect_kind))
        targetLabel = BUDGET_MINISTRY_LABELS[e.effect_target] ?? e.effect_target;
      else if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(e.effect_kind))
        targetLabel = MILITARY_BRANCH_EFFECT_LABELS[e.effect_target] ?? e.effect_target;
      else if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(e.effect_kind))
        targetLabel = rosterUnits.find((u) => u.id === e.effect_target)?.name_fr ?? e.effect_target;
      else targetLabel = e.effect_target;
    }
    const valueStr = formatEffectValue(e.effect_kind, e.value);
    return targetLabel ? `${kindLabel} — ${targetLabel} : ${valueStr}` : `${kindLabel} : ${valueStr}`;
  }

  const aiMajorEffectsRule = useMemo(() => items.find((r) => r.key === aiMajorEffectsKey), [items]);
  const aiMinorEffectsRule = useMemo(() => items.find((r) => r.key === aiMinorEffectsKey), [items]);
  function getAiEffects(rule: RuleParameter | undefined): GlobalGrowthEffectEntry[] {
    if (!rule?.value || !Array.isArray(rule.value)) return [];
    return (rule.value as GlobalGrowthEffectEntry[]).filter(
      (e) => e && typeof e.effect_kind === "string" && typeof e.value === "number"
    );
  }
  function setAiEffects(rule: RuleParameter | undefined, arr: GlobalGrowthEffectEntry[]) {
    if (!rule) return;
    updateValue(rule.id, arr);
  }
  function openAddAiEffect(which: "major" | "minor") {
    const firstKind = ALL_EFFECT_KIND_IDS[0];
    const defTarget = getDefaultTargetForKindGlobal(firstKind);
    if (which === "major") {
      setAiMajorEffectKind(firstKind);
      setAiMajorEffectTarget(defTarget);
      setAiMajorEffectValue("");
      setAiMajorEditIndex(null);
      setAiMajorFormOpen(true);
    } else {
      setAiMinorEffectKind(firstKind);
      setAiMinorEffectTarget(defTarget);
      setAiMinorEffectValue("");
      setAiMinorEditIndex(null);
      setAiMinorFormOpen(true);
    }
  }
  function openEditAiEffect(which: "major" | "minor", index: number) {
    const rule = which === "major" ? aiMajorEffectsRule : aiMinorEffectsRule;
    const arr = getAiEffects(rule);
    const e = arr[index];
    if (!e) return;
    const helper = getEffectKindValueHelper(e.effect_kind);
    if (which === "major") {
      setAiMajorEffectKind(e.effect_kind);
      setAiMajorEffectTarget(e.effect_target);
      setAiMajorEffectValue(String(helper.storedToDisplay(Number(e.value))));
      setAiMajorEditIndex(index);
      setAiMajorFormOpen(true);
    } else {
      setAiMinorEffectKind(e.effect_kind);
      setAiMinorEffectTarget(e.effect_target);
      setAiMinorEffectValue(String(helper.storedToDisplay(Number(e.value))));
      setAiMinorEditIndex(index);
      setAiMinorFormOpen(true);
    }
  }
  function saveAiEffectForm(which: "major" | "minor") {
    const rule = which === "major" ? aiMajorEffectsRule : aiMinorEffectsRule;
    if (!rule) return;
    const kind = which === "major" ? aiMajorEffectKind : aiMinorEffectKind;
    const target = which === "major" ? aiMajorEffectTarget : aiMinorEffectTarget;
    const valueStr = which === "major" ? aiMajorEffectValue : aiMinorEffectValue;
    const valueNum = Number(valueStr);
    if (Number.isNaN(valueNum)) return;
    const helper = getEffectKindValueHelper(kind);
    const valueStored = helper.displayToStored(valueNum);
    const needsTarget =
      EFFECT_KINDS_WITH_STAT_TARGET.has(kind) ||
      EFFECT_KINDS_WITH_BUDGET_TARGET.has(kind) ||
      EFFECT_KINDS_WITH_BRANCH_TARGET.has(kind) ||
      EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(kind);
    const entry: GlobalGrowthEffectEntry = {
      effect_kind: kind,
      effect_target: needsTarget ? target : null,
      value: valueStored,
    };
    const arr = getAiEffects(rule);
    const editIndex = which === "major" ? aiMajorEditIndex : aiMinorEditIndex;
    if (editIndex !== null) {
      const next = arr.map((elem, i) => (i === editIndex ? entry : elem));
      setAiEffects(rule, next);
    } else {
      setAiEffects(rule, [...arr, entry]);
    }
    if (which === "major") {
      setAiMajorFormOpen(false);
    } else {
      setAiMinorFormOpen(false);
    }
  }
  function removeAiEffect(which: "major" | "minor", index: number) {
    const rule = which === "major" ? aiMajorEffectsRule : aiMinorEffectsRule;
    if (!rule) return;
    setAiEffects(rule, getAiEffects(rule).filter((_, i) => i !== index));
  }

  const mobilisationConfigRule = useMemo(() => items.find((r) => r.key === mobilisationConfigKey), [items]);
  const mobilisationEffectsRule = useMemo(() => items.find((r) => r.key === mobilisationEffectsKey), [items]);
  const statsDiceModifierRangesRule = useMemo(() => items.find((r) => r.key === statsDiceModifierRangesKey), [items]);

  type StatsDiceModifierRangesValue = Record<string, { min: number; max: number }>;
  function getStatsDiceModifierRanges(): StatsDiceModifierRangesValue {
    if (!statsDiceModifierRangesRule?.value || typeof statsDiceModifierRangesRule.value !== "object") {
      return {
        militarism: { min: -10, max: 20 },
        industry: { min: -10, max: 20 },
        science: { min: -10, max: 20 },
        stability: { min: -10, max: 20 },
      };
    }
    return statsDiceModifierRangesRule.value as StatsDiceModifierRangesValue;
  }
  function updateStatsDiceModifierRanges(statKey: string, field: "min" | "max", value: number) {
    if (!statsDiceModifierRangesRule) return;
    const current = getStatsDiceModifierRanges();
    const stat = current[statKey] ?? { min: -10, max: 20 };
    updateValue(statsDiceModifierRangesRule.id, {
      ...current,
      [statKey]: { ...stat, [field]: value },
    });
  }

  type MobilisationConfigValue = {
    level_thresholds?: Record<string, number>;
    daily_step?: number;
  };
  function getMobilisationConfig(): MobilisationConfigValue {
    if (mobilisationConfigRule?.value && typeof mobilisationConfigRule.value === "object" && mobilisationConfigRule.value !== null) {
      return mobilisationConfigRule.value as MobilisationConfigValue;
    }
    return {
      level_thresholds: {
        demobilisation: 0,
        reserve_active: 200,
        mobilisation_partielle: 300,
        mobilisation_generale: 400,
        guerre_patriotique: 500,
      },
      daily_step: 20,
    };
  }

  const MOBILISATION_LEVEL_KEYS = [
    "demobilisation",
    "reserve_active",
    "mobilisation_partielle",
    "mobilisation_generale",
    "guerre_patriotique",
  ] as const;
  const MOBILISATION_LEVEL_LABELS: Record<string, string> = {
    demobilisation: "Démobilisation",
    reserve_active: "Réserve Active",
    mobilisation_partielle: "Mobilisation Partielle",
    mobilisation_generale: "Mobilisation Générale",
    guerre_patriotique: "Guerre Patriotique",
  };

  function updateMobilisationConfig(updates: Partial<MobilisationConfigValue>) {
    if (!mobilisationConfigRule) return;
    const current = getMobilisationConfig();
    updateValue(mobilisationConfigRule.id, { ...current, ...updates });
  }
  function updateMobilisationThreshold(key: string, value: number) {
    const current = getMobilisationConfig();
    const level_thresholds = { ...(current.level_thresholds ?? {}), [key]: value };
    updateMobilisationConfig({ level_thresholds });
  }

  type MobilisationLevelEffect = { level: string; effect_kind: string; effect_target: string | null; value: number };
  function getMobilisationLevelEffects(): MobilisationLevelEffect[] {
    if (mobilisationEffectsRule?.value && Array.isArray(mobilisationEffectsRule.value)) {
      return mobilisationEffectsRule.value as MobilisationLevelEffect[];
    }
    return [];
  }
  function setMobilisationLevelEffects(arr: MobilisationLevelEffect[]) {
    if (!mobilisationEffectsRule) return;
    updateValue(mobilisationEffectsRule.id, arr);
  }
  function getMobilisationEffectsForLevel(levelKey: string): { effect: MobilisationLevelEffect; globalIndex: number }[] {
    const all = getMobilisationLevelEffects();
    return all.map((e, i) => ({ effect: e, globalIndex: i })).filter(({ effect }) => effect.level === levelKey);
  }
  function getDefaultTargetForKind(effectKind: string): string | null {
    if (EFFECT_KINDS_WITH_STAT_TARGET.has(effectKind)) return STAT_KEYS[0];
    if (EFFECT_KINDS_WITH_BUDGET_TARGET.has(effectKind)) return getBudgetMinistryOptions()[0]?.key ?? BUDGET_MINISTRY_KEYS[0];
    if (EFFECT_KINDS_WITH_BRANCH_TARGET.has(effectKind)) return MILITARY_BRANCH_EFFECT_IDS[0];
    if (EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectKind)) return rosterUnits[0]?.id ?? null;
    return null;
  }
  function addMobilisationEffect(level: string) {
    setMobilisationLevelEffects([...getMobilisationLevelEffects(), { level, effect_kind: "stat_delta", effect_target: "militarism", value: 0 }]);
  }
  function removeMobilisationEffect(index: number) {
    const arr = getMobilisationLevelEffects().filter((_, i) => i !== index);
    setMobilisationLevelEffects(arr);
  }
  function updateMobilisationEffect(index: number, patch: Partial<MobilisationLevelEffect>) {
    const arr = getMobilisationLevelEffects();
    const next = arr.map((e, i) => {
      if (i !== index) return e;
      const merged = { ...e, ...patch };
      if (patch.effect_kind != null && patch.effect_kind !== e.effect_kind) {
        merged.effect_target = getDefaultTargetForKind(patch.effect_kind);
      }
      return merged;
    });
    setMobilisationLevelEffects(next);
  }

  function getBudgetValue(r: RuleParameter): BudgetMinistryValue {
    if (typeof r.value === "object" && r.value !== null && !Array.isArray(r.value)) {
      return r.value as BudgetMinistryValue;
    }
    return { min_pct: 5, gravity_pct: 50, bonuses: {}, maluses: {} };
  }

  function updateBudgetField(
    r: RuleParameter,
    field: keyof BudgetMinistryValue,
    subKey: string | null,
    val: number
  ) {
    const current = getBudgetValue(r);
    if (field === "bonuses" && subKey) {
      const bonuses = { ...(current.bonuses ?? {}), [subKey]: val };
      updateValue(r.id, { ...current, bonuses });
    } else if (field === "maluses" && subKey) {
      const maluses = { ...(current.maluses ?? {}), [subKey]: val };
      updateValue(r.id, { ...current, maluses });
    } else {
      updateValue(r.id, { ...current, [field]: val });
    }
  }

  function updateBudgetEffects(r: RuleParameter, effects: BudgetMinistryEffectDef[]) {
    const current = getBudgetValue(r);
    updateValue(r.id, { ...current, effects });
  }

  function addBudgetEffect(r: RuleParameter) {
    const current = getBudgetValue(r);
    const next: BudgetMinistryEffectDef = {
      effect_type: "population",
      bonus: 0,
      malus: -0.05,
      gravity_applies: BUDGET_EFFECT_TYPES.find((t) => t.id === "population")?.defaultGravityApplies ?? false,
    };
    const effects = [...(current.effects ?? []), next];
    updateValue(r.id, { ...current, effects });
  }

  function removeBudgetEffect(r: RuleParameter, index: number) {
    const current = getBudgetValue(r);
    const effects = (current.effects ?? []).filter((_, i) => i !== index);
    updateValue(r.id, { ...current, effects });
  }

  function updateBudgetEffectAt(
    r: RuleParameter,
    index: number,
    patch: Partial<BudgetMinistryEffectDef>
  ) {
    const current = getBudgetValue(r);
    const effects = [...(current.effects ?? [])];
    if (!effects[index]) return;
    effects[index] = { ...effects[index], ...patch };
    updateValue(r.id, { ...current, effects });
  }

  function parseRuleValueAndUpdate(id: string, v: string) {
    let parsed: unknown = v;
    if (new RegExp("^-?\\d+(\\.\\d+)?$").test(v)) parsed = Number(v);
    else if (v.startsWith("{") || v.startsWith("[")) {
      try {
        parsed = JSON.parse(v);
      } catch {
        parsed = v;
      }
    }
    updateValue(id, parsed);
  }

  const inputClass =
    "w-full rounded border bg-[var(--background)] px-1.5 py-1 font-mono text-xs text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";
  const inputClassNarrow =
    "w-full max-w-20 rounded border bg-[var(--background)] px-1.5 py-1 font-mono text-xs text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";
  const inputStyle = { borderColor: "var(--border)" };

  const ruleForMinistry = rulesByKey.get(simulatorMinistry);
  const simulatorParams = ruleForMinistry ? getBudgetValue(ruleForMinistry) : null;
  const baseNum = Number(simulatorBase);
  const worldAvgNum = Number(simulatorWorldAvg);
  const validNums = !Number.isNaN(baseNum) && !Number.isNaN(worldAvgNum) && simulatorParams;
  const catchUpFactor = validNums && worldAvgNum > 0
    ? 1 + ((simulatorParams.gravity_pct ?? 50) / 100) * (worldAvgNum - baseNum) / Math.max(worldAvgNum, 0.01)
    : 1;
  const minPct = simulatorParams?.min_pct ?? 5;
  const effectsResolved = (simulatorParams && getEffectsListForMinistry(simulatorMinistry, simulatorParams)) ?? [];
  const allocationBelowMin = simulatorAllocationPct < minPct;
  const malusScale = allocationBelowMin && minPct > 0
    ? (minPct - simulatorAllocationPct) / minPct
    : 0;
  const bonusScale = !allocationBelowMin && minPct < 100
    ? (simulatorAllocationPct - minPct) / (100 - minPct)
    : 0;
  const bonusesPerDay = effectsResolved.map((eff) => {
    const label = BUDGET_EFFECT_TYPE_LABELS[eff.effect_type] ?? eff.effect_type;
    const malus = malusScale * eff.malus;
    const bonus = !allocationBelowMin ? eff.bonus * bonusScale * catchUpFactor : 0;
    return { label, perDay: bonus, malusPerDay: malus };
  });

  return (
    <div className="space-y-4">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
            Règles de simulation
          </h1>
          <p className="text-[var(--foreground-muted)]">
            Ces paramètres sont utilisés par le cron pour faire évoluer population, PIB, etc.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={saveAll}
            disabled={saving}
            className="shrink-0 rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        )}
      </div>
      {error && <p className="text-[var(--danger)]">{error}</p>}
      {!(items.length > 0 || (countriesForMatrice && relationMapForMatrice)) ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          <p className="text-[var(--foreground-muted)]">Aucun paramètre. Ajoutez-en via SQL (table rule_parameters).</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden p-4"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          {items.length > 0 && (
            <CollapsibleBlock title="Effets Globaux" open={effetsGlobauxOpen} onToggle={() => setEffetsGlobauxOpen((o) => !o)} variant="section">
              {globalGrowthEffectsRule && (
            <CollapsibleBlock title="Global [Appliqué à tous les pays]" open={globalGrowthOpen} onToggle={() => setGlobalGrowthOpen((o) => !o)}>
              <div className="p-3 space-y-3">
                <p className="text-xs text-[var(--foreground-muted)]">
                  Effets de croissance PIB et population appliqués à tous les pays à chaque passage du cron.
                </p>
                <ul className="space-y-2">
                  {getGlobalGrowthEffects().map((e, idx) => (
                    <li
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
                      style={{ borderColor: "var(--border-muted)" }}
                    >
                      <span className="text-sm text-[var(--foreground)]">{labelForGlobalEffect(e)}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditGlobalEffect(idx)}
                          className="text-xs text-[var(--accent)] hover:underline"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGlobalEffect(idx)}
                          className="text-xs text-[var(--danger)] hover:underline"
                        >
                          Supprimer
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {!globalEffectFormOpen ? (
                  <button
                    type="button"
                    onClick={openAddGlobalEffect}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    Ajouter un effet
                  </button>
                ) : (
                  <div className="rounded border p-3 space-y-2" style={{ borderColor: "var(--border-muted)" }}>
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Type d'effet</label>
                      <select
                        value={globalEffectKind}
                        onChange={(ev) => {
                          const k = ev.target.value;
                          setGlobalEffectKind(k);
                          setGlobalEffectTarget(getDefaultTargetForKindGlobal(k));
                        }}
                        className={inputClass}
                        style={inputStyle}
                      >
                        {ALL_EFFECT_KIND_IDS.map((k) => (
                          <option key={k} value={k}>{EFFECT_KIND_LABELS[k] ?? k}</option>
                        ))}
                      </select>
                    </div>
                    {EFFECT_KINDS_WITH_STAT_TARGET.has(globalEffectKind) && (
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Stat</label>
                        <select
                          value={globalEffectTarget ?? STAT_KEYS[0]}
                          onChange={(ev) => setGlobalEffectTarget(ev.target.value || null)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {STAT_KEYS.map((k) => (
                            <option key={k} value={k}>{STAT_LABELS[k]}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {EFFECT_KINDS_WITH_BUDGET_TARGET.has(globalEffectKind) && (
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ministère</label>
                        <select
                          value={globalEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""}
                          onChange={(ev) => setGlobalEffectTarget(ev.target.value || null)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {getBudgetMinistryOptions().map(({ key, label }) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {EFFECT_KINDS_WITH_BRANCH_TARGET.has(globalEffectKind) && (
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Branche</label>
                        <select
                          value={globalEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]}
                          onChange={(ev) => setGlobalEffectTarget(ev.target.value || null)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {MILITARY_BRANCH_EFFECT_IDS.map((b) => (
                            <option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(globalEffectKind) && (
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Unité</label>
                        <select
                          value={globalEffectTarget ?? rosterUnits[0]?.id ?? ""}
                          onChange={(ev) => setGlobalEffectTarget(ev.target.value || null)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {rosterUnits.map((u) => (
                            <option key={u.id} value={u.id}>{u.name_fr}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">
                        {getEffectKindValueHelper(globalEffectKind).valueLabel}
                      </label>
                      <input
                        type="number"
                        step={getEffectKindValueHelper(globalEffectKind).valueStep}
                        value={globalEffectValue}
                        onChange={(e) => setGlobalEffectValue(e.target.value)}
                        className={inputClassNarrow}
                        style={inputStyle}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveGlobalEffectForm}
                        className="rounded py-1.5 px-3 text-sm font-medium"
                        style={{ background: "var(--accent)", color: "#0f1419" }}
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => setGlobalEffectFormOpen(false)}
                        className="rounded border py-1.5 px-3 text-sm"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleBlock>
          )}
              {statsDiceModifierRangesRule && (
                <CollapsibleBlock title="Statistiques" open={statsOpen} onToggle={() => setStatsOpen((o) => !o)}>
                  <div className="p-3 space-y-4">
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Modificateur min/max pour les jets de dés (ex. -10 à +20). Ces bornes sont utilisées pour calculer le bonus ou malus proportionnel à la valeur de chaque stat du pays.
                    </p>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                      {STAT_KEYS.map((statKey) => {
                        const ranges = getStatsDiceModifierRanges()[statKey] ?? { min: -10, max: 20 };
                        return (
                          <div key={statKey} className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                            <div className="text-sm font-medium text-[var(--foreground)] mb-2">{STAT_LABELS[statKey]}</div>
                            <div className="flex flex-wrap gap-2">
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">Min</label>
                                <input type="number" value={ranges.min} onChange={(e) => updateStatsDiceModifierRanges(statKey, "min", Number(e.target.value) ?? -10)} className={inputClassNarrow} style={inputStyle} />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">Max</label>
                                <input type="number" value={ranges.max} onChange={(e) => updateStatsDiceModifierRanges(statKey, "max", Number(e.target.value) ?? 20)} className={inputClassNarrow} style={inputStyle} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleBlock>
              )}
              {worldDateRule && worldDateAdvanceRule && (
                <CollapsibleBlock title="Date" open={worldDateOpen} onToggle={() => setWorldDateOpen((o) => !o)}>
                  <div className="p-3 space-y-3">
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Date du monde affichée aux joueurs (ex. Rapport du Cabinet). À chaque passage du cron, la date avance du nombre de mois indiqué dans la temporalité (0 = date figée).
                    </p>
                    <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Mois</label>
                        <select
                          value={typeof worldDateRule.value === "object" && worldDateRule.value !== null && "month" in worldDateRule.value ? Number((worldDateRule.value as { month?: number }).month) : 1}
                          onChange={(e) => {
                            const month = Number(e.target.value);
                            const current = typeof worldDateRule.value === "object" && worldDateRule.value !== null && "year" in worldDateRule.value ? (worldDateRule.value as { year?: number }).year : 2025;
                            updateValue(worldDateRule.id, { month, year: current });
                          }}
                          className="rounded border py-1.5 px-2 text-sm w-36"
                          style={{ borderColor: "var(--border)", background: "var(--background)" }}
                        >
                          {MOIS_LABELS.map((label, i) => (
                            <option key={i} value={i + 1}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Année</label>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          value={typeof worldDateRule.value === "object" && worldDateRule.value !== null && "year" in worldDateRule.value ? Number((worldDateRule.value as { year?: number }).year) : 2025}
                          onChange={(e) => {
                            const year = Math.max(1, Math.min(9999, Number(e.target.value) || 2025));
                            const current = typeof worldDateRule.value === "object" && worldDateRule.value !== null && "month" in worldDateRule.value ? (worldDateRule.value as { month?: number }).month : 1;
                            updateValue(worldDateRule.id, { month: current, year });
                          }}
                          className="rounded border py-1.5 px-2 text-sm w-20"
                          style={{ borderColor: "var(--border)", background: "var(--background)" }}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Temporalité (mois par mise à jour cron)</label>
                        <input
                          type="number"
                          min={0}
                          max={12}
                          value={typeof worldDateAdvanceRule.value === "number" ? worldDateAdvanceRule.value : (worldDateAdvanceRule.value as unknown as number) ?? 1}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(12, Math.round(Number(e.target.value)) ?? 0));
                            updateValue(worldDateAdvanceRule.id, v);
                          }}
                          className="rounded border py-1.5 px-2 text-sm w-16"
                          style={{ borderColor: "var(--border)", background: "var(--background)" }}
                        />
                      </div>
                    </div>
                  </div>
                </CollapsibleBlock>
              )}
            </CollapsibleBlock>
          )}

          {items.length > 0 && (
          <CollapsibleBlock title="Lois" open={loisOpen} onToggle={() => setLoisOpen((o) => !o)} variant="section">
          <CollapsibleBlock title="Paramètres Budget" open={budgetOpen} onToggle={() => setBudgetOpen((o) => !o)}>
            <div className="pl-4 ml-2 border-l-2" style={{ borderColor: "var(--border-muted)" }}>
            {BUDGET_MINISTRY_KEYS.map((key) => {
              const r = rulesByKey.get(key);
              if (!r) return null;
              const val = getBudgetValue(r);
              const effectsList = val.effects ?? [];
              const isOpen = budgetMinistryOpen[key] ?? true;
              return (
                <CollapsibleBlock
                  key={r.id}
                  title={BUDGET_MINISTRY_LABELS[key] ?? key}
                  open={isOpen}
                  onToggle={() =>
                    setBudgetMinistryOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }))
                  }
                >
                  <div className="p-3 space-y-3" style={{ borderColor: "var(--border-muted)" }}>
                    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">% min</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={val.min_pct ?? 5}
                          onChange={(e) => updateBudgetField(r, "min_pct", null, Number(e.target.value))}
                          className={`${inputClassNarrow} w-14`}
                          style={inputStyle}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Gravité %</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={val.gravity_pct ?? 50}
                          onChange={(e) => updateBudgetField(r, "gravity_pct", null, Number(e.target.value))}
                          className={`${inputClassNarrow} w-14`}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-[var(--foreground-muted)]">Effets (type, bonus, malus, gravité)</span>
                        <button
                          type="button"
                          onClick={() => addBudgetEffect(r)}
                          className="rounded px-2 py-1 text-xs font-medium"
                          style={{ background: "var(--accent)", color: "#0f1419" }}
                        >
                          Ajouter un effet
                        </button>
                      </div>
                      {effectsList.length === 0 ? (
                        <p className="text-xs text-[var(--foreground-muted)]">
                          Aucun effet configuré (valeurs par défaut utilisées).
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {effectsList.map((effect, idx) => (
                            <li
                              key={idx}
                              className="flex flex-wrap items-end gap-x-2 gap-y-1 rounded border py-2 px-2"
                              style={{ borderColor: "var(--border-muted)" }}
                            >
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">Type</label>
                                <select
                                  value={effect.effect_type}
                                  onChange={(e) => updateBudgetEffectAt(r, idx, { effect_type: e.target.value as BudgetMinistryEffectDef["effect_type"] })}
                                  className={`${inputClassNarrow} min-w-28`}
                                  style={inputStyle}
                                >
                                  {BUDGET_EFFECT_TYPES.map((t) => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">Bonus</label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.001}
                                  value={effect.bonus}
                                  onChange={(e) => updateBudgetEffectAt(r, idx, { bonus: Number(e.target.value) })}
                                  className={`${inputClassNarrow} w-14`}
                                  style={inputStyle}
                                />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs text-[var(--foreground-muted)]">Malus</label>
                                <input
                                  type="number"
                                  max={0}
                                  step={0.001}
                                  value={effect.malus}
                                  onChange={(e) => updateBudgetEffectAt(r, idx, { malus: Number(e.target.value) })}
                                  className={`${inputClassNarrow} w-14`}
                                  style={inputStyle}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  id={`gravity-${r.id}-${idx}`}
                                  checked={effect.gravity_applies ?? (BUDGET_EFFECT_TYPES.find((t) => t.id === effect.effect_type)?.defaultGravityApplies ?? false)}
                                  onChange={(e) => updateBudgetEffectAt(r, idx, { gravity_applies: e.target.checked })}
                                  className="rounded"
                                />
                                <label htmlFor={`gravity-${r.id}-${idx}`} className="text-xs text-[var(--foreground-muted)]">Gravité</label>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeBudgetEffect(r, idx)}
                                className="rounded px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10"
                              >
                                Supprimer
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </CollapsibleBlock>
              );
            })}
            </div>
            <div
              className="border-t p-3"
              style={{ borderColor: "var(--border-muted)", background: "var(--background)" }}
            >
              <div className="mb-2 text-sm font-medium text-[var(--foreground)]">Simulateur (test des paramètres)</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ministère</label>
                  <select
                    value={simulatorMinistry}
                    onChange={(e) => setSimulatorMinistry(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  >
                    {BUDGET_MINISTRY_KEYS.map((k) => (
                      <option key={k} value={k}>{BUDGET_MINISTRY_LABELS[k] ?? k}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Valeur de base du pays</label>
                  <input
                    type="number"
                    step={0.01}
                    value={simulatorBase}
                    onChange={(e) => setSimulatorBase(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Moyenne mondiale</label>
                  <input
                    type="number"
                    step={0.01}
                    value={simulatorWorldAvg}
                    onChange={(e) => setSimulatorWorldAvg(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Allocation % (slider)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={simulatorAllocationPct}
                    onChange={(e) => setSimulatorAllocationPct(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-10 text-right font-mono text-sm text-[var(--foreground)]">{simulatorAllocationPct} %</span>
                </div>
              </div>
              <div className="mt-3 rounded border p-2" style={{ borderColor: "var(--border-muted)" }}>
                <div className="text-xs font-medium text-[var(--foreground-muted)]">Résultat / jour (× 30 ≈ / mois)</div>
                <ul className="mt-1 list-none space-y-0.5 font-mono text-sm text-[var(--foreground)]">
                  {bonusesPerDay.map(({ label, perDay, malusPerDay }) => (
                    <li key={label}>
                      {allocationBelowMin
                        ? `${label} : malus ${malusPerDay.toFixed(4)} / jour`
                        : `${label} : +${perDay.toFixed(4)} / jour`}
                    </li>
                  ))}
                  {bonusesPerDay.length === 0 && <li className="text-[var(--foreground-muted)]">Aucun effet</li>}
                </ul>
              </div>
            </div>
          </CollapsibleBlock>

          {mobilisationConfigRule && mobilisationEffectsRule && (
            <CollapsibleBlock title="Mobilisation" open={mobilisationOpen} onToggle={() => setMobilisationOpen((o) => !o)}>
              <div className="p-3 space-y-4">
                <p className="text-xs text-[var(--foreground-muted)]">
                  Les paramètres et effets de mobilisation sont lus par le cron à chaque exécution. Toute modification enregistrée ici sera prise en compte à la prochaine mise à jour quotidienne.
                </p>
                <div>
                  <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2">Seuils par palier (score 0–500)</div>
                  <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                    {MOBILISATION_LEVEL_KEYS.map((key) => {
                      const config = getMobilisationConfig();
                      const thresholds = config.level_thresholds ?? {};
                      const val = thresholds[key] ?? 0;
                      return (
                        <div key={key} className="flex flex-col gap-0.5">
                          <label className="text-xs text-[var(--foreground-muted)]">{MOBILISATION_LEVEL_LABELS[key]}</label>
                          <input
                            type="number"
                            min={0}
                            max={500}
                            value={val}
                            onChange={(e) => updateMobilisationThreshold(key, Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
                            className="rounded border py-1.5 px-2 text-sm w-20 font-mono"
                            style={{ borderColor: "var(--border)", background: "var(--background)" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-4">
                  {MOBILISATION_LEVEL_KEYS.map((levelKey) => {
                    const effectsWithIndex = getMobilisationEffectsForLevel(levelKey);
                    return (
                      <div key={levelKey} className="rounded border p-3" style={{ borderColor: "var(--border-muted)" }}>
                        <div className="text-sm font-medium text-[var(--foreground)] mb-2">{MOBILISATION_LEVEL_LABELS[levelKey]}</div>
                        <ul className="space-y-2">
                          {effectsWithIndex.map(({ effect: e, globalIndex: idx }) => {
                            const valueHelper = getEffectKindValueHelper(e.effect_kind);
                            const inputValue = valueHelper.storedToDisplay(Number(e.value));
                            const needsStatTarget = EFFECT_KINDS_WITH_STAT_TARGET.has(e.effect_kind);
                            const needsBudgetTarget = EFFECT_KINDS_WITH_BUDGET_TARGET.has(e.effect_kind);
                            const needsBranchTarget = EFFECT_KINDS_WITH_BRANCH_TARGET.has(e.effect_kind);
                            const needsRosterTarget = EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(e.effect_kind);
                            const onValueChange = (val: number) => updateMobilisationEffect(idx, { value: valueHelper.displayToStored(val) });
                            return (
                              <li key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                                {needsStatTarget && (
                                  <select
                                    value={e.effect_target ?? STAT_KEYS[0]}
                                    onChange={(ev) => updateMobilisationEffect(idx, { effect_target: ev.target.value || null })}
                                    className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                    style={{ borderColor: "var(--border)" }}
                                  >
                                    {STAT_KEYS.map((k) => (
                                      <option key={k} value={k}>{STAT_LABELS[k]}</option>
                                    ))}
                                  </select>
                                )}
                                {needsBudgetTarget && (
                                  <select
                                    value={e.effect_target ?? getBudgetMinistryOptions()[0]?.key ?? ""}
                                    onChange={(ev) => updateMobilisationEffect(idx, { effect_target: ev.target.value || null })}
                                    className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                    style={{ borderColor: "var(--border)" }}
                                  >
                                    {getBudgetMinistryOptions().map(({ key, label }) => (
                                      <option key={key} value={key}>{label}</option>
                                    ))}
                                  </select>
                                )}
                                {needsBranchTarget && (
                                  <select
                                    value={e.effect_target ?? MILITARY_BRANCH_EFFECT_IDS[0]}
                                    onChange={(ev) => updateMobilisationEffect(idx, { effect_target: ev.target.value || null })}
                                    className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                    style={{ borderColor: "var(--border)" }}
                                  >
                                    {MILITARY_BRANCH_EFFECT_IDS.map((b) => (
                                      <option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>
                                    ))}
                                  </select>
                                )}
                                {needsRosterTarget && (
                                  <select
                                    value={e.effect_target ?? rosterUnits[0]?.id ?? ""}
                                    onChange={(ev) => updateMobilisationEffect(idx, { effect_target: ev.target.value || null })}
                                    className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                    style={{ borderColor: "var(--border)", minWidth: "140px" }}
                                  >
                                    {rosterUnits.map((u) => (
                                      <option key={u.id} value={u.id}>{u.name_fr}</option>
                                    ))}
                                  </select>
                                )}
                                <label className="flex items-center gap-1">
                                  <span className="text-[var(--foreground-muted)] shrink-0">{valueHelper.valueLabel}</span>
                                  <input
                                    type="number"
                                    step={valueHelper.valueStep}
                                    value={inputValue}
                                    onChange={(ev) => onValueChange(Number(ev.target.value) || 0)}
                                    className="w-20 rounded border bg-[var(--background)] px-1.5 py-1 font-mono text-[var(--foreground)]"
                                    style={{ borderColor: "var(--border)" }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removeMobilisationEffect(idx)}
                                  className="text-[var(--danger)] hover:underline"
                                >
                                  Supprimer
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        <button
                          type="button"
                          onClick={() => addMobilisationEffect(levelKey)}
                          className="mt-1 text-xs text-[var(--accent)] hover:underline"
                        >
                          Ajouter un effet
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CollapsibleBlock>
          )}
          </CollapsibleBlock>
          )}

          {(countriesForMatrice && relationMapForMatrice) && (
            <CollapsibleBlock title="Diplomatie" open={diplomatieOpen} onToggle={() => setDiplomatieOpen((o) => !o)} variant="section">
              <CollapsibleBlock title="Matrice diplomatique" open={matriceOpen} onToggle={() => setMatriceOpen((o) => !o)}>
                <div className="p-3">
                  <MatriceDiplomatiqueForm countries={countriesForMatrice} relationMap={relationMapForMatrice} />
                </div>
              </CollapsibleBlock>
              {items.length > 0 && influenceConfigRule && (
                <CollapsibleBlock title="Influence" open={influenceOpen} onToggle={() => setInfluenceOpen((o) => !o)}>
                  <div className="p-3 space-y-3">
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Score Influence (type Diplomatic Weight) : multiplicateurs des contributions PIB, Population, Hard Power ; stabilité en intervalle (-3 à +3) ; gravité par paramètre.
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Mult. PIB</label>
                        <input type="number" step="any" value={getInfluenceConfig().mult_gdp ?? 1e-9} onChange={(e) => updateInfluenceConfig({ mult_gdp: Number(e.target.value) || 0 })} className="rounded border py-1.5 px-2 text-sm w-28 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Mult. Population</label>
                        <input type="number" step="any" value={getInfluenceConfig().mult_population ?? 1e-7} onChange={(e) => updateInfluenceConfig({ mult_population: Number(e.target.value) || 0 })} className="rounded border py-1.5 px-2 text-sm w-28 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Mult. Hard Power</label>
                        <input type="number" step="any" value={getInfluenceConfig().mult_military ?? 0.01} onChange={(e) => updateInfluenceConfig({ mult_military: Number(e.target.value) || 0 })} className="rounded border py-1.5 px-2 text-sm w-28 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Stabilité : modif. à min (-3)</label>
                        <input type="number" step="any" value={getInfluenceConfig().stability_modifier_min ?? 0} onChange={(e) => updateInfluenceConfig({ stability_modifier_min: Number(e.target.value) ?? 0 })} className="rounded border py-1.5 px-2 text-sm w-24 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Stabilité : modif. à max (+3)</label>
                        <input type="number" step="any" value={getInfluenceConfig().stability_modifier_max ?? 1} onChange={(e) => updateInfluenceConfig({ stability_modifier_max: Number(e.target.value) ?? 1 })} className="rounded border py-1.5 px-2 text-sm w-24 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Gravité PIB %</label>
                        <input type="number" min={0} max={100} value={getInfluenceConfig().gravity_pct_gdp ?? 50} onChange={(e) => updateInfluenceConfig({ gravity_pct_gdp: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-16 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Gravité Population %</label>
                        <input type="number" min={0} max={100} value={getInfluenceConfig().gravity_pct_population ?? 50} onChange={(e) => updateInfluenceConfig({ gravity_pct_population: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-16 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Gravité Hard Power %</label>
                        <input type="number" min={0} max={100} value={getInfluenceConfig().gravity_pct_military ?? 50} onChange={(e) => updateInfluenceConfig({ gravity_pct_military: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-16 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                    </div>
                  </div>
                </CollapsibleBlock>
              )}
              {items.length > 0 && sphereInfluencePctRule && (
                <CollapsibleBlock title="Sphère" open={sphereOpen} onToggle={() => setSphereOpen((o) => !o)}>
                  <div className="p-3 space-y-3">
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Pour chaque statut de contrôle, le % de l&apos;influence du pays sous emprise qui est attribué à l&apos;overlord.
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Contesté %</label>
                        <input type="number" min={0} max={100} value={getSphereInfluencePct().contested ?? 50} onChange={(e) => updateSphereInfluencePct({ contested: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-20 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Occupé %</label>
                        <input type="number" min={0} max={100} value={getSphereInfluencePct().occupied ?? 80} onChange={(e) => updateSphereInfluencePct({ occupied: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-20 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">Annexé %</label>
                        <input type="number" min={0} max={100} value={getSphereInfluencePct().annexed ?? 100} onChange={(e) => updateSphereInfluencePct({ annexed: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className="rounded border py-1.5 px-2 text-sm w-20 font-mono" style={{ borderColor: "var(--border)", background: "var(--background)" }} />
                      </div>
                    </div>
                  </div>
                </CollapsibleBlock>
              )}
            </CollapsibleBlock>
          )}

          <div className="mt-8 pt-8 border-t" style={{ borderColor: "var(--border-muted)" }}>
          {aiMajorEffectsRule && aiMinorEffectsRule && (
            <CollapsibleBlock title="Intelligence Artificielle" open={aiOpen} onToggle={() => setAiOpen((o) => !o)} variant="section">
              <div className="p-3 space-y-4">
                <p className="text-xs text-[var(--foreground-muted)]">
                  Effets appliqués aux pays sans joueur selon leur statut IA (Majeur / Mineur) défini dans la liste admin des pays.
                </p>
                <div className="space-y-3">
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-[var(--foreground)]">IA majeure</h4>
                    <ul className="space-y-2">
                      {getAiEffects(aiMajorEffectsRule).map((e, idx) => (
                        <li
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
                          style={{ borderColor: "var(--border-muted)" }}
                        >
                          <span className="text-sm text-[var(--foreground)]">{labelForGlobalEffect(e)}</span>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openEditAiEffect("major", idx)} className="text-xs text-[var(--accent)] hover:underline">Modifier</button>
                            <button type="button" onClick={() => removeAiEffect("major", idx)} className="text-xs text-[var(--danger)] hover:underline">Supprimer</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {!aiMajorFormOpen ? (
                      <button type="button" onClick={() => openAddAiEffect("major")} className="text-sm text-[var(--accent)] hover:underline">Ajouter un effet</button>
                    ) : (
                      <div className="rounded border p-3 space-y-2" style={{ borderColor: "var(--border-muted)" }}>
                        <div>
                          <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Type d'effet</label>
                          <select value={aiMajorEffectKind} onChange={(ev) => { const k = ev.target.value; setAiMajorEffectKind(k); setAiMajorEffectTarget(getDefaultTargetForKindGlobal(k)); }} className={inputClass} style={inputStyle}>
                            {ALL_EFFECT_KIND_IDS.map((k) => (<option key={k} value={k}>{EFFECT_KIND_LABELS[k] ?? k}</option>))}
                          </select>
                        </div>
                        {EFFECT_KINDS_WITH_STAT_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Stat</label><select value={aiMajorEffectTarget ?? STAT_KEYS[0]} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{STAT_KEYS.map((k) => (<option key={k} value={k}>{STAT_LABELS[k]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BUDGET_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ministère</label><select value={aiMajorEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{getBudgetMinistryOptions().map(({ key, label }) => (<option key={key} value={key}>{label}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BRANCH_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Branche</label><select value={aiMajorEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{MILITARY_BRANCH_EFFECT_IDS.map((b) => (<option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(aiMajorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Unité</label><select value={aiMajorEffectTarget ?? rosterUnits[0]?.id ?? ""} onChange={(ev) => setAiMajorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{rosterUnits.map((u) => (<option key={u.id} value={u.id}>{u.name_fr}</option>))}</select></div>)}
                        <div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">{getEffectKindValueHelper(aiMajorEffectKind).valueLabel}</label><input type="number" step={getEffectKindValueHelper(aiMajorEffectKind).valueStep} value={aiMajorEffectValue} onChange={(e) => setAiMajorEffectValue(e.target.value)} className={inputClassNarrow} style={inputStyle} /></div>
                        <div className="flex gap-2"><button type="button" onClick={() => saveAiEffectForm("major")} className="rounded py-1.5 px-3 text-sm font-medium" style={{ background: "var(--accent)", color: "#0f1419" }}>Enregistrer</button><button type="button" onClick={() => setAiMajorFormOpen(false)} className="rounded border py-1.5 px-3 text-sm" style={{ borderColor: "var(--border)" }}>Annuler</button></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-[var(--foreground)]">IA mineure</h4>
                    <ul className="space-y-2">
                      {getAiEffects(aiMinorEffectsRule).map((e, idx) => (
                        <li
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border py-2 px-3"
                          style={{ borderColor: "var(--border-muted)" }}
                        >
                          <span className="text-sm text-[var(--foreground)]">{labelForGlobalEffect(e)}</span>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openEditAiEffect("minor", idx)} className="text-xs text-[var(--accent)] hover:underline">Modifier</button>
                            <button type="button" onClick={() => removeAiEffect("minor", idx)} className="text-xs text-[var(--danger)] hover:underline">Supprimer</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {!aiMinorFormOpen ? (
                      <button type="button" onClick={() => openAddAiEffect("minor")} className="text-sm text-[var(--accent)] hover:underline">Ajouter un effet</button>
                    ) : (
                      <div className="rounded border p-3 space-y-2" style={{ borderColor: "var(--border-muted)" }}>
                        <div>
                          <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Type d'effet</label>
                          <select value={aiMinorEffectKind} onChange={(ev) => { const k = ev.target.value; setAiMinorEffectKind(k); setAiMinorEffectTarget(getDefaultTargetForKindGlobal(k)); }} className={inputClass} style={inputStyle}>
                            {ALL_EFFECT_KIND_IDS.map((k) => (<option key={k} value={k}>{EFFECT_KIND_LABELS[k] ?? k}</option>))}
                          </select>
                        </div>
                        {EFFECT_KINDS_WITH_STAT_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Stat</label><select value={aiMinorEffectTarget ?? STAT_KEYS[0]} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{STAT_KEYS.map((k) => (<option key={k} value={k}>{STAT_LABELS[k]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BUDGET_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Ministère</label><select value={aiMinorEffectTarget ?? getBudgetMinistryOptions()[0]?.key ?? ""} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{getBudgetMinistryOptions().map(({ key, label }) => (<option key={key} value={key}>{label}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_BRANCH_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Branche</label><select value={aiMinorEffectTarget ?? MILITARY_BRANCH_EFFECT_IDS[0]} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{MILITARY_BRANCH_EFFECT_IDS.map((b) => (<option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>))}</select></div>)}
                        {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(aiMinorEffectKind) && (<div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Unité</label><select value={aiMinorEffectTarget ?? rosterUnits[0]?.id ?? ""} onChange={(ev) => setAiMinorEffectTarget(ev.target.value || null)} className={inputClass} style={inputStyle}>{rosterUnits.map((u) => (<option key={u.id} value={u.id}>{u.name_fr}</option>))}</select></div>)}
                        <div><label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">{getEffectKindValueHelper(aiMinorEffectKind).valueLabel}</label><input type="number" step={getEffectKindValueHelper(aiMinorEffectKind).valueStep} value={aiMinorEffectValue} onChange={(e) => setAiMinorEffectValue(e.target.value)} className={inputClassNarrow} style={inputStyle} /></div>
                        <div className="flex gap-2"><button type="button" onClick={() => saveAiEffectForm("minor")} className="rounded py-1.5 px-3 text-sm font-medium" style={{ background: "var(--accent)", color: "#0f1419" }}>Enregistrer</button><button type="button" onClick={() => setAiMinorFormOpen(false)} className="rounded border py-1.5 px-3 text-sm" style={{ borderColor: "var(--border)" }}>Annuler</button></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleBlock>
          )}
          </div>

        </div>
      )}
    </div>
  );
}