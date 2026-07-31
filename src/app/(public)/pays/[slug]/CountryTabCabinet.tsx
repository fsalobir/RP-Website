"use client";
import { formatGdp, formatPopulation } from "@/lib/format";
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
        {trend ? (
          <>
            {" "}(<TrendInline trend={trend} />)
            <span className="sr-only">
              {trend === "up" ? " en hausse" : trend === "down" ? " en baisse" : " stable"}
            </span>
          </>
        ) : null}
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
  const cabinetHighlights = cabinetBlocks
    .map((block) => ({
      ...block,
      paragraphs: block.paragraphs.filter(
        (paragraph) => !paragraph.text.toLocaleLowerCase("fr").startsWith("les dotations sont au-delà du minimum requis"),
      ),
    }))
    .filter((block) => block.paragraphs.length > 0);

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

  const glassPanelClass = "rounded-2xl border border-white/15 bg-[#091118]/90 shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-md";
  const glassMutedClass = "text-white/70";
  const glassBorderClass = "border-white/10";

  /* Image en fond de toute la box bleue (visible partout, y compris à droite du rapport) */
  const boxStyle = { ...panelStyle, background: "transparent" };

  return (
    <div className="space-y-6">
      <section className={`relative w-full overflow-hidden rounded-2xl ${panelClass}`} style={boxStyle}>
        {/* Fond : image pleine largeur et hauteur (cover, ancrée en haut) + overlay */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-no-repeat"
            style={{
              backgroundImage: "url(/images/site/rapport-cabinet-bg.webp)",
              backgroundPosition: "top center",
            }}
          />
          <div className="absolute inset-0 bg-[var(--background-panel)]/85" />
        </div>

        <div className="relative z-10 p-4 sm:p-6">
          {!breakdown || !expected ? (
            <p className={`text-sm ${glassMutedClass}`}>
              Les données nécessaires au rapport (moyennes monde, paramètres) ne sont pas encore disponibles.
            </p>
          ) : cabinetBlocks.length === 0 ? (
            <p className={`text-sm ${glassMutedClass}`}>
              Aucun rapport ministériel à afficher pour cette période.
            </p>
          ) : (
            <div className="mx-auto w-full max-w-5xl rounded-2xl">
              <article className={`${glassPanelClass} px-4 py-4 sm:px-6 sm:py-5`}>
                <header className={`mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3 ${glassBorderClass}`}>
                  <h2 className="text-lg font-semibold text-white sm:text-xl">Rapport du Cabinet</h2>
                  <span className={glassMutedClass}>{reportTitleDate}</span>
                </header>

              {summaryTrends && (
                <div className="mb-5">
                  <div className="grid w-full grid-cols-3 gap-2 text-center">
                    <div className={`border-r pr-2 ${glassBorderClass}`}>
                      <SummaryMetric label="PIB" value={formatGdp(snapshot.gdp)} trend={summaryTrends.gdp} valueClassName="text-base font-semibold text-white" labelClassName={glassMutedClass} />
                    </div>
                    <div className={`border-r px-2 ${glassBorderClass}`}>
                      <SummaryMetric label="Population" value={formatPopulation(snapshot.population)} trend={summaryTrends.population} valueClassName="text-base font-semibold text-white" labelClassName={glassMutedClass} />
                    </div>
                    <div className="pl-2">
                      <SummaryMetric
                        label="Influence"
                        value={formatSummaryStat(influenceValue)}
                        trend={summaryTrends.influence}
                        valueClassName="text-base font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                  </div>
                  <div className={`mt-4 grid w-full grid-cols-2 gap-2 border-t pt-4 text-center text-sm sm:grid-cols-4 ${glassBorderClass}`}>
                    <div>
                      <SummaryMetric
                        label="Militarisme"
                        value={formatSummaryStat(snapshot.militarism)}
                        trend={summaryTrends.militarism}
                        valueClassName="text-sm font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                    <div>
                      <SummaryMetric
                        label="Science"
                        value={formatSummaryStat(snapshot.science)}
                        trend={summaryTrends.science}
                        valueClassName="text-sm font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                    <div>
                      <SummaryMetric
                        label="Industrie"
                        value={formatSummaryStat(snapshot.industry)}
                        trend={summaryTrends.industry}
                        valueClassName="text-sm font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                    <div>
                      <SummaryMetric
                        label="Stabilité"
                        value={formatSummaryStat(snapshot.stability)}
                        trend={summaryTrends.stability}
                        valueClassName="text-sm font-semibold text-white"
                        labelClassName={glassMutedClass}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className={`divide-y border-y ${glassBorderClass}`}>
                {cabinetHighlights.map((block) => (
                  <section key={block.ministryKey} className="grid gap-2 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
                    <h3 className="text-sm font-semibold text-white">
                      {block.ministryLabel}
                    </h3>
                    <ul className="space-y-1.5 text-sm leading-5">
                      {block.paragraphs.map((p, i) => (
                        <li
                          key={i}
                          className={`flex gap-2 first-letter:capitalize ${
                            p.tone === "positive"
                              ? "text-emerald-300"
                              : p.tone === "negative"
                                ? "text-red-300"
                                : "text-amber-200"
                          }`}
                        >
                          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                          <span>{p.text}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {cabinetHighlights.length === 0 ? (
                  <p className={`py-4 text-sm ${glassMutedClass}`}>Aucun changement notable sur la période.</p>
                ) : null}
              </div>
            </article>
            </div>
          )}

        {lastUpdateLog && (
            <section className={`mt-6 p-4 ${glassPanelClass}`}>
              <h3 className={`mb-2 text-sm font-semibold uppercase ${glassMutedClass}`}>
                Dernière évolution enregistrée
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
