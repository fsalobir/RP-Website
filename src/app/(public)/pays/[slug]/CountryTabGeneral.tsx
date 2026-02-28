"use client";

import type { Country } from "@/types/database";
import type { CountryEffect } from "@/types/database";
import { formatNumber, formatGdp } from "@/lib/format";
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
  MILITARY_UNIT_EFFECT_SUB_IDS,
  MILITARY_UNIT_EFFECT_SUB_LABELS,
  MILITARY_BRANCH_EFFECT_IDS,
  MILITARY_BRANCH_EFFECT_LABELS,
  type EffectCategoryId,
} from "@/lib/countryEffects";

type CountryTabGeneralProps = {
  country: Country;
  rankPopulation: number;
  rankGdp: number;
  rankEmoji: (r: number) => string | null;
  panelClass: string;
  panelStyle: React.CSSProperties;
  canEditCountry: boolean;
  generalEditMode: boolean;
  setGeneralEditMode: (v: boolean) => void;
  generalName: string;
  setGeneralName: (v: string) => void;
  generalRegime: string;
  setGeneralRegime: (v: string) => void;
  generalFlagUrl: string;
  generalFlagFile: File | null;
  setGeneralFlagFile: (f: File | null) => void;
  generalFlagPreview: string | null;
  generalError: string | null;
  generalSaving: boolean;
  onSaveGeneral: () => Promise<void>;
  onCancelGeneralEdit: () => void;
  effects: CountryEffect[];
  isAdmin: boolean;
  rosterUnitsFlat: { id: string; name_fr: string }[];
  effectsFormOpen: boolean;
  setEffectsFormOpen: (v: boolean) => void;
  editingEffect: CountryEffect | null;
  setEditingEffect: (e: CountryEffect | null) => void;
  effectName: string;
  setEffectName: (v: string) => void;
  effectCategory: EffectCategoryId;
  setEffectCategory: (v: EffectCategoryId) => void;
  effectSubChoice: string | null;
  setEffectSubChoice: (v: string | null) => void;
  effectTarget: string | null;
  setEffectTarget: (v: string | null) => void;
  effectValue: string;
  setEffectValue: (v: string) => void;
  effectDurationKind: "days" | "updates";
  setEffectDurationKind: (v: "days" | "updates") => void;
  effectDurationRemaining: string;
  setEffectDurationRemaining: (v: string) => void;
  effectError: string | null;
  setEffectError: (v: string | null) => void;
  effectSaving: boolean;
  onEditEffect: (e: CountryEffect) => void;
  onDeleteEffect: (e: CountryEffect) => void;
  onOpenNewEffect: () => void;
  onSaveEffect: () => Promise<void>;
  onCloseEffectForm: () => void;
};

export function CountryTabGeneral({
  country,
  rankPopulation,
  rankGdp,
  rankEmoji,
  panelClass,
  panelStyle,
  canEditCountry,
  generalEditMode,
  setGeneralEditMode,
  generalName,
  setGeneralName,
  generalRegime,
  setGeneralRegime,
  generalFlagUrl,
  generalFlagFile,
  setGeneralFlagFile,
  generalFlagPreview,
  generalError,
  generalSaving,
  onSaveGeneral,
  onCancelGeneralEdit,
  effects,
  isAdmin,
  rosterUnitsFlat,
  effectsFormOpen,
  setEffectsFormOpen,
  editingEffect,
  setEditingEffect,
  effectName,
  setEffectName,
  effectCategory,
  setEffectCategory,
  effectSubChoice,
  setEffectSubChoice,
  effectTarget,
  setEffectTarget,
  effectValue,
  setEffectValue,
  effectDurationKind,
  setEffectDurationKind,
  effectDurationRemaining,
  setEffectDurationRemaining,
  effectError,
  setEffectError,
  effectSaving,
  onEditEffect,
  onDeleteEffect,
  onOpenNewEffect,
  onSaveEffect,
  onCloseEffectForm,
}: CountryTabGeneralProps) {
  return (
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

        {canEditCountry && generalEditMode && (
          <div className="mb-8 mt-6 rounded-lg border p-4" style={{ borderColor: "var(--border-muted)", background: "var(--background-elevated)" }}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Modifier les généralités</h3>
              <button
                type="button"
                onClick={onCancelGeneralEdit}
                className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                Annuler
              </button>
            </div>
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
                <label className="mb-1 block text-xs text-[var(--foreground-muted)]">Drapeau</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(e) => setGeneralFlagFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                  id="country-flag-upload"
                />
                <label
                  htmlFor="country-flag-upload"
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
            <div className="mt-3">
              <button
                type="button"
                disabled={generalSaving}
                onClick={onSaveGeneral}
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
                      onClick={() => onEditEffect(e)}
                      className="text-sm text-[var(--accent)] hover:underline"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteEffect(e)}
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
                onClick={onOpenNewEffect}
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
                    <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Type d'effet</label>
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
                    Positif = excédent (plafond d'allocation augmenté, ex. +20 → 120 % max). Négatif = dette (plafond réduit, ex. -20 → 80 % max).
                  </p>
                )}
                {effectCategory === "military_unit" && (
                  <div className="space-y-2">
                    <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Type</label>
                    <select
                      value={effectSubChoice ?? "unit_extra"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEffectSubChoice(v);
                        if (v === "limit_modifier") setEffectTarget("terre");
                        else if (rosterUnitsFlat.length > 0 && !effectTarget) setEffectTarget(rosterUnitsFlat[0].id);
                      }}
                      className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {MILITARY_UNIT_EFFECT_SUB_IDS.map((id) => (
                        <option key={id} value={id}>{MILITARY_UNIT_EFFECT_SUB_LABELS[id]}</option>
                      ))}
                    </select>
                    {effectSubChoice === "limit_modifier" ? (
                      <>
                        <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Branche</label>
                        <select
                          value={effectTarget ?? "terre"}
                          onChange={(e) => setEffectTarget(e.target.value || null)}
                          className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {MILITARY_BRANCH_EFFECT_IDS.map((b) => (
                            <option key={b} value={b}>{MILITARY_BRANCH_EFFECT_LABELS[b]}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
                            ? effectSubChoice === "limit_modifier"
                              ? "Pourcentage (ex. +10 ou -5)"
                              : effectSubChoice === "unit_tech_rate"
                                ? "Points ajoutés par jour (entier)"
                                : "Delta extra (entier, ex. +10 ou -5)"
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
                    onClick={onSaveEffect}
                    className="rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "#0f1419" }}
                  >
                    {effectSaving ? "Enregistrement…" : editingEffect ? "Enregistrer" : "Ajouter"}
                  </button>
                  <button
                    type="button"
                    onClick={onCloseEffectForm}
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
  );
}
