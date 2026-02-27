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
  isEffectPositive,
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
  isAdmin,
}: {
  country: Country;
  macros: { key: string; value: number }[];
  limits: { limit_value: number; military_unit_types: { name_fr: string; branch: MilitaryBranch } | null }[];
  perksDef: { id: string; name_fr: string; description_fr: string | null; modifier: string | null; min_militarism: number | null; min_industry: number | null; min_science: number | null; min_stability: number | null }[];
  unlockedPerkIds: Set<string>;
  budget: CountryBudget | null;
  effects: CountryEffect[];
  isAdmin: boolean;
}) {
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
    setPcts({
      pct_etat: Number(budget.pct_etat) || 0,
      pct_education: Number(budget.pct_education) || 0,
      pct_recherche: Number(budget.pct_recherche) || 0,
      pct_infrastructure: Number(budget.pct_infrastructure) || 0,
      pct_sante: Number(budget.pct_sante) || 0,
      pct_industrie: Number(budget.pct_industrie) || 0,
      pct_defense: Number(budget.pct_defense) || 0,
      pct_interieur: Number(budget.pct_interieur) || 0,
      pct_affaires_etrangeres: Number(budget.pct_affaires_etrangeres) || 0,
    });
  }, [budget?.id]);

  const totalPct = BUDGET_MINISTRIES.reduce((s, m) => s + pcts[m.key], 0);
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
          Généralités · Société · Macros
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
        <div className="space-y-6">
          <section className={panelClass} style={panelStyle}>
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Généralités
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Nom</dt>
                <dd className="font-medium">{country.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Régime</dt>
                <dd className="font-medium">{country.regime ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Population</dt>
                <dd className="stat-value font-semibold">{formatNumber(country.population)}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">PIB</dt>
                <dd className="stat-value font-semibold">{formatGdp(country.gdp)}</dd>
              </div>
              {country.flag_url && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-[var(--foreground-muted)]">Drapeau</dt>
                  <dd>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={country.flag_url}
                      alt=""
                      width={120}
                      height={80}
                      className="h-20 w-[120px] rounded border border-[var(--border)] object-cover"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </dd>
                </div>
              )}
            </dl>

            <h3 className="mb-3 mt-6 text-base font-semibold text-[var(--foreground)]">
              Effets en cours
            </h3>
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
                        className={`text-sm ${isEffectPositive(Number(e.value)) ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}
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
                    <div>
                      <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Valeur (nombre, négatif = malus)</label>
                      <input
                        type="number"
                        step="any"
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
                          const durationNum = Math.max(0, Math.floor(Number(effectDurationRemaining) || 0));
                          const { effect_kind, effect_target, effect_subtype } = buildEffectKeys(
                            effectCategory,
                            effectSubChoice,
                            effectTarget
                          );
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
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Société
            </h2>
            <dl className="grid gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Militarisme</dt>
                <dd className="stat-value text-xl font-semibold">{country.militarism}/10</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Industrie</dt>
                <dd className="stat-value text-xl font-semibold">{country.industry}/10</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Science</dt>
                <dd className="stat-value text-xl font-semibold">{country.science}/10</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--foreground-muted)]">Stabilité</dt>
                <dd className="stat-value text-xl font-semibold">{country.stability} (-3 à 3)</dd>
              </div>
            </dl>
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
                <li>Tout fond non alloué sera perdu : allouez à 100 %.</li>
              </ul>
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
                    const amountMonthlyBn = (totalBudgetMonthly * value) / 100 / 1e9;
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-4 py-1">
                        <div className="w-64 shrink-0">
                          <Tooltip content={tooltip}>
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--foreground)]">
                              {label}
                              <span className="text-[var(--foreground-muted)]" aria-hidden>ⓘ</span>
                            </span>
                          </Tooltip>
                        </div>
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={0.5}
                            value={value}
                            onChange={(e) => setPcts((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                            className="h-2 flex-1 accent-[var(--accent)]"
                          />
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
                      width: `${Math.min(totalPct, 100)}%`,
                      background: totalPct > 100 ? "var(--danger)" : "var(--accent)",
                    }}
                  />
                </div>
                <span className={`w-14 shrink-0 text-right text-sm font-mono ${totalPct > 100 ? "text-[var(--danger)]" : "text-[var(--foreground-muted)]"}`}>
                  {totalPct.toFixed(1)} %
                </span>
              </div>
              {totalPct > 100 && (
                <p className="text-sm text-[var(--danger)]">
                  La somme des allocations ne doit pas dépasser 100 %. Réduisez les pourcentages pour pouvoir enregistrer.
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={budgetSaving || totalPct > 100}
                  onClick={async () => {
                    if (totalPct > 100) {
                      setBudgetError("La somme des allocations ne doit pas dépasser 100 %.");
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
