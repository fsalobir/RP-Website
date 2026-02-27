"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Country } from "@/types/database";
import type { MilitaryBranch } from "@/types/database";
import type { CountryBudget } from "@/types/database";
import type { CountryEffect } from "@/types/database";
import { formatNumber, formatGdp } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  getEffectDescription,
  isEffectDisplayPositive,
  formatDurationRemaining,
  EFFECT_CATEGORY_IDS,
  EFFECT_CATEGORY_LABELS,
  GROWTH_SUB_IDS,
  GROWTH_SUB_LABELS,
  STAT_KEYS,
  STAT_LABELS,
  BUDGET_EFFECT_SUB_IDS,
  BUDGET_EFFECT_SUB_LABELS,
  getBudgetMinistryOptions,
  buildEffectKeys,
  parseEffectToForm,
  getForcedMinPcts,
  getAllocationCapPercent,
  budgetKeyToPctKey,
  type EffectCategoryId,
} from "@/lib/countryEffects";

const BRANCH_LABELS: Record<MilitaryBranch, string> = {
  terre: "Terre",
  air: "Air",
  mer: "Mer",
};

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
}) {
  const rankEmoji = (r: number) => (r === 1 ? "👑" : r === 2 ? "🥈" : r === 3 ? "🥉" : null);
  const router = useRouter();
  const [tab, setTab] = useState<"general" | "military" | "perks" | "budget">("general");
  const [budgetFraction, setBudgetFraction] = useState(DEFAULT_BUDGET_FRACTION);
  const [pcts, setPcts] = useState<Record<BudgetPctKey, number>>(getDefaultPcts);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [effectsFormOpen, setEffectsFormOpen] = useState(false);
  const [editingEffect, setEditingEffect] = useState<CountryEffect | null>(null);
  const [effectName, setEffectName] = useState("");
  const [effectCategory, setEffectCategory] = useState<EffectCategoryId>("gdp_growth");
  const [effectSubChoice, setEffectSubChoice] = useState<string | null>("base");
  const [effectTarget, setEffectTarget] = useState<string | null>(null);
  const [effectValue, setEffectValue] = useState("");
  const [effectDurationKind, setEffectDurationKind] = useState<"days" | "updates">("days");
  const [effectDurationRemaining, setEffectDurationRemaining] = useState("7");
  const [effectSaving, setEffectSaving] = useState(false);
  const [effectError, setEffectError] = useState<string | null>(null);

  useEffect(() => {
    if (!budget) return;
    setBudgetFraction(Number(budget.budget_fraction) || DEFAULT_BUDGET_FRACTION);
    const forcedMinPctsInit = getForcedMinPcts(effects);
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
  }, [budget?.id, effects]);

  const totalPct = BUDGET_MINISTRIES.reduce((s, m) => s + pcts[m.key], 0);
  const forcedMinPcts = getForcedMinPcts(effects);
  const allocationCap = getAllocationCapPercent(effects);
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
    { terre: [], air: [], mer: [] }
  );

  const panelClass =
    "rounded-lg border p-6";
  const panelStyle = {
    background: "var(--background-panel)",
    borderColor: "var(--border)",
  };

  return (
    <div>
      <div className="tab-list mb-6" style={{ borderColor: "var(--border)" }}>
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
      </div>

      {tab === "general" && (
        <div className="space-y-8">
          <section className={panelClass} style={panelStyle}>
            <div className="mb-8 flex flex-wrap justify-center gap-x-12 gap-y-4">
              <div className="text-center">
                <dt className="text-sm font-semibold text-[var(--foreground-muted)]">
                  <strong className="text-[var(--foreground)]">Population</strong>
                  {rankPopulation > 0 && ` — ${rankEmoji(rankPopulation) ? `${rankEmoji(rankPopulation)} ` : ""}#${rankPopulation}`}
                </dt>
                <dd className="stat-value mt-0.5 text-2xl font-bold text-[var(--foreground)]">{formatNumber(country.population)}</dd>
              </div>
              <div className="text-center">
                <dt className="text-sm font-semibold text-[var(--foreground-muted)]">
                  <strong className="text-[var(--foreground)]">PIB</strong>
                  {rankGdp > 0 && ` — ${rankEmoji(rankGdp) ? `${rankEmoji(rankGdp)} ` : ""}#${rankGdp}`}
                </dt>
                <dd className="stat-value mt-0.5 text-2xl font-bold text-[var(--foreground)]">{formatGdp(country.gdp)}</dd>
              </div>
            </div>

            <hr className="my-8 border-0 border-t" style={{ borderColor: "var(--border)" }} />
            {effects.length === 0 ? (
              <p className="text-[var(--foreground-muted)]">Aucun effet en cours.</p>
            ) : (
              <ul className="space-y-3">
                {effects.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded border py-2 px-3"
                    style={{ borderColor: "var(--border-muted)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-[var(--foreground)]">{e.name}</span>
                      <p
                        className={`text-sm ${isEffectDisplayPositive(e) ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}
                      >
                        {getEffectDescription(e)}
                      </p>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        Durée restante : {formatDurationRemaining(e)}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEffect(e);
                            const { category, subChoice, target } = parseEffectToForm(e);
                            setEffectCategory(category);
                            setEffectSubChoice(subChoice);
                            setEffectTarget(target);
                            setEffectName(e.name);
                            setEffectValue(String(e.value));
                            setEffectDurationKind(e.duration_kind as "days" | "updates");
                            setEffectDurationRemaining(String(e.duration_remaining));
                            setEffectsFormOpen(true);
                          }}
                          className="text-sm text-[var(--accent)] hover:underline"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm("Supprimer cet effet ?")) return;
                            const supabase = createClient();
                            await supabase.from("country_effects").delete().eq("id", e.id);
                            router.refresh();
                          }}
                          className="text-sm text-[var(--danger)] hover:underline"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isAdmin && (
              <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border-muted)" }}>
                {!effectsFormOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEffect(null);
                      setEffectName("");
                      setEffectCategory("gdp_growth");
                      setEffectSubChoice("base");
                      setEffectTarget(null);
                      setEffectValue("");
                      setEffectDurationKind("days");
                      setEffectDurationRemaining("7");
                      setEffectError(null);
                      setEffectsFormOpen(true);
                    }}
                    className="rounded py-2 px-4 text-sm font-medium"
                    style={{ background: "var(--accent)", color: "#0f1419" }}
                  >
                    Ajouter un effet
                  </button>
                ) : (
                  <div className="space-y-3">
                    {effectError && <p className="text-sm text-[var(--danger)]">{effectError}</p>}
                    <div>
                      <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Nom</label>
                      <input
                        type="text"
                        value={effectName}
                        onChange={(e) => setEffectName(e.target.value)}
                        className="w-full max-w-md rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                        style={{ borderColor: "var(--border)" }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Catégorie</label>
                      <select
                        value={effectCategory}
                        onChange={(e) => {
                          const c = e.target.value as EffectCategoryId;
                          setEffectCategory(c);
                          setEffectSubChoice(c === "gdp_growth" || c === "population_growth" ? "base" : c === "budget_ministry" ? "min_pct" : null);
                          setEffectTarget(c === "stat_delta" ? STAT_KEYS[0] : c === "budget_ministry" ? getBudgetMinistryOptions()[0].key : null);
                          if (c === "budget_debt_surplus") setEffectValue("");
                        }}
                        className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {EFFECT_CATEGORY_IDS.map((id) => (
                          <option key={id} value={id}>{EFFECT_CATEGORY_LABELS[id]}</option>
                        ))}
                      </select>
                    </div>
                    {(effectCategory === "gdp_growth" || effectCategory === "population_growth") && (
                      <div className="space-y-2">
                        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Type</label>
                        <select
                          value={effectSubChoice ?? "base"}
                          onChange={(e) => {
                            const v = e.target.value as string;
                            setEffectSubChoice(v);
                            if (v === "per_stat") setEffectTarget(STAT_KEYS[0]);
                            else setEffectTarget(null);
                          }}
                          className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {GROWTH_SUB_IDS.map((id) => (
                            <option key={id} value={id}>{GROWTH_SUB_LABELS[id]}</option>
                          ))}
                        </select>
                        {effectSubChoice === "per_stat" && (
                          <select
                            value={effectTarget ?? ""}
                            onChange={(e) => setEffectTarget(e.target.value || null)}
                            className="ml-2 rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                            style={{ borderColor: "var(--border)" }}
                          >
                            {STAT_KEYS.map((k) => (
                              <option key={k} value={k}>{STAT_LABELS[k]}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                    {effectCategory === "stat_delta" && (
                      <div>
                        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Stat</label>
                        <select
                          value={effectTarget ?? ""}
                          onChange={(e) => setEffectTarget(e.target.value || null)}
                          className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {STAT_KEYS.map((k) => (
                            <option key={k} value={k}>{STAT_LABELS[k]}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {effectCategory === "budget_ministry" && (
                      <div className="space-y-2">
                        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Ministère</label>
                        <select
                          value={effectTarget ?? ""}
                          onChange={(e) => setEffectTarget(e.target.value || null)}
                          className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {getBudgetMinistryOptions().map(({ key, label }) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Type d’effet</label>
                        <select
                          value={effectSubChoice ?? "min_pct"}
                          onChange={(e) => setEffectSubChoice(e.target.value)}
                          className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {BUDGET_EFFECT_SUB_IDS.map((id) => (
                            <option key={id} value={id}>{BUDGET_EFFECT_SUB_LABELS[id]}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {effectCategory === "budget_debt_surplus" && (
                      <p className="text-sm text-[var(--foreground-muted)]">
                        Positif = excédent (plafond d’allocation augmenté, ex. +20 → 120 % max). Négatif = dette (plafond réduit, ex. -20 → 80 % max).
                      </p>
                    )}
                    <div>
                      <label className="mb-1 block text-sm text-[var(--foreground-muted)]">
                        {effectCategory === "budget_ministry" && effectSubChoice === "min_pct"
                          ? "Pourcentage minimum (dépense forcée, valeur positive uniquement)"
                          : effectCategory === "budget_debt_surplus"
                            ? "Pourcentage (excédent + / dette −)"
                            : "Valeur (nombre, négatif = malus)"}
                      </label>
                      <input
                        type="number"
                        step={effectCategory === "budget_debt_surplus" ? 1 : "any"}
                        min={effectCategory === "budget_ministry" && effectSubChoice === "min_pct" ? 0 : undefined}
                        value={effectValue}
                        onChange={(e) => setEffectValue(e.target.value)}
                        className="w-32 rounded border bg-[var(--background)] px-2 py-1.5 text-sm font-mono text-[var(--foreground)]"
                        style={{ borderColor: "var(--border)" }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Durée</label>
                        <select
                          value={effectDurationKind}
                          onChange={(e) => setEffectDurationKind(e.target.value as "days" | "updates")}
                          className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <option value="days">Jours</option>
                          <option value="updates">Mises à jour</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Nombre</label>
                        <input
                          type="number"
                          min={1}
                          value={effectDurationRemaining}
                          onChange={(e) => setEffectDurationRemaining(e.target.value)}
                          className="w-20 rounded border bg-[var(--background)] px-2 py-1.5 text-sm font-mono text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        disabled={effectSaving || !effectName.trim()}
                        onClick={async () => {
                          setEffectError(null);
                          setEffectSaving(true);
                          const valueNum = Number(effectValue);
                          if (Number.isNaN(valueNum)) {
                            setEffectError("Valeur invalide.");
                            setEffectSaving(false);
                            return;
                          }
                          const { effect_kind, effect_target, effect_subtype } = buildEffectKeys(
                            effectCategory,
                            effectSubChoice,
                            effectTarget
                          );
                          if (effect_kind === "budget_ministry_min_pct" && valueNum < 0) {
                            setEffectError("Le minimum forcé doit être une valeur positive.");
                            setEffectSaving(false);
                            return;
                          }
                          const durationNum = Math.max(0, Math.floor(Number(effectDurationRemaining) || 0));
                          const supabase = createClient();
                          const row = {
                            name: effectName.trim(),
                            effect_kind,
                            effect_target: effect_target || null,
                            effect_subtype: effect_subtype || null,
                            value: valueNum,
                            duration_kind: effectDurationKind,
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
                        }}
                        className="rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
                        style={{ background: "var(--accent)", color: "#0f1419" }}
                      >
                        {effectSaving ? "Enregistrement…" : editingEffect ? "Enregistrer" : "Ajouter"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEffectsFormOpen(false);
                          setEditingEffect(null);
                          setEffectError(null);
                        }}
                        className="rounded border py-2 px-4 text-sm font-medium text-[var(--foreground)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={panelClass} style={panelStyle}>
            <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:gap-10 sm:justify-center">
              {[
                { key: "militarism" as const, label: "Militarisme", emoji: "🎖️", value: Number(country.militarism) },
                { key: "industry" as const, label: "Industrie", emoji: "🏭", value: Number(country.industry) },
                { key: "science" as const, label: "Science", emoji: "🔬", value: Number(country.science) },
              ].map(({ label, emoji, value }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <span className="text-center text-sm font-semibold text-[var(--foreground)]">
                    {emoji} {label}
                  </span>
                  <span className="text-2xl font-bold text-[var(--foreground)]">
                    {Number(value).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-10 max-w-2xl mx-auto">
              <span className="mb-2 block text-center text-sm font-semibold text-[var(--foreground)]">
                ⚖️ Stabilité
              </span>
              <div
                className="relative h-5 w-full rounded overflow-visible"
                style={{
                  background: "linear-gradient(to right, #dc2626, #ea580c, #ca8a04, #65a30d, #16a34a)",
                }}
              >
                {[-3, -2, -1, 0, 1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="absolute top-0 bottom-0 w-px bg-black"
                    style={{ left: `${((n + 3) / 6) * 100}%` }}
                  />
                ))}
                <div
                  className="absolute top-0 flex flex-col items-center"
                  style={{
                    left: `${((Math.max(-3, Math.min(3, Number(country.stability))) + 3) / 6) * 100}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div
                    className="border-[5px] border-transparent border-b-[#0f1419]"
                    style={{ borderBottomWidth: "6px" }}
                    aria-hidden
                  />
                  <span className="mt-0.5 rounded bg-[var(--background-panel)] px-1.5 py-0.5 text-xs font-bold text-[var(--foreground)] shadow-sm">
                    {country.stability}
                  </span>
                </div>
              </div>
              <div className="relative mt-6 h-8 w-full">
                {[
                  { n: -3, label: "Chaos" },
                  { n: -2, label: "État Failli" },
                  { n: -1, label: "Instable" },
                  { n: 0, label: "Précaire" },
                  { n: 1, label: "Stable" },
                  { n: 2, label: "Uni" },
                  { n: 3, label: "Prospère" },
                ].map(({ n, label }) => (
                  <span
                    key={n}
                    className="absolute top-0 -translate-x-1/2 rounded bg-[var(--background-panel)] px-1.5 py-0.5 text-center text-xs text-[var(--foreground-muted)] shadow-sm whitespace-nowrap"
                    style={{
                      left: `${((n + 3) / 6) * 100}%`,
                      border: "1px solid var(--border-muted)",
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "military" && (
        <div className="space-y-6">
          {(["terre", "air", "mer"] as const).map((branch) => (
            <section key={branch} className={panelClass} style={panelStyle}>
              <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
                {BRANCH_LABELS[branch]}
              </h2>
              {limitsByBranch[branch].length === 0 ? (
                <p className="text-[var(--foreground-muted)]">Aucune limite définie.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pb-2 pr-4 font-medium text-[var(--foreground-muted)]">
                        Type
                      </th>
                      <th className="pb-2 font-medium text-[var(--foreground-muted)]">
                        Limite
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {limitsByBranch[branch].map((row, i) => (
                      <tr key={i} className="border-b border-[var(--border-muted)]">
                        <td className="py-2 pr-4">{row.name_fr}</td>
                        <td className="stat-value py-2">{formatNumber(row.limit_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </div>
      )}

      {tab === "perks" && (
        <div className="space-y-4">
          {perksDef.length === 0 ? (
            <div className={panelClass} style={panelStyle}>
              <p className="text-[var(--foreground-muted)]">Aucun avantage défini.</p>
            </div>
          ) : (
            perksDef.map((p) => {
              const unlocked = unlockedPerkIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className={panelClass}
                  style={{
                    ...panelStyle,
                    opacity: unlocked ? 1 : 0.65,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-[var(--foreground)]">
                        {p.name_fr}
                        {unlocked && (
                          <span className="ml-2 text-xs text-[var(--accent)]">(débloqué)</span>
                        )}
                      </h3>
                      {p.description_fr && (
                        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                          {p.description_fr}
                        </p>
                      )}
                      {p.modifier && (
                        <p className="mt-1 text-sm text-[var(--accent)]">{p.modifier}</p>
                      )}
                    </div>
                    {!unlocked && (
                      <div className="shrink-0 text-right text-xs text-[var(--foreground-muted)]">
                        Conditions : Militarisme {p.min_militarism ?? "—"} / Industrie{" "}
                        {p.min_industry ?? "—"} / Science {p.min_science ?? "—"} / Stabilité{" "}
                        {p.min_stability ?? "—"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "budget" && (
        <div className="space-y-6">
          <section className={panelClass} style={panelStyle}>
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Budget d'état
            </h2>
            <div className="mb-4 space-y-3 text-sm text-[var(--foreground-muted)]">
              <p>
                Le budget d'état est une <strong className="text-[var(--foreground)]">fraction du PIB</strong> du pays (valeur annuelle). 
                Les montants affichés ci-dessous sont en <strong className="text-[var(--foreground)]">budget mensuel</strong> (1 mois IRP = 1 jour IRL). 
                Répartissez ce budget entre les ministères ; la somme des pourcentages doit être égale à 100 % pour ne rien perdre. 
                Les valeurs assignées, ainsi que le budget d'état, existent surtout pour <strong className="text-[var(--foreground)]">l'immersion</strong> et donner une idée des échelles de budget que le pays peut se permettre.
              </p>
              <p>
                Vous pouvez donner une priorité d'évolution à votre nation au travers de votre budget.
              </p>
              <ul className="list-inside list-disc space-y-1 pl-1">
                <li>Si un département ne reçoit pas de financement ou pas suffisamment, l'effet national peut être négatif.</li>
                <li>La somme doit atteindre le plafond d'allocation (100 % normal ; effets Allocation de Budget Maximum peuvent le modifier).</li>
              </ul>
              {allocationCap !== 100 && (
                <p className="text-sm text-[var(--foreground)]">
                  Plafond d'allocation actuel : <strong>{allocationCap} %</strong>
                  {allocationCap < 100 ? " (dette)" : " (excédent)"}.
                </p>
              )}
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="budget-fraction" className="text-sm font-medium text-[var(--foreground)]">
                  Fraction du PIB :
                </label>
                <input
                  id="budget-fraction"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(budgetFraction * 100)}
                  onChange={(e) => setBudgetFraction(Math.min(1, Math.max(0, Number(e.target.value) / 100)))}
                  disabled={!isAdmin}
                  className="w-20 rounded border bg-[var(--background)] px-2 py-1.5 text-sm font-mono text-[var(--foreground)] disabled:opacity-60"
                  style={{ borderColor: "var(--border)" }}
                />
                <span className="text-sm text-[var(--foreground-muted)]">%</span>
              </div>
              <div className="text-sm">
                <span className="text-[var(--foreground-muted)]">Budget mensuel : </span>
                <span className="font-semibold text-[var(--foreground)]">
                  {totalBudgetMonthlyBn >= 0.01 ? `${totalBudgetMonthlyBn.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Bn $ / Mois` : "—"}
                </span>
              </div>
              {!isAdmin && (
                <span className="text-xs text-[var(--foreground-muted)]">
                  (La fraction n'est modifiable que par un administrateur.)
                </span>
              )}
            </div>
          </section>

          <section className={panelClass} style={panelStyle}>
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Répartition par ministère
            </h2>
            {budgetError && (
              <p className="mb-4 text-sm text-[var(--danger)]">{budgetError}</p>
            )}
            <div className="space-y-4">
              {[1, 2, 3].map((groupNum) => (
                <div key={groupNum}>
                  {groupNum > 1 && (
                    <hr className="my-4 border-t" style={{ borderColor: "var(--border)" }} />
                  )}
                  {BUDGET_MINISTRIES.filter((m) => m.group === groupNum).map(({ key, label, tooltip }) => {
                    const value = pcts[key];
                    const forcedMin = forcedMinPcts[key] ?? 0;
                    const amountMonthlyBn = (totalBudgetMonthly * value) / 100 / 1e9;
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-4 py-1">
                        <div className="w-64 shrink-0">
                          <Tooltip content={tooltip}>
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--foreground)]">
                              {label}
                              {forcedMin > 0 && (
                                <span className="text-xs text-[var(--danger)]">(min. {forcedMin} %)</span>
                              )}
                              <span className="text-[var(--foreground-muted)]" aria-hidden>ⓘ</span>
                            </span>
                          </Tooltip>
                        </div>
                        <div className="relative flex min-w-0 flex-1 items-center gap-3">
                          <div className="relative flex-1">
                            {forcedMin > 0 && (
                              <div
                                className="absolute top-1/2 z-10 h-4 w-0.5 -translate-y-1/2 rounded"
                                style={{
                                  left: `${forcedMin}%`,
                                  background: "var(--danger)",
                                }}
                                title="Minimum forcé"
                              />
                            )}
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={0.5}
                              value={value}
                              onChange={(e) => setPcts((prev) => ({ ...prev, [key]: Math.max(forcedMin, Number(e.target.value)) }))}
                              className="h-2 w-full accent-[var(--accent)]"
                            />
                          </div>
                          <span className="w-12 shrink-0 text-right text-sm font-mono text-[var(--foreground-muted)]">
                            {value.toFixed(1)} %
                          </span>
                        </div>
                        <div className="w-28 shrink-0 text-right font-mono text-sm text-[var(--foreground)]">
                          {amountMonthlyBn >= 0.01 ? `${amountMonthlyBn.toFixed(2)} Bn $ / Mois` : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "var(--border-muted)" }}>
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-[var(--foreground-muted)]">Total alloué</span>
                <div className="h-4 flex-1 overflow-hidden rounded" style={{ background: "var(--background-elevated)" }}>
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${Math.min(100, (totalPct / allocationCap) * 100)}%`,
                      background: totalPct > allocationCap ? "var(--danger)" : "var(--accent)",
                    }}
                  />
                </div>
                <span className={`w-14 shrink-0 text-right text-sm font-mono ${totalPct > allocationCap ? "text-[var(--danger)]" : "text-[var(--foreground-muted)]"}`}>
                  {totalPct.toFixed(1)} %
                </span>
              </div>
              {allocationCap !== 100 && (
                <p className="text-xs text-[var(--foreground-muted)]">
                  Maximum autorisé : {allocationCap} %.
                </p>
              )}
              {totalPct > allocationCap && (
                <p className="text-sm text-[var(--danger)]">
                  La somme ne doit pas dépasser {allocationCap} %. Réduisez les pourcentages pour pouvoir enregistrer.
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={budgetSaving || totalPct > allocationCap}
                  onClick={async () => {
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
                  }}
                  className="rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#0f1419" }}
                >
                  {budgetSaving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
