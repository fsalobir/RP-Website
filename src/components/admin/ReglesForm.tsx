"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RuleParameter } from "@/types/database";
import {
  RULE_SECTIONS,
  getRuleLabel,
  BUDGET_MINISTRY_KEYS,
  BUDGET_MINISTRY_LABELS,
  BUDGET_MINISTRY_EFFECTS,
  type BudgetMinistryValue,
} from "@/lib/ruleParameters";

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

export function ReglesForm({
  rules,
}: {
  rules: RuleParameter[];
}) {
  const [items, setItems] = useState(rules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [growthOpen, setGrowthOpen] = useState(true);
  const [growthPibOpen, setGrowthPibOpen] = useState(true);
  const [growthPopOpen, setGrowthPopOpen] = useState(true);
  const [budgetOpen, setBudgetOpen] = useState(true);
  const [budgetMinistryOpen, setBudgetMinistryOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BUDGET_MINISTRY_KEYS.map((k) => [k, true]))
  );
  const [simulatorMinistry, setSimulatorMinistry] = useState<string>(BUDGET_MINISTRY_KEYS[0]);
  const [simulatorBase, setSimulatorBase] = useState<string>("5");
  const [simulatorWorldAvg, setSimulatorWorldAvg] = useState<string>("5");
  const [simulatorAllocationPct, setSimulatorAllocationPct] = useState<number>(10);

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
    for (const row of items) {
      const { error: err } = await supabase
        .from("rule_parameters")
        .update({ value: row.value })
        .eq("id", row.id);
      if (err) {
        setError(err.message);
        break;
      }
    }
    setSaving(false);
  }

  const rulesByKey = useMemo(() => new Map(items.map((r) => [r.key, r])), [items]);
  const allSectionKeys = useMemo(
    () => new Set(RULE_SECTIONS.flatMap((s) => s.keys)),
    []
  );
  const otherRules = useMemo(
    () => items.filter((r) => !allSectionKeys.has(r.key)),
    [items, allSectionKeys]
  );

  function getBudgetValue(r: RuleParameter): BudgetMinistryValue {
    if (typeof r.value === "object" && r.value !== null && !Array.isArray(r.value)) {
      return r.value as BudgetMinistryValue;
    }
    return { min_pct: 5, max_malus: -0.05, gravity_pct: 50, bonuses: {} };
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
  const maxMalus = simulatorParams?.max_malus ?? -0.05;
  const effects = (simulatorParams && BUDGET_MINISTRY_EFFECTS[simulatorMinistry]) ?? [];
  const allocationBelowMin = simulatorAllocationPct < minPct;
  const malusPerDay = allocationBelowMin && minPct > 0
    ? maxMalus * (1 - simulatorAllocationPct / minPct)
    : 0;
  const bonusScale = !allocationBelowMin && minPct < 100
    ? (simulatorAllocationPct - minPct) / (100 - minPct)
    : 0;
  const bonusesPerDay = effects.map(({ key: effectKey, label: effectLabel }) => ({
    label: effectLabel,
    perDay: (simulatorParams?.bonuses?.[effectKey] ?? 0) * bonusScale * catchUpFactor,
  }));

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
          <CollapsibleBlock title="Croissance Globale" open={growthOpen} onToggle={() => setGrowthOpen((o) => !o)}>
            <div className="pl-4 ml-2 border-l-2" style={{ borderColor: "var(--border-muted)" }}>
              <CollapsibleBlock title="PIB" open={growthPibOpen} onToggle={() => setGrowthPibOpen((o) => !o)}>
                <div className="p-2">
                <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { key: "gdp_growth_base_rate", label: "PIB / Base (%)" },
                    { key: "gdp_growth_per_militarism", label: "PIB / Militarisme (%)" },
                    { key: "gdp_growth_per_industry", label: "PIB / Industrie (%)" },
                    { key: "gdp_growth_per_science", label: "PIB / Science (%)" },
                    { key: "gdp_growth_per_stability", label: "PIB / Stabilité (%)" },
                  ].map(({ key, label }) => {
                    const r = rulesByKey.get(key);
                    if (!r) return null;
                    return (
                      <div key={r.id} className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">{label}</label>
                        <input
                          type="text"
                          value={
                            typeof r.value === "object"
                              ? JSON.stringify(r.value)
                              : String(r.value ?? "")
                          }
                          onChange={(e) => parseRuleValueAndUpdate(r.id, e.target.value)}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </CollapsibleBlock>
            <CollapsibleBlock title="Population" open={growthPopOpen} onToggle={() => setGrowthPopOpen((o) => !o)}>
              <div className="p-2">
                <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { key: "population_growth_base_rate", label: "Population / Base (%)" },
                    { key: "population_growth_per_militarism", label: "Population / Militarisme (%)" },
                    { key: "population_growth_per_industry", label: "Population / Industrie (%)" },
                    { key: "population_growth_per_science", label: "Population / Science (%)" },
                    { key: "population_growth_per_stability", label: "Population / Stabilité (%)" },
                  ].map(({ key, label }) => {
                    const r = rulesByKey.get(key);
                    if (!r) return null;
                    return (
                      <div key={r.id} className="flex flex-col gap-0.5">
                        <label className="text-xs text-[var(--foreground-muted)]">{label}</label>
                        <input
                          type="text"
                          value={
                            typeof r.value === "object"
                              ? JSON.stringify(r.value)
                              : String(r.value ?? "")
                          }
                          onChange={(e) => parseRuleValueAndUpdate(r.id, e.target.value)}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </CollapsibleBlock>
            </div>
          </CollapsibleBlock>

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
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-6">
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">% min (éviter malus)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={val.min_pct ?? 5}
                          onChange={(e) => updateBudgetField(r, "min_pct", null, Number(e.target.value))}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Malus max / jour</label>
                        <input
                          type="number"
                          step={0.01}
                          value={val.max_malus ?? -0.05}
                          onChange={(e) => updateBudgetField(r, "max_malus", null, Number(e.target.value))}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Gravité effet / moyenne (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={val.gravity_pct ?? 50}
                          onChange={(e) => updateBudgetField(r, "gravity_pct", null, Number(e.target.value))}
                          className={inputClassNarrow}
                          style={inputStyle}
                        />
                      </div>
                      {effectsList.map(({ key: effectKey, label: effectLabel }) => (
                        <div key={effectKey}>
                          <label className="mb-0.5 block text-xs text-[var(--foreground-muted)]">Bonus max {effectLabel} / jour</label>
                          <input
                            type="number"
                            min={0}
                            step={0.001}
                            value={val.bonuses?.[effectKey] ?? 0}
                            onChange={(e) => updateBudgetField(r, "bonuses", effectKey, Number(e.target.value))}
                            className={inputClassNarrow}
                            style={inputStyle}
                          />
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
                {allocationBelowMin ? (
                  <p className="mt-1 font-mono text-sm text-[var(--foreground)]">
                    Malus : {malusPerDay.toFixed(4)} / jour
                  </p>
                ) : (
                  <ul className="mt-1 list-none space-y-0.5 font-mono text-sm text-[var(--foreground)]">
                    {bonusesPerDay.map(({ label, perDay }) => (
                      <li key={label}>{label} : +{perDay.toFixed(4)} / jour</li>
                    ))}
                    {bonusesPerDay.length === 0 && <li className="text-[var(--foreground-muted)]">Aucun bonus</li>}
                  </ul>
                )}
              </div>
            </div>
          </CollapsibleBlock>

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
