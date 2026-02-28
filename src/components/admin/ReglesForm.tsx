"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { revalidateCountryPageGlobals } from "@/app/admin/regles/actions";
import type { RuleParameter } from "@/types/database";
import {
  RULE_SECTIONS,
  getRuleLabel,
  BUDGET_MINISTRY_KEYS,
  BUDGET_MINISTRY_LABELS,
  BUDGET_MINISTRY_EFFECTS,
  type BudgetMinistryValue,
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

function CollapsibleBlock({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b" style={{ borderColor: "var(--border-muted)" }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:opacity-90"
        style={{ background: "var(--background-elevated)" }}
      >
        <span className="text-sm font-medium text-[var(--foreground)]">{title}</span>
        <span
          className="block shrink-0 transition-transform duration-300 ease-out"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <div className="divide-y" style={{ borderColor: "var(--border-muted)" }}>{children}</div>
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

export function ReglesForm({
  rules,
  rosterUnits = [],
}: {
  rules: RuleParameter[];
  rosterUnits?: { id: string; name_fr: string }[];
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
  const allSectionKeys = useMemo(
    () => new Set(RULE_SECTIONS.flatMap((s) => s.keys)),
    []
  );
  const mobilisationConfigKey = "mobilisation_config";
  const mobilisationEffectsKey = "mobilisation_level_effects";
  const globalGrowthEffectsKey = "global_growth_effects";
  const worldDateKey = "world_date";
  const worldDateAdvanceKey = "world_date_advance_months";
  const otherRules = useMemo(
    () => items.filter(
      (r) => !allSectionKeys.has(r.key) && r.key !== mobilisationConfigKey && r.key !== mobilisationEffectsKey && r.key !== globalGrowthEffectsKey && r.key !== worldDateKey && r.key !== worldDateAdvanceKey
    ),
    [items, allSectionKeys]
  );

  const globalGrowthEffectsRule = useMemo(() => items.find((r) => r.key === globalGrowthEffectsKey), [items]);
  const worldDateRule = useMemo(() => items.find((r) => r.key === worldDateKey), [items]);
  const worldDateAdvanceRule = useMemo(() => items.find((r) => r.key === worldDateAdvanceKey), [items]);
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

  const mobilisationConfigRule = useMemo(() => items.find((r) => r.key === mobilisationConfigKey), [items]);
  const mobilisationEffectsRule = useMemo(() => items.find((r) => r.key === mobilisationEffectsKey), [items]);

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
  const effects = (simulatorParams && BUDGET_MINISTRY_EFFECTS[simulatorMinistry]) ?? [];
  const allocationBelowMin = simulatorAllocationPct < minPct;
  const malusScale = allocationBelowMin && minPct > 0
    ? (minPct - simulatorAllocationPct) / minPct
    : 0;
  const bonusScale = !allocationBelowMin && minPct < 100
    ? (simulatorAllocationPct - minPct) / (100 - minPct)
    : 0;
  const bonusesPerDay = effects.map(({ key: effectKey, label: effectLabel }) => {
    const rawMalus = simulatorParams?.maluses?.[effectKey] ?? -0.05;
    const malus = malusScale * rawMalus;
    const bonus = !allocationBelowMin ? (simulatorParams?.bonuses?.[effectKey] ?? 0) * bonusScale * catchUpFactor : 0;
    return { label: effectLabel, perDay: bonus, malusPerDay: malus };
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
      {items.length === 0 ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          <p className="text-[var(--foreground-muted)]">Aucun paramètre. Ajoutez-en via SQL (table rule_parameters).</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
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
                      <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Type d’effet</label>
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

          {worldDateRule && worldDateAdvanceRule && (
            <CollapsibleBlock title="Date du monde" open={worldDateOpen} onToggle={() => setWorldDateOpen((o) => !o)}>
              <div className="p-3 space-y-3">
                <p className="text-xs text-[var(--foreground-muted)]">
                  Date du monde affichée sur le site (ex. Rapport du Cabinet). Avance automatiquement à chaque passage du cron selon la temporalité ci‑dessous.
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
                    <label className="text-xs text-[var(--foreground-muted)]">Mois par mise à jour (temporalité)</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={typeof worldDateAdvanceRule.value === "number" ? worldDateAdvanceRule.value : (worldDateAdvanceRule.value as unknown as number) ?? 1}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(12, Math.round(Number(e.target.value)) || 1));
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

          <CollapsibleBlock title="Paramètres Budget" open={budgetOpen} onToggle={() => setBudgetOpen((o) => !o)}>
            <div className="pl-4 ml-2 border-l-2" style={{ borderColor: "var(--border-muted)" }}>
            {BUDGET_MINISTRY_KEYS.map((key) => {
              const r = rulesByKey.get(key);
              if (!r) return null;
              const val = getBudgetValue(r);
              const effectsList = BUDGET_MINISTRY_EFFECTS[key] ?? [];
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
                  <div className="p-3" style={{ borderColor: "var(--border-muted)" }}>
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
                      {effectsList.map(({ key: effectKey, label: effectLabel }) => (
                        <div key={effectKey} className="flex items-end gap-x-2">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-xs text-[var(--foreground-muted)]">Bonus max {effectLabel}</label>
                            <input
                              type="number"
                              min={0}
                              step={0.001}
                              value={val.bonuses?.[effectKey] ?? 0}
                              onChange={(e) => updateBudgetField(r, "bonuses", effectKey, Number(e.target.value))}
                              className={`${inputClassNarrow} w-14`}
                              style={inputStyle}
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-xs text-[var(--foreground-muted)]">Malus max {effectLabel}</label>
                            <input
                              type="number"
                              max={0}
                              step={0.001}
                              value={val.maluses?.[effectKey] ?? -0.05}
                              onChange={(e) => updateBudgetField(r, "maluses", effectKey, Number(e.target.value))}
                              className={`${inputClassNarrow} w-14`}
                              style={inputStyle}
                            />
                          </div>
                        </div>
                      ))}
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
                            onChange={(e) =>
                              updateMobilisationConfig({
                                level_thresholds: {
                                  ...(getMobilisationConfig().level_thresholds ?? {}),
                                  [key]: Number(e.target.value) || 0,
                                },
                              })
                            }
                            className={inputClassNarrow}
                            style={inputStyle}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--foreground-muted)]">Évolution quotidienne du score (points/jour)</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={getMobilisationConfig().daily_step ?? 20}
                    onChange={(e) => updateMobilisationConfig({ daily_step: Number(e.target.value) || 20 })}
                    className={inputClassNarrow}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2">Effets par palier</div>
                  <div className="space-y-4">
                    {MOBILISATION_LEVEL_KEYS.map((levelKey) => {
                      const effectsForLevel = getMobilisationLevelEffects().filter((e) => e.level === levelKey);
                      return (
                        <div key={levelKey} className="rounded border p-2" style={{ borderColor: "var(--border-muted)" }}>
                          <div className="text-sm font-medium text-[var(--foreground)] mb-2">{MOBILISATION_LEVEL_LABELS[levelKey]}</div>
                          <ul className="space-y-2">
                            {(getMobilisationLevelEffects()
                              .map((e, idx) => (e.level === levelKey ? { e, idx } : null))
                              .filter((x): x is { e: MobilisationLevelEffect; idx: number } => x !== null))
                              .map(({ e, idx }) => {
                                const kind = e.effect_kind;
                                const needsStatTarget = EFFECT_KINDS_WITH_STAT_TARGET.has(kind);
                                const needsBudgetTarget = EFFECT_KINDS_WITH_BUDGET_TARGET.has(kind);
                                const needsBranchTarget = EFFECT_KINDS_WITH_BRANCH_TARGET.has(kind);
                                const needsRosterTarget = EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(kind);
                                const noTarget = EFFECT_KINDS_NO_TARGET.has(kind);
                                const valueHelper = getEffectKindValueHelper(kind);
                                const inputValue = valueHelper.storedToDisplay(Number(e.value));
                                const onValueChange = (val: number) =>
                                  updateMobilisationEffect(idx, {
                                    value: valueHelper.displayToStored(val),
                                  });
                                return (
                                  <li key={idx} className="flex flex-wrap items-center gap-2 text-xs">
                                    <select
                                      value={kind}
                                      onChange={(ev) => updateMobilisationEffect(idx, { effect_kind: ev.target.value })}
                                      className="min-w-0 rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                      style={{ borderColor: "var(--border)", maxWidth: "240px" }}
                                    >
                                      {Object.entries(EFFECT_KIND_LABELS).map(([k, label]) => (
                                        <option key={k} value={k}>{label}</option>
                                      ))}
                                    </select>
                                    {noTarget && <span className="text-[var(--foreground-muted)]">—</span>}
                                    {needsStatTarget && (
                                      <select
                                        value={e.effect_target ?? STAT_KEYS[0]}
                                        onChange={(ev) => updateMobilisationEffect(idx, { effect_target: ev.target.value || null })}
                                        className="rounded border bg-[var(--background)] px-1.5 py-1 text-[var(--foreground)]"
                                        style={{ borderColor: "var(--border)", minWidth: "100px" }}
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
                                        style={{ borderColor: "var(--border)", minWidth: "140px" }}
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
              </div>
            </CollapsibleBlock>
          )}

          {otherRules.length > 0 && (
            <div className="border-t" style={{ borderColor: "var(--border-muted)" }}>
              <div
                className="px-4 py-2"
                style={{ background: "var(--background-elevated)" }}
              >
                <span className="text-sm font-medium text-[var(--foreground-muted)]">Autres paramètres</span>
              </div>
              {otherRules.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 p-3 sm:flex-nowrap">
                  <div className="w-full min-w-0 sm:w-48">
                    <span className="font-mono text-sm text-[var(--foreground)]">{r.key}</span>
                    {r.description && (
                      <p className="text-xs text-[var(--foreground-muted)]">{r.description}</p>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={
                        typeof r.value === "object"
                          ? JSON.stringify(r.value)
                          : String(r.value ?? "")
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        let parsed: unknown = v;
                        if (/^-?\d+(\.\d+)?$/.test(v)) parsed = Number(v);
                        else if (v.startsWith("{") || v.startsWith("[")) {
                          try {
                            parsed = JSON.parse(v);
                          } catch {
                            parsed = v;
                          }
                        }
                        updateValue(r.id, parsed);
                      }}
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
