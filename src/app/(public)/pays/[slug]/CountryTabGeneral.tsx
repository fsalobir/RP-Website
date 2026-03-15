"use client";

import { useState } from "react";
import Link from "next/link";
import type { Country } from "@/types/database";
import type { CountryEffect } from "@/types/database";
import { formatNumber, formatGdp, formatPopulation } from "@/lib/format";
import {
  getEffectDescription,
  isEffectDisplayPositive,
  formatDurationRemaining,
  getDefaultTargetForKind,
  getEffectKindOptionGroups,
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
  EFFECT_KINDS_WITH_COUNTRY_TARGET,
  DURATION_DAYS_MAX,
} from "@/lib/countryEffects";
import { IDEOLOGY_IDS, IDEOLOGY_LABELS, type IdeologyId } from "@/lib/ideology";

/** Palette étendue pour les camemberts de sphère (pays maître + nombreux pays contrôlés). */
const SPHERE_PIE_COLORS = [
  "var(--accent)",
  "#0ea5e9",
  "#8b5cf6",
  "#e11d48",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
  "#14b8a6",
  "#a855f7",
  "#ef4444",
  "#eab308",
  "#22c55e",
  "#f43f5e",
  "#0d9488",
  "#c026d3",
  "#dc2626",
  "#ca8a04",
  "#16a34a",
  "#be185d",
  "#0891b2",
  "#7c3aed",
  "#b91c1c",
  "#a16207",
  "#15803d",
  "#9d174d",
  "#0e7490",
  "#6d28d9",
  "#991b1b",
  "#854d0e",
  "#166534",
  "#831843",
  "#155e75",
  "#5b21b6",
  "#7f1d1d",
  "#713f12",
  "#14532d",
  "#701a75",
  "#164e63",
];

function slicePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

function SpherePieChart({
  slices,
  total,
  title,
  size = 180,
  showLegend = false,
  formatValue,
  glassContext = false,
}: {
  slices: Array<{ name: string; flag_url: string | null; slug: string; value: number; colorIndex: number }>;
  total: number;
  title: string;
  size?: number;
  showLegend?: boolean;
  /** Pour l'infobulle au survol (part % et valeur formatée). */
  formatValue?: (v: number) => string;
  /** Si true, titres et texte en style glass (blanc / blanc 90%). */
  glassContext?: boolean;
}) {
  const [hoverTooltip, setHoverTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  let angle = -Math.PI / 2;
  return (
    <div className="relative flex flex-col items-center gap-2">
      <span className={`text-sm font-semibold ${glassContext ? "text-white/90" : "text-[var(--foreground-muted)]"}`}>{title}</span>
      <svg
        width={size}
        height={size}
        className="shrink-0 cursor-pointer"
        style={{ transform: "rotate(0deg)" }}
        aria-label={title}
        onMouseLeave={() => setHoverTooltip(null)}
      >
        {slices.filter((s) => s.value > 0).map((s) => {
          const startAngle = angle;
          const sweep = total > 0 ? (s.value / total) * 2 * Math.PI : 0;
          angle += sweep;
          const share = total > 0 ? (s.value / total) * 100 : 0;
          const tooltipText = formatValue
            ? `${s.name}: ${share.toFixed(1)} % · ${formatValue(s.value)}`
            : `${s.name}: ${share.toFixed(1)} %`;
          return (
            <path
              key={`${s.slug}-${s.colorIndex}`}
              d={slicePath(cx, cy, r, startAngle, startAngle + sweep)}
              fill={SPHERE_PIE_COLORS[s.colorIndex % SPHERE_PIE_COLORS.length]}
              stroke="var(--background-panel)"
              strokeWidth={1.5}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => setHoverTooltip({ text: tooltipText, x: e.clientX, y: e.clientY })}
            />
          );
        })}
      </svg>
      {hoverTooltip && (
        <div
          className="pointer-events-none fixed z-[100] rounded border px-2 py-1 text-xs shadow-lg"
          style={{
            left: hoverTooltip.x + 10,
            top: hoverTooltip.y + 10,
            background: "var(--background-panel)",
            borderColor: "var(--border)",
            color: "var(--foreground)",
          }}
        >
          {hoverTooltip.text}
        </div>
      )}
      {showLegend && (
        <ul className="w-full space-y-1 text-xs">
          {slices.map((s) => (
            <li key={`${s.slug}-${s.colorIndex}`} className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: SPHERE_PIE_COLORS[s.colorIndex % SPHERE_PIE_COLORS.length] }}
              />
              {s.flag_url ? (
                <Link href={`/pays/${s.slug}`} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.flag_url} alt="" width={16} height={11} className="inline-block h-[11px] w-4 rounded object-cover align-middle" />
                </Link>
              ) : null}
              <Link href={`/pays/${s.slug}`} className="truncate text-[var(--foreground-muted)] hover:text-[var(--accent)] hover:underline">
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CountryTabGeneralProps = {
  country: Country;
  rankPopulation: number;
  rankGdp: number;
  rankEmoji: (r: number) => string | null;
  panelClass: string;
  panelStyle: React.CSSProperties;
  canEditCountry: boolean;
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
  /** Influence totale affichée (propre + sphère). Si fourni, remplace influenceResult.influence pour le chiffre principal. */
  displayInfluence?: number | null;
  hardPowerByBranch?: import("@/lib/hardPower").HardPowerByBranch | null;
  sphereData?: {
    totalPopulation: number;
    totalGdp: number;
    masterInfluence: number;
    totalInfluence: number;
    countries: Array<{
      id: string;
      name: string;
      slug: string;
      flag_url: string | null;
      population: number | null;
      gdp: number | null;
      share_pct: number;
      is_annexed: boolean;
      controlStatus: "Contesté" | "Occupé" | "Annexé";
      influenceGiven: number;
      contributionPopulation: number;
      contributionGdp: number;
    }>;
  };
  ideologySummary?: {
    scores: Record<IdeologyId, number>;
    drift: Record<IdeologyId, number>;
    dominant: IdeologyId;
    centerDistance: number;
    breakdown: {
      neighbors: Record<IdeologyId, number>;
      effects: Record<IdeologyId, number>;
      neighborContributors: Array<{
        countryId: string;
        name: string;
        slug: string;
        flag_url: string | null;
        ideology: IdeologyId;
        value: number;
        weight: number;
      }>;
    };
  } | null;
  otherCountriesForRelation?: Array<{ id: string; name: string }>;
  /** Effets résolus (toutes sources, dont avantages) pour afficher la section « Effets des avantages actifs ». */
  resolvedEffects?: import("@/lib/countryEffects").ResolvedEffect[];
};

export function CountryTabGeneral({
  country,
  rankPopulation,
  rankGdp,
  rankEmoji,
  panelClass,
  panelStyle,
  canEditCountry,
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
  displayInfluence = null,
  hardPowerByBranch = null,
  sphereData = { totalPopulation: 0, totalGdp: 0, masterInfluence: 0, totalInfluence: 0, countries: [] },
  ideologySummary = null,
  otherCountriesForRelation = [],
  resolvedEffects = [],
}: CountryTabGeneralProps) {
  const strongestNeighborInfluence = Math.max(
    0,
    ...ideologySummary?.breakdown.neighborContributors.map((neighbor) => neighbor.value) ?? [0]
  );
  const strongestNeighborDirection =
    ideologySummary != null
      ? ((): string | null => {
          const entries = Object.entries(ideologySummary.breakdown.neighbors) as [IdeologyId, number][];
          const top = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0];
          return top != null ? IDEOLOGY_LABELS[top] : null;
        })()
      : null;
  const strongestEffectDirection =
    ideologySummary != null && Math.max(...Object.values(ideologySummary.breakdown.effects)) > 0
      ? ((): string | null => {
          const entries = Object.entries(ideologySummary.breakdown.effects) as [IdeologyId, number][];
          const top = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0];
          return top != null ? IDEOLOGY_LABELS[top] : null;
        })()
      : null;
  const getCountryName = (id: string) =>
    (id === country.id ? country.name : otherCountriesForRelation.find((c) => c.id === id)?.name) ?? null;
  const effectKindGroups = getEffectKindOptionGroups();

  function getInfluenceIntensity(value: number, maxValue: number): string {
    if (maxValue <= 0) return "légère";
    const ratio = value / maxValue;
    if (ratio >= 0.85) return "majeure";
    if (ratio >= 0.6) return "forte";
    if (ratio >= 0.35) return "modérée";
    return "légère";
  }

  const glassMutedClass = "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]";
  const glassBorderClass = "border-white/25";
  const glassTextClass = "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]";

  return (
    <div className="space-y-8">
      {/* Premier bloc : population / PIB / influence / idéologie / effets — fond image + glass */}
      <section className={`relative overflow-hidden rounded-2xl ${panelClass}`} style={{ ...panelStyle, background: "transparent" }}>
        <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-no-repeat scale-105"
            style={{
              backgroundImage: "url(/images/site/generalites-bg.png)",
              backgroundPosition: "top center",
              filter: "blur(0.5px)",
            }}
          />
          <div className="absolute inset-0 bg-[var(--background-panel)]/75" />
        </div>
        <div className="relative z-10">
        <div className="mb-8 flex flex-wrap justify-center gap-x-12 gap-y-4">
          <div className="text-center">
            <dt className={`text-sm font-semibold ${glassMutedClass}`}>
              <strong className={glassTextClass}>Population</strong>
              {rankPopulation > 0 && ` — ${rankEmoji(rankPopulation) ? `${rankEmoji(rankPopulation)} ` : ""}#${rankPopulation}`}
            </dt>
            <dd className={`stat-value mt-0.5 text-2xl font-bold ${glassTextClass}`}>{formatPopulation(country.population)}</dd>
          </div>
          <div className="text-center">
            <dt className={`text-sm font-semibold ${glassMutedClass}`}>
              <strong className={glassTextClass}>PIB</strong>
              {rankGdp > 0 && ` — ${rankEmoji(rankGdp) ? `${rankEmoji(rankGdp)} ` : ""}#${rankGdp}`}
            </dt>
            <dd className={`stat-value mt-0.5 text-2xl font-bold ${glassTextClass}`}>{formatGdp(country.gdp)}</dd>
          </div>
          {(influenceResult != null || displayInfluence != null) && (
            <div className="text-center">
              <dt className={`text-sm font-semibold ${glassMutedClass}`}>
                <strong className={glassTextClass}>Influence</strong>
              </dt>
              <dd className={`stat-value mt-0.5 text-2xl font-bold ${glassTextClass}`}>{formatNumber(Math.round(displayInfluence ?? influenceResult?.influence ?? 0))}</dd>
              {influenceResult != null && (
                <dl className={`mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs ${glassMutedClass}`}>
                  <span>PIB : {formatNumber(Math.round(influenceResult.componentsAfterGravity.gdp))}</span>
                  <span>Population : {formatNumber(Math.round(influenceResult.componentsAfterGravity.population))}</span>
                  <span>Stabilité : ×{Number(influenceResult.componentsAfterGravity.stabilityMultiplier).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span>Hard Power : {formatNumber(Math.round(influenceResult.componentsAfterGravity.military))}</span>
                </dl>
              )}
            </div>
          )}
        </div>
        {hardPowerByBranch != null && (
          <div className={`mb-6 rounded-xl border py-2 px-3 text-sm ${glassBorderClass}`} style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
            <span className={`font-medium ${glassMutedClass}`}>Hard Power par branche : </span>
            <span className={glassTextClass}>
              Terrestre {formatNumber(hardPowerByBranch.terre)} · Aérien {formatNumber(hardPowerByBranch.air)} · Naval {formatNumber(hardPowerByBranch.mer)} · Stratégique {formatNumber(hardPowerByBranch.strategique)} — Total {formatNumber(hardPowerByBranch.total)}
            </span>
          </div>
        )}
        {ideologySummary && (
          <div className={`mb-6 rounded-xl border p-4 text-sm ${glassBorderClass}`} style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <span className={`font-medium ${glassTextClass}`}>
                Idéologie dominante : {IDEOLOGY_LABELS[ideologySummary.dominant]}
              </span>
              <span className={glassMutedClass}>
                Distance au centre : {Math.round(ideologySummary.centerDistance * 100)} %
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {IDEOLOGY_IDS.map((id) => (
                <div key={id} className={`rounded border px-3 py-2 ${glassBorderClass}`} style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className={`text-xs ${glassMutedClass}`}>{IDEOLOGY_LABELS[id]}</div>
                  <div className={`font-mono ${glassTextClass}`}>{Number(ideologySummary.scores[id] ?? 0).toFixed(1)}</div>
                </div>
              ))}
            </div>
            <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs ${glassMutedClass}`}>
              {IDEOLOGY_IDS.map((id) => (
                <span key={id}>Drift {IDEOLOGY_LABELS[id]} : {Number(ideologySummary.drift[id] ?? 0).toFixed(2)}</span>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <div className={`rounded border px-3 py-3 ${glassBorderClass}`} style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className={`text-xs font-semibold uppercase tracking-wide ${glassMutedClass}`}>
                  Influences voisines
                </div>
                {ideologySummary.breakdown.neighborContributors.length > 0 ? (
                  <>
                    <div className="mt-2 space-y-2">
                      {ideologySummary.breakdown.neighborContributors.map((neighbor) => (
                        <div
                          key={neighbor.countryId}
                          className={`flex items-center justify-between gap-3 rounded border px-2 py-2 ${glassBorderClass}`}
                          style={{ background: "rgba(255,255,255,0.06)" }}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {neighbor.flag_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={neighbor.flag_url}
                                alt={neighbor.name}
                                width={24}
                                height={16}
                                className="h-4 w-6 rounded object-cover"
                              />
                            ) : (
                              <div className={`h-4 w-6 rounded border ${glassBorderClass}`} />
                            )}
                            <Link href={`/pays/${neighbor.slug}`} className="truncate text-[var(--accent)] hover:underline">
                              {neighbor.name}
                            </Link>
                          </div>
                          <div className={`text-right text-xs ${glassMutedClass}`}>
                            <div className={glassTextClass}>
                              Influence {getInfluenceIntensity(neighbor.value, strongestNeighborInfluence)} vers le {IDEOLOGY_LABELS[neighbor.ideology]}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className={`mt-2 text-xs ${glassMutedClass}`}>
                      {strongestNeighborDirection
                        ? `Dans l’ensemble, nos voisins nous poussent surtout vers le ${strongestNeighborDirection}.`
                        : "Nos voisins n’exercent pas de direction idéologique nette."}
                    </div>
                  </>
                ) : (
                  <div className={`mt-2 text-xs ${glassMutedClass}`}>Aucune influence voisine détectée.</div>
                )}
              </div>

              {resolvedEffects.filter((e) => e.source === "ideology").length > 0 && (() => {
                const ideologyResolved = resolvedEffects.filter((e) => e.source === "ideology");
                const bySource = ideologyResolved.reduce<Record<string, typeof ideologyResolved>>((acc, e) => {
                  const label = e.sourceLabel ?? "Idéologie";
                  if (!acc[label]) acc[label] = [];
                  acc[label].push(e);
                  return acc;
                }, {});
                return (
                  <div className={`rounded border px-3 py-3 ${glassBorderClass}`} style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className={`text-xs font-semibold uppercase tracking-wide ${glassMutedClass}`}>
                      Effets par idéologie
                    </div>
                    <div className="mt-2 space-y-2">
                      {Object.entries(bySource).map(([sourceLabel, list]) => (
                        <div
                          key={sourceLabel}
                          className={`rounded border px-2 py-2 ${glassBorderClass}`}
                          style={{ background: "rgba(255,255,255,0.06)" }}
                        >
                          <span className={`text-xs font-medium ${glassMutedClass}`}>Idéologie : {sourceLabel}</span>
                          <div className="mt-1.5 space-y-1">
                            {list.map((e, i) => (
                              <p
                                key={i}
                                className={`text-xs font-semibold ${isEffectDisplayPositive(e) ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}
                              >
                                {getEffectDescription(e, {
                                  rosterUnitName: (id) => rosterUnitsFlat.find((u) => u.id === id)?.name_fr ?? null,
                                  countryName: getCountryName,
                                })}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        <hr className={`my-8 border-0 border-t ${glassBorderClass}`} />
        <div className={`rounded-xl border p-4 ${glassBorderClass}`} style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
          <h4 className={`mb-3 text-sm font-semibold ${glassTextClass}`}>Effets et avantages actifs</h4>
          {effects.length === 0 && resolvedEffects.filter((e) => e.source === "perk").length === 0 ? (
            <p className={glassMutedClass}>Aucun effet en cours.</p>
          ) : (
            <div className="space-y-4">
              {effects.length > 0 && (
                <ul className="space-y-3">
                  {effects.map((e) => (
                    <li
                      key={e.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded border py-2 px-3 ${glassBorderClass}`}
                      style={{ background: "rgba(255,255,255,0.08)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <span className={`font-medium ${glassTextClass}`}>{e.name}</span>
                        <p
                          className={`text-sm font-semibold ${isEffectDisplayPositive(e) ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}
                        >
                          {getEffectDescription(e, {
                            rosterUnitName: (id) => rosterUnitsFlat.find((u) => u.id === id)?.name_fr ?? null,
                            countryName: getCountryName,
                          })}
                        </p>
                        <p className={`text-xs ${glassMutedClass}`}>
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
              {resolvedEffects.filter((e) => e.source === "perk").length > 0 && (() => {
                const perkEffects = resolvedEffects.filter((e) => e.source === "perk");
                const bySource = perkEffects.reduce<Record<string, typeof perkEffects>>((acc, e) => {
                  const label = e.sourceLabel ?? "Avantage";
                  if (!acc[label]) acc[label] = [];
                  acc[label].push(e);
                  return acc;
                }, {});
                return (
                  <ul className={`space-y-3 ${effects.length > 0 ? "mt-2" : ""}`}>
                    {Object.entries(bySource).map(([sourceLabel, list]) => (
                      <li
                        key={sourceLabel}
                        className={`rounded border py-2 px-3 text-sm ${glassBorderClass}`}
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        <span className={glassMutedClass}>Avantage : {sourceLabel}</span>
                        <div className="mt-1.5 space-y-1">
                          {list.map((e, i) => (
                            <p
                              key={i}
                              className={`text-sm font-semibold ${isEffectDisplayPositive(e) ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}
                            >
                              {getEffectDescription(e, {
                                rosterUnitName: (id) => rosterUnitsFlat.find((u) => u.id === id)?.name_fr ?? null,
                                countryName: getCountryName,
                              })}
                            </p>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          )}
        </div>
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
                  <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Type d&apos;effet</label>
                  <select
                    value={effectKind}
                    onChange={(e) => {
                      const k = e.target.value;
                      setEffectKind(k);
                      setEffectTarget(getDefaultTargetForKind(k, rosterUnitsFlat.map((u) => u.id), otherCountriesForRelation.map((c) => c.id)));
                    }}
                    className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {effectKindGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </optgroup>
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
                {EFFECT_KINDS_WITH_COUNTRY_TARGET.has(effectKind) && (
                  <div>
                    <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Pays cible (relation bilatérale)</label>
                    <select
                      value={effectTarget ?? ""}
                      onChange={(e) => setEffectTarget(e.target.value || null)}
                      className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)] min-w-[12rem]"
                      style={{ borderColor: "var(--border)" }}
                      title="Pays cible de la relation bilatérale avec ce pays."
                    >
                      <option value="">— Choisir un pays —</option>
                      {otherCountriesForRelation.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {effectKind === "budget_allocation_cap" && (
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Positif = excédent (plafond d&apos;allocation augmenté, ex. +20 → 120 % max). Négatif = dette (plafond réduit, ex. -20 → 80 % max).
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
                      onChange={(e) => setEffectDurationKind(e.target.value as "days" | "permanent")}
                      className="rounded border bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <option value="days">Jours</option>
                      <option value="permanent">Permanent (n&apos;expire jamais)</option>
                    </select>
                  </div>
                  {effectDurationKind !== "permanent" && (
                  <div>
                    <label className="mb-1 block text-sm text-[var(--foreground-muted)]">Nombre (max {DURATION_DAYS_MAX} jours)</label>
                    <input
                      type="number"
                      min={1}
                      max={DURATION_DAYS_MAX}
                      value={effectDurationRemaining}
                      onChange={(e) => {
                        const v = e.target.value;
                        const n = Number(v);
                        if (v === "" || (!Number.isNaN(n) && n >= 1 && n <= DURATION_DAYS_MAX)) setEffectDurationRemaining(v);
                        else if (!Number.isNaN(n) && n > DURATION_DAYS_MAX) setEffectDurationRemaining(String(DURATION_DAYS_MAX));
                      }}
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
        </div>
      </section>

      <section className={`relative overflow-hidden rounded-2xl ${panelClass}`} style={{ ...panelStyle, background: "transparent" }}>
        <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-no-repeat scale-105"
            style={{
              backgroundImage: "url(/images/site/stats-bg.png)",
              backgroundPosition: "top center",
              filter: "blur(0.5px)",
            }}
          />
          <div className="absolute inset-0 bg-[var(--background-panel)]/75" />
        </div>
        <div className="relative z-10 p-6">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:gap-6 sm:justify-center">
            {[
              { key: "militarism" as const, label: "Militarisme", emoji: "🎖️", value: Number(country.militarism) },
              { key: "industry" as const, label: "Industrie", emoji: "🏭", value: Number(country.industry) },
              { key: "science" as const, label: "Science", emoji: "🔬", value: Number(country.science) },
            ].map(({ label, emoji, value }) => (
              <div
                key={label}
                className={`flex flex-col items-center gap-1 rounded-xl border px-6 py-4 min-w-[8rem] ${glassBorderClass}`}
                style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}
              >
                <span className={`text-center text-sm font-semibold ${glassMutedClass}`}>
                  {emoji} {label}
                </span>
                <span className={`text-2xl font-bold ${glassTextClass}`}>
                  {Number(value).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div
            className={`mt-10 max-w-4xl mx-auto rounded-xl border p-6 ${glassBorderClass}`}
            style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}
          >
            <div className="max-w-2xl mx-auto">
              <span className={`mb-2 block text-center text-sm font-semibold ${glassTextClass}`}>
                ⚖️ Stabilité
              </span>
              <div
                className="relative h-5 w-full rounded overflow-visible mt-4"
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
                  <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-bold shadow-sm border ${glassBorderClass}`} style={{ background: "rgba(255,255,255,0.25)" }}>
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
                    className={`absolute top-0 -translate-x-1/2 rounded px-1.5 py-0.5 text-center text-xs shadow-sm whitespace-nowrap border ${glassBorderClass}`}
                    style={{
                      left: `${((n + 3) / 6) * 100}%`,
                      background: "rgba(255,255,255,0.2)",
                    }}
                  >
                    <span className={glassMutedClass}>{label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {(sphereData.totalPopulation > 0 || sphereData.totalGdp > 0 || sphereData.totalInfluence > 0) && (() => {
        const orderStatus: Record<"Annexé" | "Occupé" | "Contesté", number> = { Annexé: 0, Occupé: 1, Contesté: 2 };
        const sortedCountries = [...sphereData.countries].sort((a, b) => {
          const diff = orderStatus[a.controlStatus] - orderStatus[b.controlStatus];
          return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
        });
        const canonicalOrder: Array<{ name: string; flag_url: string | null; slug: string; colorIndex: number }> = [
          { name: country.name, flag_url: country.flag_url ?? null, slug: country.slug, colorIndex: 0 },
          ...sortedCountries.map((c, i) => ({ name: c.name, flag_url: c.flag_url, slug: c.slug, colorIndex: i + 1 })),
        ];
        const slicesPop = canonicalOrder.map((item, i) => ({
          ...item,
          value: item.colorIndex === 0 ? Number(country.population ?? 0) : sortedCountries[i - 1]!.contributionPopulation,
        }));
        const slicesGdp = canonicalOrder.map((item, i) => ({
          ...item,
          value: item.colorIndex === 0 ? Number(country.gdp ?? 0) : sortedCountries[i - 1]!.contributionGdp,
        }));
        const slicesInfluence = canonicalOrder.map((item, i) => ({
          ...item,
          value: item.colorIndex === 0 ? sphereData.masterInfluence : sortedCountries[i - 1]!.influenceGiven,
        }));
        return (
          <section className={`relative overflow-hidden rounded-2xl ${panelClass}`} style={{ ...panelStyle, background: "transparent" }}>
            <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
              <div
                className="absolute inset-0 bg-cover bg-no-repeat scale-105"
                style={{
                  backgroundImage: "url(/images/site/sphere-bg.png)",
                  backgroundPosition: "top center",
                  filter: "blur(0.5px)",
                }}
              />
              <div className="absolute inset-0 bg-[var(--background-panel)]/75" />
            </div>
            <div className="relative z-10 p-6">
              <h3 className={`mb-4 text-lg font-semibold ${glassTextClass}`}>
                Sphère
              </h3>
              <div
                className={`mb-4 flex flex-wrap justify-center gap-10 rounded-xl border p-6 ${glassBorderClass}`}
                style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}
              >
                <SpherePieChart slices={slicesPop} total={sphereData.totalPopulation} title="Population" showLegend={false} formatValue={formatNumber} glassContext />
                <SpherePieChart slices={slicesGdp} total={sphereData.totalGdp} title="PIB" showLegend={false} formatValue={(v) => formatGdp(v)} glassContext />
                <SpherePieChart slices={slicesInfluence} total={sphereData.totalInfluence} title="Influence" showLegend={false} formatValue={formatNumber} glassContext />
              </div>
              <div className={`mb-6 rounded-xl border p-3 ${glassBorderClass}`} style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
                <p className={`mb-2 text-xs font-semibold ${glassMutedClass}`}>Légende</p>
                <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  {canonicalOrder.map((item) => (
                    <li key={item.slug} className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: SPHERE_PIE_COLORS[item.colorIndex % SPHERE_PIE_COLORS.length] }}
                      />
                      {item.flag_url ? (
                        <Link href={`/pays/${item.slug}`} className="shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.flag_url} alt="" width={16} height={11} className="inline-block h-[11px] w-4 rounded object-cover align-middle" />
                        </Link>
                      ) : null}
                      <Link href={`/pays/${item.slug}`} className={`${glassMutedClass} hover:text-[var(--accent)] hover:underline`}>
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              {sphereData.countries.length > 0 && (
                <div className={`overflow-x-auto rounded-xl border ${glassBorderClass}`} style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead>
                      <tr className={`border-b ${glassBorderClass}`}>
                        <th className={`p-3 font-semibold ${glassMutedClass}`}>Pays</th>
                        <th className={`p-3 font-semibold ${glassMutedClass}`}>Niveau</th>
                        <th className={`p-3 font-semibold text-right ${glassMutedClass}`}>Population (part)</th>
                        <th className={`p-3 font-semibold text-right ${glassMutedClass}`}>PIB (part)</th>
                        <th className={`p-3 font-semibold text-right ${glassMutedClass}`}>Influence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCountries.map((c) => (
                        <tr key={c.id} className={`border-b last:border-b-0 ${glassBorderClass}`}>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {c.flag_url ? (
                                <Link href={`/pays/${c.slug}`} className="shrink-0">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={c.flag_url} alt="" width={24} height={16} className={`h-4 w-6 rounded object-cover border ${glassBorderClass}`} />
                                </Link>
                              ) : null}
                              <Link href={`/pays/${c.slug}`} className="font-medium text-[var(--accent)] hover:underline">
                                {c.name}
                              </Link>
                            </div>
                          </td>
                          <td className={`p-3 ${glassMutedClass}`}>
                            {c.controlStatus}
                            {c.controlStatus === "Contesté" && ` (${c.share_pct} %)`}
                            {c.controlStatus === "Occupé" && " (100 %)"}
                            {c.controlStatus === "Annexé" && " (100 %)"}
                          </td>
                          <td className={`p-3 text-right font-mono ${glassTextClass}`} title="Part comptée dans la sphère (proportionnelle au % de contrôle).">
                            {formatNumber(c.contributionPopulation)}
                          </td>
                          <td className={`p-3 text-right font-mono ${glassTextClass}`} title="Part comptée dans la sphère (proportionnelle au % de contrôle).">
                            {formatGdp(c.contributionGdp)}
                          </td>
                          <td className={`p-3 text-right font-mono ${glassTextClass}`} title="Influence apportée = influence du pays × % contrôle × multiplicateur règle (Contesté/Occupé/Annexé).">
                            {formatNumber(c.influenceGiven)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
