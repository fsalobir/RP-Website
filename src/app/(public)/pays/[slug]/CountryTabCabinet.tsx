"use client";
import { formatNumber, formatGdp, formatPopulation } from "@/lib/format";
import { formatWorldDate } from "@/lib/worldDate";
import { getCabinetPhrases } from "@/lib/cabinetReport";
import type { TickBreakdown } from "@/lib/tickBreakdown";
import type { ExpectedNextTickResult } from "@/lib/expectedNextTick";
import type { Country } from "@/types/database";
import type { CountryUpdateLog } from "@/types/database";

type Trend = "up" | "down" | "stable";

type CountryTabCabinetProps = {
  breakdown: TickBreakdown | null;
  expected: ExpectedNextTickResult | null;
  country: Country;
  worldDate: { month: number; year: number } | null;
  worldAverages: { pop_avg: number; gdp_avg: number; mil_avg: number; ind_avg: number; sci_avg: number; stab_avg: number } | null;
  lastUpdateLog: CountryUpdateLog | null;
  fundingByMinistry?: Record<string, { pct: number; minPct: number }> | null;
  /** Influence actuelle (affichée dans le résumé ; pas de tendance calculée). */
  influenceValue?: number | null;
  previousInfluenceValue?: number | null;
  lastCronInfluenceAfterValue?: number | null;
  panelClass: string;
  panelStyle: React.CSSProperties;
};

function seedFromCountryAndDate(countryId: string, worldDate: { month: number; year: number } | null): number {
  const s = `${countryId}-${worldDate?.month ?? 0}-${worldDate?.year ?? 0}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

const TREND_STABLE_REL = 0.001;
const TREND_STABLE_ABS = 0.01;

function getTrend(current: number, next: number, isRate = false): Trend {
  if (isRate) {
    const rel = current !== 0 ? Math.abs((next - current) / current) : 0;
    return rel < TREND_STABLE_REL ? "stable" : next > current ? "up" : "down";
  }
  const currentCents = Math.round(current * 100);
  const nextCents = Math.round(next * 100);
  return Math.abs(nextCents - currentCents) < Math.round(TREND_STABLE_ABS * 100)
    ? "stable"
    : nextCents > currentCents
      ? "up"
      : "down";
}

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === "up") {
    return <span className="ml-1 inline-block text-emerald-500 dark:text-emerald-400" aria-hidden>▲</span>;
  }
  if (trend === "down") {
    return <span className="ml-1 inline-block text-red-500 dark:text-red-400" aria-hidden>▼</span>;
  }
  return <span className="ml-1 inline-block text-[var(--foreground-muted)]" aria-hidden>−</span>;
}

function TrendInline({ trend }: { trend: Trend }) {
  if (trend === "up") {
    return <span className="text-emerald-500 dark:text-emerald-400" aria-hidden>▲</span>;
  }
  if (trend === "down") {
    return <span className="text-red-500 dark:text-red-400" aria-hidden>▼</span>;
  }
  return <span className="text-[var(--foreground-muted)]" aria-hidden>−</span>;
}

function formatSummaryStat(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function SummaryMetric({
  label,
  value,
  trend,
  valueClassName = "text-base font-semibold text-[var(--foreground)]",
  labelClassName = "text-lg font-medium text-[var(--foreground-muted)]",
}: {
  label: string;
  value: string;
  trend?: Trend | null;
  valueClassName?: string;
  labelClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <span className={labelClassName}>{label}</span>
      <span className={valueClassName}>
        {value}
        {trend ? <> (<TrendInline trend={trend} />)</> : null}
      </span>
    </div>
  );
}

function getTrendFromLog(before: number | null | undefined, after: number | null | undefined, isRate = false): Trend | null {
  if (before == null || after == null) return null;
  return getTrend(Number(before), Number(after), isRate);
}

export function CountryTabCabinet({
  breakdown,
  expected,
  country,
  worldDate,
  worldAverages,
  lastUpdateLog,
  fundingByMinistry = null,
  influenceValue = null,
  previousInfluenceValue = null,
  lastCronInfluenceAfterValue = null,
  panelClass,
  panelStyle,
}: CountryTabCabinetProps) {
  const c = country;
  const snapshot = {
    population: Number(c.population ?? 0),
    gdp: Number(c.gdp ?? 0),
    militarism: Number(c.militarism ?? 0),
    industry: Number(c.industry ?? 0),
    science: Number(c.science ?? 0),
    stability: Number(c.stability ?? 0),
  };
  const cabinetBlocks =
    breakdown && expected && worldAverages
      ? getCabinetPhrases(
          breakdown,
          expected,
          snapshot,
          worldAverages,
          seedFromCountryAndDate(c.id, worldDate),
          fundingByMinistry ?? undefined
        )
      : [];

  const reportTitleDate = worldDate ? formatWorldDate(worldDate) : "—";

  const summaryTrends =
    expected && breakdown
      ? {
          gdp: getTrendFromLog(lastUpdateLog?.gdp_before, lastUpdateLog?.gdp_after, true) ?? getTrend(snapshot.gdp, expected.gdp, true),
          population:
            getTrendFromLog(lastUpdateLog?.population_before, lastUpdateLog?.population_after, true) ??
            getTrend(snapshot.population, expected.population, true),
          influence:
            previousInfluenceValue != null && influenceValue != null
              ? getTrend(previousInfluenceValue, influenceValue, true)
              : null,
          militarism:
            getTrendFromLog(lastUpdateLog?.militarism_before, lastUpdateLog?.militarism_after) ??
            getTrend(snapshot.militarism, expected.militarism),
          science:
            getTrendFromLog(lastUpdateLog?.science_before, lastUpdateLog?.science_after) ??
            getTrend(snapshot.science, expected.science),
          industry:
            getTrendFromLog(lastUpdateLog?.industry_before, lastUpdateLog?.industry_after) ??
            getTrend(snapshot.industry, expected.industry),
          stability:
            getTrendFromLog(lastUpdateLog?.stability_before, lastUpdateLog?.stability_after) ??
            getTrend(snapshot.stability, expected.stability),
        }
      : null;

  const glassPanelClass = "rounded-2xl border border-white/25 bg-white/15 shadow-xl backdrop-blur-xl";
  const glassMutedClass = "text-white/85";
  const glassBorderClass = "border-white/20";

  /* Image en fond de toute la box bleue (visible partout, y compris à droite du rapport) */
  const boxStyle = { ...panelStyle, background: "transparent" };

  return (
    <div className="space-y-6">
      <section className={`relative w-full overflow-hidden rounded-2xl ${panelClass}`} style={boxStyle}>
        {/* Fond : image pleine largeur et hauteur (cover, ancrée en haut) + overlay */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-no-repeat scale-105"
            style={{
              backgroundImage: "url(/images/site/rapport-cabinet-bg.png)",
              backgroundPosition: "top center",
              filter: "blur(0.5px)",
            }}
          />
          <div className="absolute inset-0 bg-[var(--background-panel)]/85" />
        </div>

        <div className="relative z-10 p-6">
          {!breakdown || !expected ? (
            <p className={`text-sm ${glassMutedClass}`}>
              Les données nécessaires au rapport (moyennes monde, paramètres) ne sont pas encore disponibles.
            </p>
          ) : cabinetBlocks.length === 0 ? (
            <p className={`text-sm ${glassMutedClass}`}>
              Aucun rapport ministériel à afficher pour cette période.
            </p>
          ) : (
            /* Box du rapport : centrée, taille naturelle (pas de scroll) */
            <div className="max-w-3xl mx-auto w-full rounded-2xl">
              <article className={`${glassPanelClass} px-6 py-6`} style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
                <header className={`mb-8 border-b pb-4 ${glassBorderClass}`}>
                <h2 className="text-center text-xl font-semibold tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  Rapport ministériel pour {reportTitleDate}
                </h2>
              </header>

              {summaryTrends && (
                <div className="mb-6 flex flex-col items-center">
                  <div className="mb-5 grid w-full max-w-2xl grid-cols-1 gap-5 text-center sm:grid-cols-3">
                    <div className={`sm:border-r sm:pr-6 ${glassBorderClass}`}>
                      <SummaryMetric label="PIB" value={formatGdp(snapshot.gdp)} trend={summaryTrends.gdp} valueClassName="text-base font-semibold text-white" labelClassName={glassMutedClass} />
                    </div>
                    <div className={`sm:border-r sm:pr-6 ${glassBorderClass}`}>
                      <SummaryMetric label="Population" value={formatPopulation(snapshot.population)} trend={summaryTrends.population} valueClassName="text-base font-semibold text-white" labelClassName={glassMutedClass} />
                    </div>
                    <div className="sm:pr-0">
                      <SummaryMetric
                        label="Influence"
                        value={formatSummaryStat(influenceValue)}
                        trend={summaryTrends.influence}
                        valueClassName="text-base font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                  </div>
                  <div className={`grid w-full max-w-2xl grid-cols-2 gap-4 text-center text-sm sm:grid-cols-4`}>
                    <div className={`sm:border-r sm:pr-6 ${glassBorderClass}`}>
                      <SummaryMetric
                        label="Militarisme"
                        value={formatSummaryStat(snapshot.militarism)}
                        trend={summaryTrends.militarism}
                        valueClassName="text-sm font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                    <div className={`sm:border-r sm:pr-6 ${glassBorderClass}`}>
                      <SummaryMetric
                        label="Science"
                        value={formatSummaryStat(snapshot.science)}
                        trend={summaryTrends.science}
                        valueClassName="text-sm font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                    <div className={`sm:border-r sm:pr-6 ${glassBorderClass}`}>
                      <SummaryMetric
                        label="Industrie"
                        value={formatSummaryStat(snapshot.industry)}
                        trend={summaryTrends.industry}
                        valueClassName="text-sm font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                    <div className="sm:pr-0">
                      <SummaryMetric
                        label="Stabilité"
                        value={formatSummaryStat(snapshot.stability)}
                        trend={summaryTrends.stability}
                        valueClassName="text-sm font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                  </div>
                  <div className={`mt-2 w-full border-b pb-6 ${glassBorderClass}`} role="separator" aria-hidden />
                </div>
              )}

              <div className="space-y-6 text-[15px] leading-relaxed">
                {cabinetBlocks.map((block) => (
                  <section key={block.ministryKey} className="space-y-2">
                    <h3 className="text-base font-semibold text-white" style={{ fontFamily: "inherit" }}>
                      {block.ministryLabel}
                    </h3>
                    <div className="space-y-2 pl-0" style={{ textAlign: "justify" }}>
                      {block.paragraphs.map((p, i) => (
                        <p
                          key={i}
                          className={`indent-0 first-letter:capitalize ${
                            p.tone === "positive"
                              ? "text-emerald-300"
                              : p.tone === "negative"
                                ? "text-red-300"
                                : "text-amber-200"
                          }`}
                        >
                          {p.text}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
            </div>
          )}

        {lastUpdateLog && (
            <section className={`mt-6 p-4 ${glassPanelClass}`}>
              <h3 className={`mb-2 text-sm font-semibold uppercase ${glassMutedClass}`}>
                Dernier passage du cron
              </h3>
              <p className={`mb-3 text-xs ${glassMutedClass}`}>
                {new Date(lastUpdateLog.run_at).toLocaleString("fr-FR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 text-white/90">
                <div>
                  <span className={glassMutedClass}>Population : </span>
                  <span>{formatPopulation(Number(lastUpdateLog.population_before ?? 0))}</span>
                  <span className={`mx-1 ${glassMutedClass}`}>→</span>
                  <span>{formatPopulation(Number(lastUpdateLog.population_after ?? 0))}</span>
                </div>
                <div>
                  <span className={glassMutedClass}>PIB : </span>
                  <span>{formatGdp(Number(lastUpdateLog.gdp_before ?? 0))}</span>
                  <span className={`mx-1 ${glassMutedClass}`}>→</span>
                  <span>{formatGdp(Number(lastUpdateLog.gdp_after ?? 0))}</span>
                </div>
                <div>
                  <span className={glassMutedClass}>Militarisme : </span>
                  <span>{lastUpdateLog.militarism_before ?? "—"}</span>
                  <span className={`mx-1 ${glassMutedClass}`}>→</span>
                  <span>{lastUpdateLog.militarism_after ?? "—"}</span>
                </div>
                <div>
                  <span className={glassMutedClass}>Industrie : </span>
                  <span>{lastUpdateLog.industry_before ?? "—"}</span>
                  <span className={`mx-1 ${glassMutedClass}`}>→</span>
                  <span>{lastUpdateLog.industry_after ?? "—"}</span>
                </div>
                <div>
                  <span className={glassMutedClass}>Science : </span>
                  <span>{lastUpdateLog.science_before ?? "—"}</span>
                  <span className={`mx-1 ${glassMutedClass}`}>→</span>
                  <span>{lastUpdateLog.science_after ?? "—"}</span>
                </div>
                <div>
                  <span className={glassMutedClass}>Stabilité : </span>
                  <span>{lastUpdateLog.stability_before ?? "—"}</span>
                  <span className={`mx-1 ${glassMutedClass}`}>→</span>
                  <span>{lastUpdateLog.stability_after ?? "—"}</span>
                </div>
                {(previousInfluenceValue != null || lastCronInfluenceAfterValue != null) && (
                  <div>
                    <span className={glassMutedClass}>Influence : </span>
                    <span>{formatSummaryStat(previousInfluenceValue)}</span>
                    <span className={`mx-1 ${glassMutedClass}`}>→</span>
                    <span>{formatSummaryStat(lastCronInfluenceAfterValue ?? influenceValue)}</span>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
