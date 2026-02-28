"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Country } from "@/types/database";
import type { MilitaryBranch } from "@/types/database";
import type { CountryBudget } from "@/types/database";
import type { CountryEffect } from "@/types/database";
import type { CountryUpdateLog } from "@/types/database";
import type { MilitaryRosterUnit } from "@/types/database";
import type { CountryMilitaryUnit } from "@/types/database";
import { formatNumber, formatGdp } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { Tooltip } from "@/components/ui/Tooltip";
import { getExpectedNextTick } from "@/lib/expectedNextTick";
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
  getUnitExtraEffectSum,
  MILITARY_UNIT_EFFECT_SUB_IDS,
  MILITARY_UNIT_EFFECT_SUB_LABELS,
  type EffectCategoryId,
} from "@/lib/countryEffects";

const BRANCH_LABELS: Record<MilitaryBranch, string> = {
  terre: "Terre",
  air: "Air",
  mer: "Mer",
  strategique: "Stratégique",
};

type RosterRowByBranch = {
  unit: MilitaryRosterUnit;
  countryState: CountryMilitaryUnit | null;
  levels: { level: number; manpower: number }[];
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
  isPlayerForThisCountry = false,
  assignedPlayerEmail = null,
  updateLogs,
  ruleParametersByKey,
  worldAverages,
  rosterByBranch,
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
}) {
  const canEditCountry = isAdmin || isPlayerForThisCountry;
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
  const [militaryEdit, setMilitaryEdit] = useState<Record<string, { current_level: number; extra_count: number }>>({});
  const [militarySavingId, setMilitarySavingId] = useState<string | null>(null);
  const [militaryError, setMilitaryError] = useState<string | null>(null);
  const [militarySubtypeOpen, setMilitarySubtypeOpen] = useState<Record<string, boolean>>({});
  const [generalName, setGeneralName] = useState("");
  const [generalRegime, setGeneralRegime] = useState("");
  const [generalFlagUrl, setGeneralFlagUrl] = useState("");
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

  useEffect(() => {
    const next: Record<string, { current_level: number; extra_count: number }> = {};
    const branches: MilitaryBranch[] = ["terre", "air", "mer", "strategique"];
    for (const b of branches) {
      for (const row of rosterByBranch[b]) {
        // current_level stocke désormais des points de progression (0..level_count*100)
        const points = Math.max(0, row.countryState?.current_level ?? 0);
        const extra = Math.max(0, row.countryState?.extra_count ?? 0);
        next[row.unit.id] = { current_level: points, extra_count: extra };
      }
    }
    if (Object.keys(next).length) {
      setMilitaryEdit(next);
    }
  }, [rosterByBranch]);

  useEffect(() => {
    setGeneralName(country.name ?? "");
    setGeneralRegime(country.regime ?? "");
    setGeneralFlagUrl(country.flag_url ?? "");
  }, [country.id, country.name, country.regime, country.flag_url]);

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
    { terre: [], air: [], mer: [], strategique: [] }
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

            {canEditCountry && (
              <div className="mb-8 mt-6 rounded-lg border p-4" style={{ borderColor: "var(--border-muted)", background: "var(--background-elevated)" }}>
                <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Modifier les généralités</h3>
                {generalError && <p className="mb-2 text-sm text-[var(--danger)]">{generalError}</p>}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  <div>
                    <label className="mb-1 block text-xs text-[var(--foreground-muted)]">URL du drapeau</label>
                    <input
                      type="url"
                      value={generalFlagUrl}
                      onChange={(e) => setGeneralFlagUrl(e.target.value)}
                      placeholder="https://…"
                      className="w-full rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={generalSaving}
                    onClick={async () => {
                      setGeneralError(null);
                      setGeneralSaving(true);
                      const supabase = createClient();
                      const { error } = await supabase
                        .from("countries")
                        .update({
                          name: generalName.trim() || country.name,
                          regime: generalRegime.trim() || null,
                          flag_url: generalFlagUrl.trim() || null,
                        })
                        .eq("id", country.id);
                      if (error) setGeneralError(error.message);
                      setGeneralSaving(false);
                      if (!error) router.refresh();
                    }}
                    className="rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "#0f1419" }}
                  >
                    {generalSaving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </div>
            )}

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
                        {getEffectDescription(e, {
                          rosterUnitName: (id) => rosterUnitsFlat.find((u) => u.id === id)?.name_fr ?? null,
                        })}
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
                            setEffectValue(
                              e.effect_kind.startsWith("gdp_growth") || e.effect_kind.startsWith("population_growth")
                                ? String(Number(e.value) * 100)
                                : String(e.value)
                            );
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
                          setEffectSubChoice(
                            c === "gdp_growth" || c === "population_growth" ? "base"
                              : c === "budget_ministry" ? "min_pct"
                              : c === "military_unit" ? "unit_extra"
                              : null
                          );
                          setEffectTarget(
                            c === "stat_delta" ? STAT_KEYS[0]
                              : c === "budget_ministry" ? getBudgetMinistryOptions()[0].key
                              : c === "military_unit" && rosterUnitsFlat.length > 0 ? rosterUnitsFlat[0].id
                              : null
                          );
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
                    {effectCategory === "military_unit" && (
                      <div className="space-y-2">
                        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Type</label>
                        <select
                          value={effectSubChoice ?? "unit_extra"}
                          onChange={(e) => setEffectSubChoice(e.target.value)}
                          className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {MILITARY_UNIT_EFFECT_SUB_IDS.map((id) => (
                            <option key={id} value={id}>{MILITARY_UNIT_EFFECT_SUB_LABELS[id]}</option>
                          ))}
                        </select>
                        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Unité</label>
                        <select
                          value={effectTarget ?? ""}
                          onChange={(e) => setEffectTarget(e.target.value || null)}
                          className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {rosterUnitsFlat.map((u) => (
                            <option key={u.id} value={u.id}>{u.name_fr}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-sm text-[var(--foreground-muted)]">
                        {effectCategory === "budget_ministry" && effectSubChoice === "min_pct"
                          ? "Pourcentage minimum (dépense forcée, valeur positive uniquement)"
                          : effectCategory === "budget_debt_surplus"
                            ? "Pourcentage (excédent + / dette −)"
                            : effectCategory === "gdp_growth" || effectCategory === "population_growth"
                              ? "Taux en % (ex: -95 pour -95 % de croissance)"
                              : effectCategory === "military_unit"
                                ? (effectSubChoice === "unit_tech_rate" ? "Points ajoutés par jour (entier)" : "Delta extra (entier, ex. +10 ou -5)")
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
                          const isGrowthEffect =
                            effect_kind === "gdp_growth_base" ||
                            effect_kind === "gdp_growth_per_stat" ||
                            effect_kind === "population_growth_base" ||
                            effect_kind === "population_growth_per_stat";
                          const isMilitaryUnitEffect =
                            effect_kind === "military_unit_extra" || effect_kind === "military_unit_tech_rate";
                          const valueToStore = isGrowthEffect ? valueNum / 100 : isMilitaryUnitEffect ? Math.floor(valueNum) : valueNum;
                          const supabase = createClient();
                          const row = {
                            name: effectName.trim(),
                            effect_kind,
                            effect_target: effect_target || null,
                            effect_subtype: effect_subtype || null,
                            value: valueToStore,
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
          {militaryError && (
            <p className="text-sm text-[var(--danger)]">{militaryError}</p>
          )}
          {(["terre", "air", "mer", "strategique"] as const).map((branch) => {
            const rows = rosterByBranch[branch];
            const groups = (() => {
              const m = new Map<string | null, RosterRowByBranch[]>();
              for (const row of rows) {
                const k = row.unit.sub_type ?? null;
                if (!m.has(k)) m.set(k, []);
                m.get(k)!.push(row);
              }
              return Array.from(m.entries())
                .sort((a, b) => {
                  if (a[0] == null) return 1;
                  if (b[0] == null) return -1;
                  return (a[0] as string).localeCompare(b[0] as string);
                })
                .map(([subType, subRows]) => ({
                  subType,
                  label: subType ?? "Sans catégorie",
                  rows: subRows,
                }));
            })();

            return (
              <section key={branch} className={panelClass} style={panelStyle}>
                <h2 className="mb-3 text-lg font-semibold text-[var(--foreground)]">
                  {BRANCH_LABELS[branch]}
                </h2>
                {rows.length === 0 ? (
                  <p className="text-[var(--foreground-muted)]">Aucune unité dans le roster.</p>
                ) : (
                  <div className="space-y-1">
                    {groups.map(({ subType, label, rows: subRows }) => {
                      const subKey = `${branch}_${subType ?? "__none__"}`;
                      const isOpen = militarySubtypeOpen[subKey] !== false;
                      return (
                        <div key={subKey} className="rounded border" style={{ borderColor: "var(--border-muted)" }}>
                          <button
                            type="button"
                            onClick={() => setMilitarySubtypeOpen((prev) => ({ ...prev, [subKey]: !prev[subKey] }))}
                            className="flex w-full items-center gap-2 py-1.5 px-3 text-left text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background-elevated)]"
                            style={{ background: "var(--background-panel)" }}
                          >
                            <span
                              className="inline-block transition-transform duration-200 ease-out"
                              style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                            >
                              ▶
                            </span>
                            <span>{label}</span>
                            <span className="text-[var(--foreground-muted)]">({subRows.length})</span>
                          </button>
                          <div
                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                            style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                          >
                            <div className="overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm table-fixed">
                                  <thead>
                                    <tr className="border-b border-[var(--border)]">
                                      <th className="w-12 pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Icône</th>
                                      <th className="w-[20%] pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Nom</th>
                                      <th className="w-[14%] pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Nombre</th>
                                      <th className="w-[12%] pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Personnel</th>
                                      <th className="pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs">Niveaux</th>
                                      {isAdmin && <th className="w-20 pb-1.5 pt-1 px-2 text-center font-medium text-[var(--foreground-muted)] text-xs" />}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subRows.map((row) => {
                                      const edit = militaryEdit[row.unit.id] ?? {
                                        current_level: Math.max(0, row.countryState?.current_level ?? 0),
                                        extra_count: Math.max(0, row.countryState?.extra_count ?? 0),
                                      };
                                      const storedExtra = isAdmin ? edit.extra_count : (row.countryState?.extra_count ?? 0);
                                      const effectExtraSum = getUnitExtraEffectSum(effects, row.unit.id);
                                      const effectiveExtra = storedExtra + effectExtraSum;
                                      const totalCount = row.unit.base_count + effectiveExtra;
                                      const points = isAdmin
                                        ? Math.max(0, edit.current_level)
                                        : Math.max(0, row.countryState?.current_level ?? 0);
                                      const unlockedLevel = Math.max(
                                        0,
                                        Math.min(row.unit.level_count, Math.floor(points / 100))
                                      );
                                      const manpowerLevel =
                                        unlockedLevel > 0
                                          ? row.levels.find((l) => l.level === unlockedLevel)?.manpower ?? 0
                                          : 0;
                                      const personnel = totalCount * manpowerLevel;
                                      const isLocked = points < 100;
                                      const isSaving = militarySavingId === row.unit.id;

                                      return (
                                        <tr key={row.unit.id} className="border-b border-[var(--border-muted)]">
                                          <td className="w-12 py-0.5 px-2 align-middle text-center">
                                            <div className="inline-block h-9 w-9 overflow-hidden rounded border bg-[var(--background-elevated)]" style={{ borderColor: "var(--border)" }}>
                                              {row.unit.icon_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={row.unit.icon_url} alt="" className="h-full w-full object-contain" />
                                              ) : (
                                                <div className="flex h-full w-full items-center justify-center text-[8px] text-[var(--foreground-muted)]">—</div>
                                              )}
                                            </div>
                                          </td>
                                          <td className="w-[20%] py-0.5 px-2 align-middle text-center">
                                            <span className="inline-block max-w-full truncate text-xs font-medium text-[var(--foreground)]" title={row.unit.name_fr}>
                                              {row.unit.name_fr}
                                            </span>
                                          </td>
                                          <td className="w-[14%] py-0.5 px-2 align-middle text-center">
                                            {isAdmin ? (
                                              <div className="flex flex-wrap items-center justify-center gap-0.5">
                                                <span className="text-[10px] text-[var(--foreground-muted)]">{row.unit.base_count}+</span>
                                                <input
                                                  type="number"
                                                  min={0}
                                                  className="w-9 rounded border bg-[var(--background)] px-0.5 py-0.5 text-[10px] font-mono text-[var(--foreground)]"
                                                  style={{ borderColor: "var(--border)" }}
                                                  value={edit.extra_count}
                                                  onChange={(e) => {
                                                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                                    setMilitaryEdit((prev) => ({ ...prev, [row.unit.id]: { ...prev[row.unit.id] ?? edit, extra_count: n } }));
                                                  }}
                                                  disabled={isSaving}
                                                />
                                                <span className="text-[10px] text-[var(--foreground-muted)]">= {totalCount}</span>
                                              </div>
                                            ) : (
                                              <span
                                                className="inline-block rounded border px-1.5 py-0.5 font-mono text-xs font-medium text-[var(--foreground)]"
                                                style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
                                              >
                                                {formatNumber(totalCount)}
                                              </span>
                                            )}
                                          </td>
                                          <td className="w-[12%] py-0.5 px-2 font-mono text-xs text-[var(--foreground)] align-middle text-center">
                                            {formatNumber(personnel)}
                                          </td>
                                          <td className="py-0.5 px-2 align-middle">
                                            <div className="flex justify-center">
                                              {isAdmin ? (
                                                <div className="flex items-center gap-1 flex-wrap justify-center">
                                                  <input
                                                    type="number"
                                                    min={0}
                                                    max={row.unit.level_count * 100}
                                                    className="w-12 rounded border bg-[var(--background)] px-1 py-0.5 text-[10px] font-mono text-[var(--foreground)]"
                                                    style={{ borderColor: "var(--border)" }}
                                                    value={edit.current_level}
                                                    onChange={(e) => {
                                                      const n = Math.max(
                                                        0,
                                                        Math.min(row.unit.level_count * 100, Math.floor(Number(e.target.value) || 0))
                                                      );
                                                      setMilitaryEdit((prev) => ({ ...prev, [row.unit.id]: { ...prev[row.unit.id] ?? edit, current_level: n } }));
                                                    }}
                                                    disabled={isSaving}
                                                  />
                                                  <span className="text-[10px] text-[var(--foreground-muted)]">pts</span>
                                                </div>
                                              ) : (
                                                <Tooltip
                                                  content={
                                                    unlockedLevel > 0
                                                      ? `Niveau actuel : ${(points / 100).toFixed(1).replace(".", ",")} / ${row.unit.level_count}`
                                                      : `Unité non débloquée (${(points / 100).toFixed(1).replace(".", ",")} / 1)`
                                                  }
                                                  side="top"
                                                >
                                                  <div className="relative inline-flex w-full min-w-0 max-w-2xl mx-auto">
                                                    <div className={isLocked ? "blur-[1px] opacity-60" : ""}>
                                                      <div className="flex gap-0.5 flex-1">
                                                        {Array.from({ length: row.unit.level_count }, (_, i) => {
                                                          const start = i * 100;
                                                          const end = (i + 1) * 100;
                                                          const filled =
                                                            points <= start
                                                              ? 0
                                                              : points >= end
                                                                ? 1
                                                                : (points - start) / 100;
                                                          return (
                                                            <div
                                                              key={i}
                                                              className="relative h-[2.25rem] min-w-[2.25rem] flex-1 overflow-hidden rounded border transition-colors"
                                                              style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
                                                              aria-hidden
                                                            >
                                                              <div
                                                                className="absolute inset-y-0 left-0"
                                                                style={{
                                                                  width: `${filled * 100}%`,
                                                                  background: "var(--accent)",
                                                                }}
                                                              />
                                                            </div>
                                                          );
                                                        })}
                                                      </div>
                                                    </div>
                                                    {isLocked && (
                                                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                        <span className="rounded bg-[var(--background-panel)]/90 px-1.5 py-0.5 text-xs text-[var(--danger)]">
                                                          🔒
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>
                                                </Tooltip>
                                              )}
                                            </div>
                                          </td>
                                          {isAdmin && (
                                            <td className="w-20 py-0.5 px-2 align-middle text-center">
                                              <button
                                                type="button"
                                                disabled={isSaving}
                                                onClick={async () => {
                                                  setMilitaryError(null);
                                                  setMilitarySavingId(row.unit.id);
                                                  const supabase = createClient();
                                                  const { error } = await supabase.from("country_military_units").upsert(
                                                    {
                                                      country_id: country.id,
                                                      roster_unit_id: row.unit.id,
                                                      current_level: edit.current_level,
                                                      extra_count: edit.extra_count,
                                                    },
                                                    { onConflict: "country_id,roster_unit_id" }
                                                  );
                                                  setMilitarySavingId(null);
                                                  if (error) setMilitaryError(error.message);
                                                  else router.refresh();
                                                }}
                                                className="rounded border py-0.5 px-1.5 text-[10px] font-medium disabled:opacity-50"
                                                style={{ borderColor: "var(--border)", background: "var(--accent)", color: "#0f1419" }}
                                              >
                                                {isSaving ? "…" : "Enregistrer"}
                                              </button>
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
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
              {!isAdmin && canEditCountry && (
                <span className="text-xs text-[var(--foreground-muted)]">
                  (La fraction du PIB n'est modifiable que par un administrateur.)
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
                              disabled={!canEditCountry}
                              className="h-2 w-full accent-[var(--accent)] disabled:opacity-60"
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
                  disabled={!canEditCountry || budgetSaving || totalPct > allocationCap}
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

          {isAdmin && worldAverages && Object.keys(ruleParametersByKey).length > 0 && (() => {
            const snapshot: Parameters<typeof getExpectedNextTick>[0] = {
              population: Number(country.population ?? 0),
              gdp: Number(country.gdp ?? 0),
              militarism: Number(country.militarism ?? 0),
              industry: Number(country.industry ?? 0),
              science: Number(country.science ?? 0),
              stability: Number(country.stability ?? 0),
            };
            const budgetPcts: Parameters<typeof getExpectedNextTick>[1] = {
              pct_sante: pcts.pct_sante ?? 0,
              pct_education: pcts.pct_education ?? 0,
              pct_recherche: pcts.pct_recherche ?? 0,
              pct_infrastructure: pcts.pct_infrastructure ?? 0,
              pct_industrie: pcts.pct_industrie ?? 0,
              pct_defense: pcts.pct_defense ?? 0,
              pct_interieur: pcts.pct_interieur ?? 0,
              pct_affaires_etrangeres: pcts.pct_affaires_etrangeres ?? 0,
            };
            const expected = getExpectedNextTick(
              snapshot,
              budgetPcts,
              ruleParametersByKey,
              worldAverages,
              effects.map((e) => ({
                effect_kind: e.effect_kind,
                effect_target: e.effect_target,
                value: e.value,
                duration_remaining: e.duration_remaining,
              })),
            );
            return (
              <section className={panelClass} style={panelStyle}>
                <h2 className="mb-2 text-lg font-semibold text-[var(--foreground-muted)]">
                  Debug — Valeurs attendues à la prochaine mise à jour
                </h2>
                <p className="mb-4 text-sm text-[var(--foreground-muted)]">
                  Si le joueur conserve ces allocations, le cron calculera approximativement les valeurs ci-dessous (moyennes mondiales et règles actuelles). À comparer avec le résultat effectif après le passage du cron.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-[var(--foreground-muted)]">Actuel</div>
                    <ul className="space-y-0.5 font-mono text-sm text-[var(--foreground)]">
                      <li>Population : {formatNumber(snapshot.population)}</li>
                      <li>PIB : {formatGdp(snapshot.gdp)}</li>
                      <li>Militarisme : {Number(snapshot.militarism).toFixed(2)}</li>
                      <li>Industrie : {Number(snapshot.industry).toFixed(2)}</li>
                      <li>Science : {Number(snapshot.science).toFixed(2)}</li>
                      <li>Stabilité : {Number(snapshot.stability).toFixed(2)}</li>
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-[var(--foreground-muted)]">Moyenne mondiale</div>
                    <ul className="space-y-0.5 font-mono text-sm text-[var(--foreground)]">
                      <li>Population : {formatNumber(worldAverages.pop_avg)}</li>
                      <li>PIB : {formatGdp(worldAverages.gdp_avg)}</li>
                      <li>Militarisme : {worldAverages.mil_avg.toFixed(2)}</li>
                      <li>Industrie : {worldAverages.ind_avg.toFixed(2)}</li>
                      <li>Science : {worldAverages.sci_avg.toFixed(2)}</li>
                      <li>Stabilité : {worldAverages.stab_avg.toFixed(2)}</li>
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-[var(--accent)]">Attendu (1 tick)</div>
                    <ul className="space-y-0.5 font-mono text-sm text-[var(--foreground)]">
                      <li>Population : {formatNumber(expected.population)}</li>
                      <li>PIB : {formatGdp(expected.gdp)}</li>
                      <li>Militarisme : {Number(expected.militarism).toFixed(2)}</li>
                      <li>Industrie : {Number(expected.industry).toFixed(2)}</li>
                      <li>Science : {Number(expected.science).toFixed(2)}</li>
                      <li>Stabilité : {Number(expected.stability).toFixed(2)}</li>
                    </ul>
                  </div>
                  <div className="lg:col-span-2">
                    <div className="mb-1 text-xs font-semibold uppercase text-[var(--foreground-muted)]">Évolutions attendues (1 tick)</div>
                    {(() => {
                      const fmt = (v: number) => (v >= 0 ? `+${Number(v).toFixed(4)}` : Number(v).toFixed(4));
                      const rows: { label: string; base: number; final: number; sources: Record<string, number>; effectDelta?: number }[] = [
                        { label: "Évolution population (taux/jour)", base: expected.inputs.budget_pop_rate, final: expected.inputs.pop_total_rate, sources: expected.inputs.budget_pop_sources, effectDelta: expected.inputs.pop_effect_rate },
                        { label: "Évolution PIB (taux/jour)", base: expected.inputs.budget_gdp_rate_base, final: expected.inputs.budget_gdp_rate, sources: expected.inputs.budget_gdp_sources, effectDelta: expected.inputs.gdp_effect_rate },
                        { label: "Évolution Militarisme", base: expected.inputs.budget_mil_base, final: expected.inputs.budget_mil, sources: expected.inputs.budget_mil_sources, effectDelta: expected.inputs.delta_mil },
                        { label: "Évolution Industrie", base: expected.inputs.budget_ind_base, final: expected.inputs.budget_ind, sources: expected.inputs.budget_ind_sources, effectDelta: expected.inputs.delta_ind },
                        { label: "Évolution Science", base: expected.inputs.budget_sci_base, final: expected.inputs.budget_sci, sources: expected.inputs.budget_sci_sources, effectDelta: expected.inputs.delta_sci },
                        { label: "Évolution Stabilité", base: expected.inputs.budget_stab_base, final: expected.inputs.budget_stab, sources: expected.inputs.budget_stab_sources, effectDelta: expected.inputs.delta_stab },
                      ];
                      return (
                        <ul className="space-y-1.5 text-sm text-[var(--foreground)]">
                          {rows.map(({ label, base, final, sources, effectDelta }) => {
                            const hasGravity = Math.abs(base - final) > 1e-6;
                            const detailParts = Object.entries(sources)
                              .filter(([, val]) => Math.abs(val) > 1e-6)
                              .map(([name, val]) => `${name} ${fmt(val)}`);
                            if (effectDelta !== undefined && Math.abs(effectDelta) > 1e-6) detailParts.push(`Effets ${fmt(effectDelta)}`);
                            const detailText = detailParts.length > 0 ? detailParts.join(", ") : "Aucune contribution";
                            return (
                              <li key={label} className="flex flex-wrap items-baseline gap-x-1">
                                <span><strong>{label}</strong> : {hasGravity ? `${fmt(base)} → ${fmt(final)} (gravité)` : fmt(final)}</span>
                                <Tooltip content={<span className="font-mono text-xs">{detailText}</span>} side="bottom">
                                  <span className="cursor-help text-[var(--foreground-muted)] underline decoration-dotted">[Détail]</span>
                                </Tooltip>
                              </li>
                            );
                          })}
                          <li className="pt-1.5 mt-1.5 border-t font-mono text-xs" style={{ borderColor: "var(--border)" }}>
                            Taux total population : {Number(expected.inputs.pop_total_rate).toFixed(4)}
                          </li>
                          <li className="font-mono text-xs">Taux total PIB : {Number(expected.inputs.gdp_total_rate).toFixed(4)}</li>
                        </ul>
                      );
                    })()}
                    <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: "var(--border)" }}>
                      <div className="mb-1 font-semibold text-[var(--foreground-muted)]">Modificateurs globaux</div>
                      <ul className="space-y-0.5 font-mono text-[var(--foreground-muted)]">
                        <li>Taux de base population : {Number(expected.inputs.pop_base).toFixed(4)}</li>
                        <li>Taux de base PIB : {Number(expected.inputs.gdp_base).toFixed(4)}</li>
                        <li>Population (depuis stats) : {Number(expected.inputs.pop_from_stats).toFixed(4)}</li>
                        <li>PIB (depuis stats) : {Number(expected.inputs.gdp_from_stats).toFixed(4)}</li>
                      </ul>
                    </div>
                    {effects.length > 0 && (
                      <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: "var(--border)" }}>
                        <div className="mb-1 font-semibold text-[var(--foreground-muted)]">Effets actifs</div>
                        <ul className="space-y-0.5 text-[var(--foreground-muted)]">
                          {effects.map((e, i) => (
                            <li key={i}>
                              {getEffectDescription(e, {
                                rosterUnitName: (id) => rosterUnitsFlat.find((u) => u.id === id)?.name_fr ?? null,
                              })}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Debug : derniers passages du cron (inputs + avant/après) */}
          {isAdmin && updateLogs.length > 0 && (
            <section className={panelClass} style={panelStyle}>
              <h2 className="mb-4 text-lg font-semibold text-[var(--foreground-muted)]">
                Debug — Dernières mises à jour cron
              </h2>
              <p className="mb-4 text-sm text-[var(--foreground-muted)]">
                Variables d’entrée et résultats avant/après pour chaque passage du cron.
              </p>
              <p className="mb-4 text-xs text-[var(--foreground-muted)]">
                <strong>Stats / Stabilité :</strong> <code className="rounded bg-black/20 px-1">budget_*</code> = somme des (pct_ministère/100 × bonus) depuis les règles globales. La formule est <strong>avant + delta_effets + budget</strong> (pas de multiplicateur) ; la magnitude vient des règles. Bornes : stabilité -3..3, mil/ind/sci 0..10.
              </p>
              <ul className="space-y-6">
                {updateLogs.map((log) => {
                  const budgetStabRaw = Number(log.inputs?.budget_stab ?? 0);
                  const hasLegacyScale = log.inputs?.budget_scale != null || log.inputs?.budget_stab_cap != null;
                  const scaleStab = Number(log.inputs?.budget_scale ?? 50);
                  const budgetTermStab = hasLegacyScale
                    ? (log.inputs?.budget_stab_cap != null ? Math.min(1, Math.max(-1, budgetStabRaw * 50)) : budgetStabRaw * scaleStab)
                    : budgetStabRaw;
                  const stabilityComputed =
                    log.stability_before != null
                      ? Math.min(3, Math.max(-3, Math.round(Number(log.stability_before) + Number(log.inputs?.delta_stab ?? 0) + budgetTermStab)))
                      : null;
                  const dm = Number(log.inputs?.delta_mil ?? 0);
                  const di = Number(log.inputs?.delta_ind ?? 0);
                  const ds = Number(log.inputs?.delta_sci ?? 0);
                  const bm = Number(log.inputs?.budget_mil ?? 0);
                  const bi = Number(log.inputs?.budget_ind ?? 0);
                  const bs = Number(log.inputs?.budget_sci ?? 0);
                  const legacyScale = Number(log.inputs?.budget_scale_mil_ind_sci ?? log.inputs?.budget_scale ?? 50);
                  const milComputed = log.militarism_before != null ? Math.min(10, Math.max(0, Math.round(Number(log.militarism_before) + dm + (hasLegacyScale ? bm * legacyScale : bm)))) : null;
                  const indComputed = log.industry_before != null ? Math.min(10, Math.max(0, Math.round(Number(log.industry_before) + di + (hasLegacyScale ? bi * legacyScale : bi)))) : null;
                  const sciComputed = log.science_before != null ? Math.min(10, Math.max(0, Math.round(Number(log.science_before) + ds + (hasLegacyScale ? bs * legacyScale : bs)))) : null;
                  return (
                    <li
                      key={log.id}
                      className="rounded-lg border p-4 font-mono text-sm"
                      style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
                    >
                      <div className="mb-3 text-xs text-[var(--foreground-muted)]">
                        {new Date(log.run_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <div className="mb-1 font-semibold text-[var(--foreground-muted)]">Inputs (taux / jour)</div>
                          <pre className="whitespace-pre-wrap break-all text-xs">
                            {[
                              ["pop_base", log.inputs?.pop_base],
                              ["gdp_base", log.inputs?.gdp_base],
                              ["pop_from_stats", log.inputs?.pop_from_stats],
                              ["gdp_from_stats", log.inputs?.gdp_from_stats],
                              ["pop_effect_rate", log.inputs?.pop_effect_rate],
                              ["gdp_effect_rate", log.inputs?.gdp_effect_rate],
                              ["budget_pop_rate", log.inputs?.budget_pop_rate],
                              ["budget_gdp_rate", log.inputs?.budget_gdp_rate],
                              ["pop_total_rate", log.inputs?.pop_total_rate],
                              ["gdp_total_rate", log.inputs?.gdp_total_rate],
                              ["delta_stab", log.inputs?.delta_stab],
                              ["budget_stab", log.inputs?.budget_stab],
                              ["budget_scale", log.inputs?.budget_scale],
                              ["budget_scale_mil_ind_sci", log.inputs?.budget_scale_mil_ind_sci],
                              ["budget_stab_cap", log.inputs?.budget_stab_cap],
                            ]
                              .filter(([, v]) => v != null)
                              .map(([k, v]) => `${k}: ${Number(v)}`)
                              .join("\n")}
                          </pre>
                        </div>
                        <div>
                          <div className="mb-1 font-semibold text-[var(--foreground-muted)]">Avant</div>
                          <ul className="space-y-0.5 text-xs">
                            <li>Population: {formatNumber(log.population_before ?? 0)}</li>
                            <li>PIB: {formatGdp(log.gdp_before ?? 0)}</li>
                            <li>Militarisme: {log.militarism_before ?? "—"}</li>
                            <li>Industrie: {log.industry_before ?? "—"}</li>
                            <li>Science: {log.science_before ?? "—"}</li>
                            <li>Stabilité: {log.stability_before ?? "—"}</li>
                          </ul>
                        </div>
                        <div>
                          <div className="mb-1 font-semibold text-[var(--foreground-muted)]">Après</div>
                          <ul className="space-y-0.5 text-xs">
                            <li>Population: {formatNumber(log.population_after ?? 0)}</li>
                            <li>PIB: {formatGdp(log.gdp_after ?? 0)}</li>
                            <li>Militarisme: {log.militarism_after ?? "—"}</li>
                            <li>Industrie: {log.industry_after ?? "—"}</li>
                            <li>Science: {log.science_after ?? "—"}</li>
                            <li>Stabilité: {log.stability_after ?? "—"}</li>
                          </ul>
                        </div>
                      </div>
                      <div className="mt-4 border-t pt-3 text-xs" style={{ borderColor: "var(--border-muted)" }}>
                        <div className="mb-1 font-semibold text-[var(--foreground-muted)]">Formule appliquée (input → output)</div>
                        <ul className="space-y-1 font-mono">
                          <li>
                            <span className="text-[var(--foreground-muted)]">Population:</span>{" "}
                            max(0, arrondi(avant × (1 + pop_total_rate))) →{" "}
                            {formatNumber(log.population_before ?? 0)} × (1 + {Number(log.inputs?.pop_total_rate ?? 0).toFixed(4)}) ≈{" "}
                            {formatNumber(Math.max(0, Math.round(Number(log.population_before ?? 0) * (1 + Number(log.inputs?.pop_total_rate ?? 0)))))}
                            {log.population_after != null && ` (réel: ${formatNumber(log.population_after)})`}
                          </li>
                          <li>
                            <span className="text-[var(--foreground-muted)]">PIB:</span>{" "}
                            max(0, avant × (1 + gdp_total_rate)) →{" "}
                            {formatGdp(log.gdp_before ?? 0)} × (1 + {Number(log.inputs?.gdp_total_rate ?? 0).toFixed(4)}) ≈{" "}
                            {formatGdp(Math.max(0, Number(log.gdp_before ?? 0) * (1 + Number(log.inputs?.gdp_total_rate ?? 0))))}
                            {log.gdp_after != null && ` (réel: ${formatGdp(log.gdp_after)})`}
                          </li>
                          <li>
                            <span className="text-[var(--foreground-muted)]">Stabilité:</span>{" "}
                            {hasLegacyScale
                              ? (log.inputs?.budget_stab_cap != null ? "borné(-3..3, arrondi(avant + delta_stab + cap(±1, budget_stab×50)))" : "borné(-3..3, arrondi(avant + delta_stab + budget_stab×scale))")
                              : "borné(-3..3, arrondi(avant + delta_stab + budget_stab))"}{" "}
                            → {log.stability_before ?? "—"} + {Number(log.inputs?.delta_stab ?? 0)}{" "}
                            + {hasLegacyScale ? (log.inputs?.budget_stab_cap != null ? `cap(±1, ${budgetStabRaw.toFixed(3)}×50)` : `${budgetStabRaw.toFixed(3)}×${scaleStab}`) : budgetStabRaw.toFixed(4)}{" "}
                            = {stabilityComputed ?? "—"}
                            {log.stability_after != null && ` (réel: ${log.stability_after})`}
                          </li>
                          <li>
                            <span className="text-[var(--foreground-muted)]">Militarisme:</span>{" "}
                            borné(0..10, arrondi(avant + delta_mil + budget_mil{hasLegacyScale ? `×${legacyScale}` : ""})) → {log.militarism_before ?? "—"} + {dm} + {hasLegacyScale ? `${bm.toFixed(4)}×${legacyScale}` : bm.toFixed(4)} = {milComputed ?? "—"}
                            {log.militarism_after != null && ` (réel: ${log.militarism_after})`}
                          </li>
                          <li>
                            <span className="text-[var(--foreground-muted)]">Industrie:</span>{" "}
                            borné(0..10, arrondi(avant + delta_ind + budget_ind{hasLegacyScale ? `×${legacyScale}` : ""})) → {log.industry_before ?? "—"} + {di} + {hasLegacyScale ? `${bi.toFixed(4)}×${legacyScale}` : bi.toFixed(4)} = {indComputed ?? "—"}
                            {log.industry_after != null && ` (réel: ${log.industry_after})`}
                          </li>
                          <li>
                            <span className="text-[var(--foreground-muted)]">Science:</span>{" "}
                            borné(0..10, arrondi(avant + delta_sci + budget_sci{hasLegacyScale ? `×${legacyScale}` : ""})) → {log.science_before ?? "—"} + {ds} + {hasLegacyScale ? `${bs.toFixed(4)}×${legacyScale}` : bs.toFixed(4)} = {sciComputed ?? "—"}
                            {log.science_after != null && ` (réel: ${log.science_after})`}
                          </li>
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
