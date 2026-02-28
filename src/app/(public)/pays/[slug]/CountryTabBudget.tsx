"use client";

import type { Country } from "@/types/database";
import type { CountryEffect } from "@/types/database";
import type { CountryUpdateLog } from "@/types/database";
import { formatNumber, formatGdp } from "@/lib/format";
import { Tooltip } from "@/components/ui/Tooltip";
import { getExpectedNextTick } from "@/lib/expectedNextTick";
import { getEffectDescription } from "@/lib/countryEffects";

type BudgetMinistry = {
  key: string;
  label: string;
  tooltip: string;
  group: number;
};

type CountryTabBudgetProps = {
  country: Country;
  panelClass: string;
  panelStyle: React.CSSProperties;
  budgetFraction: number;
  setBudgetFraction: (v: number) => void;
  pcts: Record<string, number>;
  setPcts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  totalPct: number;
  forcedMinPcts: Record<string, number>;
  allocationCap: number;
  totalBudgetMonthly: number;
  totalBudgetMonthlyBn: number;
  BUDGET_MINISTRIES: BudgetMinistry[];
  budgetError: string | null;
  budgetSaving: boolean;
  canEditCountry: boolean;
  isAdmin: boolean;
  budget: { id: string } | null;
  onSaveBudget: () => Promise<void>;
  effects: CountryEffect[];
  rosterUnitsFlat: { id: string; name_fr: string }[];
  updateLogs: CountryUpdateLog[];
  ruleParametersByKey: Record<string, { value: unknown }>;
  worldAverages: { pop_avg: number; gdp_avg: number; mil_avg: number; ind_avg: number; sci_avg: number; stab_avg: number } | null;
};

export function CountryTabBudget({
  country,
  panelClass,
  panelStyle,
  budgetFraction,
  setBudgetFraction,
  pcts,
  setPcts,
  totalPct,
  forcedMinPcts,
  allocationCap,
  totalBudgetMonthly,
  totalBudgetMonthlyBn,
  BUDGET_MINISTRIES,
  budgetError,
  budgetSaving,
  canEditCountry,
  isAdmin,
  budget,
  onSaveBudget,
  effects,
  rosterUnitsFlat,
  updateLogs,
  ruleParametersByKey,
  worldAverages,
}: CountryTabBudgetProps) {
  return (
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
            <span className="text-sm font-medium text-[var(--foreground)]">
              Fraction du PIB :
            </span>
            {canEditCountry ? (
              <>
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
              </>
            ) : (
              <span className="text-sm font-mono text-[var(--foreground)]">
                {Math.round(budgetFraction * 100)} %
              </span>
            )}
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
                      {canEditCountry ? (
                        <>
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
                        </>
                      ) : (
                        <span className="text-sm font-mono text-[var(--foreground-muted)]">
                          {value.toFixed(1)} %
                        </span>
                      )}
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
          {canEditCountry && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={budgetSaving || totalPct > allocationCap}
                onClick={onSaveBudget}
                className="rounded py-2 px-4 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#0f1419" }}
              >
                {budgetSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          )}
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

      {isAdmin && updateLogs.length > 0 && (
        <section className={panelClass} style={panelStyle}>
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground-muted)]">
            Debug — Dernières mises à jour cron
          </h2>
          <p className="mb-4 text-sm text-[var(--foreground-muted)]">
            Variables d'entrée et résultats avant/après pour chaque passage du cron.
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
  );
}
