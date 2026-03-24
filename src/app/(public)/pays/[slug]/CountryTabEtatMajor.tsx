"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MilitaryBranch } from "@/types/database";
import type { Country } from "@/types/database";
import type { RosterRowByBranch } from "./countryTabsTypes";
import type { ResolvedEffect } from "@/lib/countryEffects";
import { saveEtatMajorFocus, type EtatMajorFocusPayload } from "./actions";
import { sumEtatMajorBudgetBonusesFromRules } from "@/lib/ruleParameters";

const BRANCH_LABELS: Record<MilitaryBranch, string> = {
  terre: "Terre",
  air: "Air",
  mer: "Mer",
  strategique: "Stratégique",
};

type EtatMajorConfig = {
  design?: { min_points_per_tick?: number; max_points_per_tick?: number };
  recrutement?: { min_points_per_tick?: number; max_points_per_tick?: number; points_per_pct_defense?: number };
  stock?: { min_points_per_tick?: number; max_points_per_tick?: number };
  procuration?: { base_points_per_tick?: number; points_per_pct_budget?: number };
};

function getBonusFromEffects(effects: ResolvedEffect[], kind: string): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind !== kind) continue;
    const v = Number(e.value);
    sum += Math.abs(v) > 1 ? v / 100 : v;
  }
  return sum;
}

function getProcurationPointsPerDay(effects: ResolvedEffect[]): number {
  let sum = 0;
  for (const e of effects) {
    if (e.effect_kind === "procuration_points_per_day") sum += Number(e.value);
  }
  return sum;
}

type SectionUnit = { id: string; name_fr: string; branch: MilitaryBranch; sub_type: string | null; icon_url: string | null; row: RosterRowByBranch };

type CountryTabEtatMajorProps = {
  countryId: string;
  countrySlug: string;
  country: Country;
  etatMajorFocus: { design_roster_unit_id: string | null; recrutement_roster_unit_id: string | null; procuration_roster_unit_id: string | null; stock_roster_unit_id: string | null } | null;
  rosterByBranch: Record<MilitaryBranch, RosterRowByBranch[]>;
  ruleParametersByKey: Record<string, { value: unknown }>;
  resolvedEffects: ResolvedEffect[];
  pctProcurationMilitaire?: number;
  pctDefense?: number;
  /** Pour estimer les bonus budget État-major (aligné cron). */
  worldAverages?: { pop_avg: number; gdp_avg: number; mil_avg: number; ind_avg: number; sci_avg: number; stab_avg: number } | null;
  budgetPctFields?: Record<string, number>;
  panelClass: string;
  panelStyle: React.CSSProperties;
  canEditCountry: boolean;
};

export function CountryTabEtatMajor({
  countryId,
  countrySlug,
  country,
  etatMajorFocus,
  rosterByBranch,
  ruleParametersByKey,
  resolvedEffects,
  pctProcurationMilitaire = 0,
  pctDefense = 0,
  worldAverages = null,
  budgetPctFields = {},
  panelClass,
  panelStyle,
  canEditCountry,
}: CountryTabEtatMajorProps) {
  const router = useRouter();
  const [savingSection, setSavingSection] = useState<SectionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = (ruleParametersByKey.etat_major_config?.value ?? {}) as EtatMajorConfig;
  const designCfg = config.design ?? { min_points_per_tick: 1, max_points_per_tick: 10 };
  const recrutementCfg = config.recrutement ?? { min_points_per_tick: 1, max_points_per_tick: 10, points_per_pct_defense: 0 };
  const stockCfg = config.stock ?? { min_points_per_tick: 1, max_points_per_tick: 10 };
  const procurationCfg = config.procuration ?? { base_points_per_tick: 0, points_per_pct_budget: 0.5 };

  const industry = Number(country.industry ?? 0);
  const militarism = Number(country.militarism ?? 0);
  const science = Number(country.science ?? 0);
  const designBonus = getBonusFromEffects(resolvedEffects, "design_bonus_percent");
  const recrutementBonus = getBonusFromEffects(resolvedEffects, "recrutement_bonus_percent");
  const procurationBonus = getBonusFromEffects(resolvedEffects, "procuration_bonus_percent");
  const procurationPointsPerDay = getProcurationPointsPerDay(resolvedEffects);

  const emFromBudget = sumEtatMajorBudgetBonusesFromRules(ruleParametersByKey, budgetPctFields, worldAverages, {
    population: Number(country.population ?? 0),
    gdp: Number(country.gdp ?? 0),
    militarism: Number(country.militarism ?? 0),
    industry: Number(country.industry ?? 0),
    science: Number(country.science ?? 0),
    stability: Number(country.stability ?? 0),
  });

  const designPtsPerTick =
    (designCfg.min_points_per_tick ?? 1) +
    ((designCfg.max_points_per_tick ?? 10) - (designCfg.min_points_per_tick ?? 1)) * Math.min(10, Math.max(0, industry)) / 10;
  const designPtsPerDay = Math.round(designPtsPerTick * (1 + designBonus + emFromBudget.em_design_bonus));

  const recrutementBaseMil =
    (recrutementCfg.min_points_per_tick ?? 1) +
    ((recrutementCfg.max_points_per_tick ?? 10) - (recrutementCfg.min_points_per_tick ?? 1)) * Math.min(10, Math.max(0, militarism)) / 10;
  const recrutementDefenseAdd =
    (recrutementCfg.points_per_pct_defense ?? 0) * Math.min(100, Math.max(0, pctDefense));
  const recrutementPtsPerTick = recrutementBaseMil + recrutementDefenseAdd;
  const recrutementPtsPerDay = Math.round(recrutementPtsPerTick * (1 + recrutementBonus + emFromBudget.em_rec_bonus));

  const stockPtsPerTick =
    (stockCfg.min_points_per_tick ?? 1) +
    ((stockCfg.max_points_per_tick ?? 10) - (stockCfg.min_points_per_tick ?? 1)) * Math.min(10, Math.max(0, science)) / 10;
  const stockPtsPerDay = Math.round(stockPtsPerTick * (1 + emFromBudget.em_stock_bonus));

  const procurationPct = pctProcurationMilitaire;
  const procurationPtsPerTick =
    (procurationCfg.base_points_per_tick ?? 0) + (procurationCfg.points_per_pct_budget ?? 0.5) * procurationPct;
  const procurationPtsPerDay = Math.round(
    procurationPtsPerTick * (1 + procurationBonus + emFromBudget.em_proc_bonus) + procurationPointsPerDay
  );

  const focus = etatMajorFocus ?? {
    design_roster_unit_id: null,
    recrutement_roster_unit_id: null,
    procuration_roster_unit_id: null,
    stock_roster_unit_id: null,
  };

  const allUnits: SectionUnit[] = [];
  for (const b of ["terre", "air", "mer", "strategique"] as const) {
    for (const row of rosterByBranch[b] ?? []) {
      allUnits.push({
        id: row.unit.id,
        name_fr: row.unit.name_fr,
        branch: row.unit.branch,
        sub_type: row.unit.sub_type ?? null,
        icon_url: row.unit.icon_url ?? null,
        row,
      });
    }
  }
  allUnits.sort(
    (a, b) =>
      BRANCH_LABELS[a.branch].localeCompare(BRANCH_LABELS[b.branch]) ||
      (a.sub_type ?? "").localeCompare(b.sub_type ?? "") ||
      a.name_fr.localeCompare(b.name_fr)
  );

  const designUnits = allUnits;
  const recrutementUnits = allUnits.filter(
    (u) => u.branch === "terre" && (u.sub_type === "Infanterie" || u.sub_type === "Blindé" || u.sub_type === "Blindés")
  );
  const procurationUnits = allUnits.filter(
    (u) => (u.branch === "terre" && u.sub_type === "Soutien") || u.branch === "air" || u.branch === "mer"
  );
  const stockUnits = allUnits.filter((u) => u.branch === "strategique");

  const updateFocus = async (section: SectionType, payload: EtatMajorFocusPayload) => {
    if (!canEditCountry) return;
    setSavingSection(section);
    setError(null);
    const result = await saveEtatMajorFocus(countryId, countrySlug, payload);
    if (result?.error) {
      setError(result.error);
      setSavingSection(null);
      return;
    }
    router.refresh();
    setTimeout(() => setSavingSection(null), 500);
  };

  const handleDesignChange = (rosterUnitId: string) => {
    const id = rosterUnitId || null;
    updateFocus("design", { ...focus, design_roster_unit_id: id });
  };
  const handleRecrutementChange = (rosterUnitId: string) => {
    const id = rosterUnitId || null;
    updateFocus("recrutement", { ...focus, recrutement_roster_unit_id: id });
  };
  const handleProcurationChange = (rosterUnitId: string) => {
    const id = rosterUnitId || null;
    updateFocus("procuration", { ...focus, procuration_roster_unit_id: id });
  };
  const handleStockChange = (rosterUnitId: string) => {
    const id = rosterUnitId || null;
    updateFocus("stock", { ...focus, stock_roster_unit_id: id });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <section
        className="relative overflow-visible rounded-xl min-h-[280px]"
        style={{ ...panelStyle, isolation: "isolate" }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url(/images/site/bureau-design-bg.png)" }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/22 via-black/10 to-black/26" />
        </div>
        <div className="relative z-10 flex flex-col gap-5 p-6">
          <h3 className="text-2xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] [text-shadow:0_0_20px_rgba(0,0,0,0.8)]">
            Bureau de Design
          </h3>
          <div className="rounded-2xl border border-white/25 bg-white/15 p-5 shadow-xl backdrop-blur-xl max-w-2xl">
            <p className="mb-4 text-sm font-medium text-white/95">
              Recherche et développement de nouvelles technologies militaires
            </p>
            <EtatMajorSection
              units={designUnits}
              selectedId={focus.design_roster_unit_id}
              onSelect={handleDesignChange}
              canEdit={canEditCountry && savingSection === null}
              isSaving={savingSection === "design"}
              type="design"
              country={country}
              configPtsPerDay={designPtsPerDay}
              resolvedEffects={resolvedEffects}
              glassContext
              hideUnitLabel
            />
          </div>
        </div>
      </section>

      <section
        className="relative overflow-visible rounded-xl min-h-[280px]"
        style={{ ...panelStyle, isolation: "isolate" }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          {/* A/B test : variante actuelle = recrutement-bg-alt.png ; originale = recrutement-bg.png */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url(/images/site/recrutement-bg-alt.png)" }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/22 via-black/10 to-black/26" />
        </div>
        <div className="relative z-10 flex flex-col gap-5 p-6">
          <h3 className="text-2xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] [text-shadow:0_0_20px_rgba(0,0,0,0.8)]">
            Recrutement
          </h3>
          <div className="rounded-2xl border border-white/25 bg-white/15 p-5 shadow-xl backdrop-blur-xl max-w-2xl">
            <p className="mb-4 text-sm font-medium text-white/95">
              Déploiement de nouvelles brigades d&apos;infanterie et de blindés
            </p>
            <EtatMajorSection
              units={recrutementUnits}
              selectedId={focus.recrutement_roster_unit_id}
              onSelect={handleRecrutementChange}
              canEdit={canEditCountry && savingSection === null}
              isSaving={savingSection === "recrutement"}
              type="recrutement"
              country={country}
              configPtsPerDay={recrutementPtsPerDay}
              resolvedEffects={resolvedEffects}
              glassContext
              hideUnitLabel
            />
          </div>
        </div>
      </section>

      <section
        className="relative overflow-visible rounded-xl min-h-[280px]"
        style={{ ...panelStyle, isolation: "isolate" }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url(/images/site/procuration-bg.png)" }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-black/8 to-black/22" />
        </div>
        <div className="relative z-10 flex flex-col gap-5 p-6">
          <h3 className="text-2xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] [text-shadow:0_0_20px_rgba(0,0,0,0.8)]">
            Procuration
          </h3>
          <div className="rounded-2xl border border-white/25 bg-white/15 p-5 shadow-xl backdrop-blur-xl max-w-2xl">
            <p className="mb-4 text-sm font-medium text-white/95">
              Déploiement de nouveaux navires ou escadrons aériens
            </p>
            <EtatMajorSection
              units={procurationUnits}
              selectedId={focus.procuration_roster_unit_id}
              onSelect={handleProcurationChange}
              canEdit={canEditCountry && savingSection === null}
              isSaving={savingSection === "procuration"}
              type="procuration"
              country={country}
              configPtsPerDay={procurationPtsPerDay}
              resolvedEffects={resolvedEffects}
              glassContext
              hideUnitLabel
            />
          </div>
        </div>
      </section>

      <section
        className="relative overflow-visible rounded-xl min-h-[280px]"
        style={{ ...panelStyle, isolation: "isolate" }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url(/images/site/stock-strategique-bg.png)" }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-black/8 to-black/22" />
        </div>
        <div className="relative z-10 flex flex-col gap-5 p-6">
          <h3 className="text-2xl font-bold tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] [text-shadow:0_0_20px_rgba(0,0,0,0.8)]">
            Stock Stratégique
          </h3>
          <div className="rounded-2xl border border-white/25 bg-white/15 p-5 shadow-xl backdrop-blur-xl max-w-2xl">
            <p className="mb-4 text-sm font-medium text-white/95">
              Déploiement de nouveaux stocks de missiles, lanceurs, et consommables.
            </p>
            <EtatMajorSection
              units={stockUnits}
              selectedId={focus.stock_roster_unit_id}
              onSelect={handleStockChange}
              canEdit={canEditCountry && savingSection === null}
              isSaving={savingSection === "stock"}
              type="stock"
              country={country}
              configPtsPerDay={stockPtsPerDay}
              resolvedEffects={resolvedEffects}
              glassContext
              hideUnitLabel
            />
          </div>
        </div>
      </section>
    </div>
  );
}

type SectionType = "design" | "recrutement" | "procuration" | "stock";

function EtatMajorSection({
  units,
  selectedId,
  onSelect,
  canEdit,
  isSaving,
  type,
  country,
  configPtsPerDay,
  resolvedEffects,
  glassContext = false,
  hideUnitLabel = false,
}: {
  units: SectionUnit[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  canEdit: boolean;
  isSaving: boolean;
  type: SectionType;
  country: Country;
  configPtsPerDay: number;
  resolvedEffects: ResolvedEffect[];
  glassContext?: boolean;
  hideUnitLabel?: boolean;
}) {
  const selected = selectedId ? units.find((u) => u.id === selectedId) : null;
  const state = selected?.row.countryState ?? null;
  const levels = selected?.row.levels ?? [];
  const science = Number(country.science ?? 0);

  const maxLevelByScience =
    type === "design" && levels.length > 0
      ? Math.max(
          0,
          ...levels
            .filter((l) => (l.science_required ?? 0) <= science)
            .map((l) => l.level)
        )
      : 10;
  const currentLevelDesign = state ? Math.floor(state.current_level / 100) : 0;
  const pointsInLevelDesign = state ? state.current_level % 100 : 0;
  const isDesignBlockedByScience = type === "design" && currentLevelDesign >= maxLevelByScience && maxLevelByScience < (levels[levels.length - 1]?.level ?? 10);

  const unlockedLevel =
    state && levels.length > 0
      ? Math.max(1, Math.min(levels[levels.length - 1]?.level ?? 1, Math.floor(state.current_level / 100)))
      : 1;
  const levelRow = levels.find((l) => l.level === unlockedLevel);
  const cost = type !== "design" ? (levelRow?.mobilization_cost ?? 100) : 100;
  const points =
    type === "design"
      ? pointsInLevelDesign
      : type === "recrutement"
        ? (state?.recrutement_points ?? 0)
        : type === "procuration"
          ? (state?.procuration_points ?? 0)
          : (state?.stock_points ?? 0);
  const progressPct = type === "design" ? (points / 100) * 100 : cost > 0 ? Math.min(100, (points / cost) * 100) : 0;
  const pointsRemaining = type === "design" ? 100 - pointsInLevelDesign : Math.max(0, cost - points);
  const daysRemaining =
    configPtsPerDay > 0 && pointsRemaining > 0 ? Math.ceil(pointsRemaining / configPtsPerDay) : null;

  const labelClass = glassContext
    ? "mb-1 block text-xs text-white/90"
    : "mb-1 block text-xs text-[var(--foreground-muted)]";
  const showLabel = !hideUnitLabel;
  const selectClass = "w-full max-w-md rounded border bg-[var(--background-panel)] px-3 py-2 text-sm text-[var(--foreground)]";
  const selectStyle = { borderColor: "var(--border)" };
  const cardClass = glassContext
    ? "rounded-xl border border-white/25 bg-black/20 p-4 backdrop-blur-sm"
    : "rounded border p-4";
  const cardStyle = glassContext ? undefined : { borderColor: "var(--border-muted)" };

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [dropdownOpen]);

  const selectedLabel = selectedId
    ? (() => {
        const u = units.find((x) => x.id === selectedId);
        return u ? `${BRANCH_LABELS[u.branch]}${u.sub_type ? ` — ${u.sub_type}` : ""} — ${u.name_fr}` : "— Aucune —";
      })()
    : "— Aucune —";

  return (
    <div className="relative space-y-3">
      {isSaving && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-[var(--background-panel)]/80"
          aria-hidden
        >
          <span
            className="text-4xl animate-spin"
            style={{ filter: "drop-shadow(0 0 4px var(--background))" }}
            title="Mise à jour en cours…"
          >
            ⏳
          </span>
        </div>
      )}
      <div ref={glassContext ? dropdownRef : undefined} className="relative max-w-md">
        {showLabel && <label className={labelClass}>Unité ciblée</label>}
        {glassContext ? (
          <>
            <button
              type="button"
              onClick={() => canEdit && setDropdownOpen((o) => !o)}
              disabled={!canEdit}
              className="w-full rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-left text-sm text-white backdrop-blur-sm focus:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-70"
            >
              {selectedLabel}
            </button>
            {dropdownOpen && (
              <div
                className="absolute top-full left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--background-panel)] py-1 shadow-xl"
                style={{ borderColor: "var(--border)" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect("");
                    setDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]"
                >
                  — Aucune —
                </button>
                {units.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      onSelect(u.id);
                      setDropdownOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]"
                  >
                    {BRANCH_LABELS[u.branch]}
                    {u.sub_type ? ` — ${u.sub_type}` : ""} — {u.name_fr}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <select
            value={selectedId ?? ""}
            onChange={(e) => onSelect(e.target.value)}
            disabled={!canEdit}
            className={selectClass}
            style={selectStyle}
          >
            <option value="">— Aucune —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {BRANCH_LABELS[u.branch]}
                {u.sub_type ? ` — ${u.sub_type}` : ""} — {u.name_fr}
              </option>
            ))}
          </select>
        )}
      </div>
      {selected && (
        <div className={cardClass} style={cardStyle}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {selected.icon_url && (
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-[var(--background)]">
                  <img src={selected.icon_url} alt="" className="h-full w-full object-contain" />
                </div>
              )}
              <div>
                <div className={glassContext ? "font-medium text-white" : "font-medium text-[var(--foreground)]"}>
                  {selected.name_fr}
                </div>
                <div className={glassContext ? "text-xs text-white/85" : "text-xs text-[var(--foreground-muted)]"}>
                  {type === "design" ? (
                    <>{BRANCH_LABELS[selected.branch]} — Niveau {currentLevelDesign} ({pointsInLevelDesign}/100 pts)</>
                  ) : (
                    <>Coût : {cost} points par nouvelle brigade.</>
                  )}
                </div>
              </div>
            </div>
            <div
              className={`flex flex-shrink-0 flex-col items-end justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-right ${glassContext ? "border-white/25 bg-black/20" : "border-[var(--border-muted)] bg-[var(--background)]"}`}
            >
              <div className={`whitespace-nowrap text-sm font-semibold ${glassContext ? "text-white" : "text-[var(--accent)]"}`}>
                +{configPtsPerDay} pts / jour
              </div>
              <div className={`whitespace-nowrap text-xs font-bold ${glassContext ? "text-white" : "text-[var(--foreground)]"}`}>
                {daysRemaining != null ? `${daysRemaining} jour${daysRemaining > 1 ? "s" : ""} restant${daysRemaining > 1 ? "s" : ""}` : "—"}
              </div>
            </div>
          </div>
          {type === "design" && isDesignBlockedByScience && (
            <div className="mt-2 flex items-center gap-2 rounded bg-red-500/15 px-2 py-1.5 text-sm text-red-400">
              <span aria-hidden>🧪</span>
              <span>Progression bloquée : science insuffisante pour le niveau suivant.</span>
            </div>
          )}
          <div className="mt-3">
            <div
              className={`relative mt-1 flex h-6 w-full items-center overflow-hidden rounded-full ${glassContext ? "bg-black/30" : "bg-[var(--background)]"}`}
              style={glassContext ? { border: "1px solid rgba(255,255,255,0.2)" } : { border: "1px solid var(--border-muted)" }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, progressPct)}%`,
                  backgroundColor: type === "design" && isDesignBlockedByScience ? "var(--red-500, #ef4444)" : (glassContext ? "rgba(255,255,255,0.9)" : "var(--accent)"),
                }}
              />
              <span
                className={`relative z-10 w-full text-center text-xs font-medium ${progressPct > 50 ? (glassContext ? "text-black/90" : "text-[var(--foreground)]") : (glassContext ? "text-white" : "text-[var(--foreground)]")}`}
              >
                {type === "design"
                  ? `${pointsInLevelDesign} / 100 pts`
                  : `${points} / ${cost} pts`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
