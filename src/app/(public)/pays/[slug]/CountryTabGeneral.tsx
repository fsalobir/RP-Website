"use client";

import Link from "next/link";
import type { Country } from "@/types/database";
import type { CountryEffect } from "@/types/database";
import { formatNumber, formatGdp, formatPopulation } from "@/lib/format";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  getEffectDescription,
  isEffectDisplayPositive,
  formatDurationRemaining,
  ALL_EFFECT_KIND_IDS,
  EFFECT_KIND_LABELS,
  getDefaultTargetForKind,
  getEffectKindValueHelper,
  STAT_KEYS,
  STAT_LABELS,
  getBudgetMinistryOptions,
  MILITARY_BRANCH_EFFECT_IDS,
  MILITARY_BRANCH_EFFECT_LABELS,
  EFFECT_KINDS_WITH_STAT_TARGET,
  EFFECT_KINDS_WITH_BUDGET_TARGET,
  EFFECT_KINDS_WITH_BRANCH_TARGET,
  EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET,
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
  effectKind: string;
  setEffectKind: (v: string) => void;
  effectTarget: string | null;
  setEffectTarget: (v: string | null) => void;
  effectValue: string;
  setEffectValue: (v: string) => void;
  effectDurationKind: "days" | "updates" | "permanent";
  setEffectDurationKind: (v: "days" | "updates" | "permanent") => void;
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
  influenceResult?: import("@/lib/influence").InfluenceResult | null;
  hardPowerByBranch?: import("@/lib/hardPower").HardPowerByBranch | null;
  sphereData?: { totalPopulation: number; totalGdp: number; countries: Array<{ id: string; name: string; slug: string; population: number | null; gdp: number | null }> };
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
  effectKind,
  setEffectKind,
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
  influenceResult = null,
  hardPowerByBranch = null,
  sphereData = { totalPopulation: 0, totalGdp: 0, countries: [] },
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
            <dd className="stat-value mt-0.5 text-2xl font-bold text-[var(--foreground)]">{formatPopulation(country.population)}</dd>
          </div>
          <div className="text-center">
            <dt className="text-sm font-semibold text-[var(--foreground-muted)]">
              <strong className="text-[var(--foreground)]">PIB</strong>
              {rankGdp > 0 && ` — ${rankEmoji(rankGdp) ? `${rankEmoji(rankGdp)} ` : ""}#${rankGdp}`}
            </dt>
            <dd className="stat-value mt-0.5 text-2xl font-bold text-[var(--foreground)]">{formatGdp(country.gdp)}</dd>
          </div>
          {influenceResult != null && (
            <div className="text-center">
              <dt className="text-sm font-semibold text-[var(--foreground-muted)]">
                <strong className="text-[var(--foreground)]">Influence</strong>
              </dt>
              <dd className="stat-value mt-0.5 text-2xl font-bold text-[var(--accent)]">{formatNumber(Math.round(influenceResult.influence))}</dd>
              <dl className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-[var(--foreground-muted)]">
                <span>PIB : {formatNumber(Math.round(influenceResult.componentsAfterGravity.gdp))}</span>
                <span>Population : {formatNumber(Math.round(influenceResult.componentsAfterGravity.population))}</span>
                <span>Stabilité : ×{Number(influenceResult.componentsAfterGravity.stabilityMultiplier).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span>Hard Power : {formatNumber(Math.round(influenceResult.componentsAfterGravity.military))}</span>
              </dl>
            </div>
          )}
        </div>
        {hardPowerByBranch != null && (
          <div className="mb-6 rounded border py-2 px-3 text-sm" style={{ borderColor: "var(--border-muted)", background: "var(--background-elevated)" }}>
            <span className="font-medium text-[var(--foreground-muted)]">Hard Power par branche : </span>
            <span className="text-[var(--foreground)]">
              Terrestre {formatNumber(hardPowerByBranch.terre)} · Aérien {formatNumber(hardPowerByBranch.air)} · Naval {formatNumber(hardPowerByBranch.mer)} · Stratégique {formatNumber(hardPowerByBranch.strategique)} — Total {formatNumber(hardPowerByBranch.total)}
            </span>
          </div>
        )}

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
                  <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Type d'effet</label>
                  <select
                    value={effectKind}
                    onChange={(e) => {
                      const k = e.target.value;
                      setEffectKind(k);
                      setEffectTarget(getDefaultTargetForKind(k, rosterUnitsFlat.map((u) => u.id)));
                    }}
                    className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {ALL_EFFECT_KIND_IDS.map((id) => (
                      <option key={id} value={id}>{EFFECT_KIND_LABELS[id] ?? id}</option>
                    ))}
                  </select>
                </div>
                {EFFECT_KINDS_WITH_STAT_TARGET.has(effectKind) && (
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
                {EFFECT_KINDS_WITH_BUDGET_TARGET.has(effectKind) && (
                  <div>
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
                  </div>
                )}
                {EFFECT_KINDS_WITH_BRANCH_TARGET.has(effectKind) && (
                  <div>
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
                  </div>
                )}
                {EFFECT_KINDS_WITH_ROSTER_UNIT_TARGET.has(effectKind) && (
                  <div>
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
                {effectKind === "budget_allocation_cap" && (
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Positif = excédent (plafond d'allocation augmenté, ex. +20 → 120 % max). Négatif = dette (plafond réduit, ex. -20 → 80 % max).
                  </p>
                )}
                <div>
                  <label className="mb-1 block text-sm text-[var(--foreground-muted)]">
                    {getEffectKindValueHelper(effectKind).valueLabel}
                    {effectKind === "budget_ministry_min_pct" ? " (dépense forcée, valeur positive uniquement)" : ""}
                  </label>
                  <input
                    type="number"
                    step={effectKind === "budget_allocation_cap" ? 1 : getEffectKindValueHelper(effectKind).valueStep}
                    min={effectKind === "budget_ministry_min_pct" ? 0 : undefined}
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
                      onChange={(e) => setEffectDurationKind(e.target.value as "days" | "updates" | "permanent")}
                      className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <option value="days">Jours</option>
                      <option value="updates">Mises à jour</option>
                      <option value="permanent">Permanent (n&apos;expire jamais)</option>
                    </select>
                  </div>
                  {effectDurationKind !== "permanent" && (
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
                  )}
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

      {(sphereData.countries.length > 0) && (
        <section className={panelClass} style={panelStyle}>
          <h3 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
            Sphère
          </h3>
          <div
            className="mb-6 rounded-lg border p-4"
            style={{ borderColor: "var(--border)", background: "var(--background-elevated)" }}
          >
            <span className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">
              Notre Sphère
            </span>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[var(--foreground)]">
              <span>
                <strong>Population :</strong> {formatNumber(sphereData.totalPopulation)}
              </span>
              <span>
                <strong>PIB :</strong> {formatGdp(sphereData.totalGdp)}
              </span>
            </div>
          </div>
          <ul className="space-y-3">
            {sphereData.countries.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border py-2 px-3"
                style={{ borderColor: "var(--border-muted)" }}
              >
                <Link
                  href={`/pays/${c.slug}`}
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  {c.name}
                </Link>
                <span className="text-sm text-[var(--foreground-muted)]">
                  Population : {formatNumber(c.population ?? 0)}
                </span>
                <span className="text-sm text-[var(--foreground-muted)]">
                  PIB : {formatGdp(c.gdp ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
