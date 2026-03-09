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
}: {
  label: string;
  value: string;
  trend?: Trend | null;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <span className="text-lg font-medium text-[var(--foreground-muted)]">{label}</span>
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

  return (
    <div className="space-y-6">
      <section className={panelClass} style={panelStyle}>
        {!breakdown || !expected ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            Les données nécessaires au rapport (moyennes monde, paramètres) ne sont pas encore disponibles.
          </p>
        ) : cabinetBlocks.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            Aucun rapport ministériel à afficher pour cette période.
          </p>
        ) : (
          <>
            <article
                className="mx-auto max-w-3xl rounded-md border-2 px-8 py-10 shadow-lg"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--background)",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.15), 0 2px 4px -2px rgba(0,0,0,0.1)",
                }}
              >
                <header className="mb-8 border-b pb-4" style={{ borderColor: "var(--border)" }}>
                  <h2 className="text-center text-xl font-semibold tracking-wide text-[var(--foreground)]">
                    Rapport Ministeriel pour {reportTitleDate}
                  </h2>
                </header>

                {summaryTrends && (
                  <div className="mb-6 flex flex-col items-center">
                    <div className="mb-5 grid w-full max-w-2xl grid-cols-1 gap-5 text-center sm:grid-cols-3">
                      <div className="sm:border-r sm:border-[var(--border)] sm:pr-6">
                        <SummaryMetric label="PIB" value={formatGdp(snapshot.gdp)} trend={summaryTrends.gdp} />
                      </div>
                      <div className="sm:border-r sm:border-[var(--border)] sm:pr-6">
                        <SummaryMetric label="Population" value={formatPopulation(snapshot.population)} trend={summaryTrends.population} />
                      </div>
                      <div className="sm:pr-0">
                        <SummaryMetric
                          label="Influence"
                          value={formatSummaryStat(influenceValue)}
                          trend={summaryTrends.influence}
                        />
                      </div>
                    </div>
                    <div className="grid w-full max-w-2xl grid-cols-2 gap-4 text-center text-sm sm:grid-cols-4">
                      <div className="sm:border-r sm:border-[var(--border)] sm:pr-6">
                        <SummaryMetric
                          label="Militarisme"
                          value={formatSummaryStat(snapshot.militarism)}
                          trend={summaryTrends.militarism}
                          valueClassName="text-sm font-semibold text-[var(--foreground)]"
                        />
                      </div>
                      <div className="sm:border-r sm:border-[var(--border)] sm:pr-6">
                        <SummaryMetric
                          label="Science"
                          value={formatSummaryStat(snapshot.science)}
                          trend={summaryTrends.science}
                          valueClassName="text-sm font-semibold text-[var(--foreground)]"
                        />
                      </div>
                      <div className="sm:border-r sm:border-[var(--border)] sm:pr-6">
                        <SummaryMetric
                          label="Industrie"
                          value={formatSummaryStat(snapshot.industry)}
                          trend={summaryTrends.industry}
                          valueClassName="text-sm font-semibold text-[var(--foreground)]"
                        />
                      </div>
                      <div className="sm:pr-0">
                        <SummaryMetric
                          label="Stabilité"
                          value={formatSummaryStat(snapshot.stability)}
                          trend={summaryTrends.stability}
                          valueClassName="text-sm font-semibold text-[var(--foreground)]"
                        />
                      </div>
                    </div>
                    <div
                      className="mt-2 w-full border-b pb-6"
                      style={{ borderColor: "var(--border)" }}
                      role="separator"
                      aria-hidden
                    />
                  </div>
                )}

                <div className="space-y-6 text-[15px] leading-relaxed text-[var(--foreground)]">
                  {cabinetBlocks.map((block) => (
                    <section key={block.ministryKey} className="space-y-2">
                      <h3 className="text-base font-semibold text-[var(--foreground)]" style={{ fontFamily: "inherit" }}>
                        {block.ministryLabel}
                      </h3>
                      <div className="space-y-2 pl-0" style={{ textAlign: "justify" }}>
                        {block.paragraphs.map((p, i) => (
                          <p
                            key={i}
                            className={`indent-0 first-letter:capitalize ${
                              p.tone === "positive"
                                ? "text-emerald-400 dark:text-emerald-300"
                                : p.tone === "negative"
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-yellow-500 dark:text-yellow-400"
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
          </>
        )}

        {lastUpdateLog && (
          <section className="mt-6 rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
            <h3 className="mb-2 text-sm font-semibold uppercase text-[var(--foreground-muted)]">
              Dernier passage du cron
            </h3>
            <p className="mb-3 text-xs text-[var(--foreground-muted)]">
              {new Date(lastUpdateLog.run_at).toLocaleString("fr-FR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <span className="text-[var(--foreground-muted)]">Population : </span>
                <span>{formatPopulation(Number(lastUpdateLog.population_before ?? 0))}</span>
                <span className="mx-1 text-[var(--foreground-muted)]">→</span>
                <span>{formatPopulation(Number(lastUpdateLog.population_after ?? 0))}</span>
              </div>
              <div>
                <span className="text-[var(--foreground-muted)]">PIB : </span>
                <span>{formatGdp(Number(lastUpdateLog.gdp_before ?? 0))}</span>
                <span className="mx-1 text-[var(--foreground-muted)]">→</span>
                <span>{formatGdp(Number(lastUpdateLog.gdp_after ?? 0))}</span>
              </div>
              <div>
                <span className="text-[var(--foreground-muted)]">Militarisme : </span>
                <span>{lastUpdateLog.militarism_before ?? "—"}</span>
                <span className="mx-1 text-[var(--foreground-muted)]">→</span>
                <span>{lastUpdateLog.militarism_after ?? "—"}</span>
              </div>
              <div>
                <span className="text-[var(--foreground-muted)]">Industrie : </span>
                <span>{lastUpdateLog.industry_before ?? "—"}</span>
                <span className="mx-1 text-[var(--foreground-muted)]">→</span>
                <span>{lastUpdateLog.industry_after ?? "—"}</span>
              </div>
              <div>
                <span className="text-[var(--foreground-muted)]">Science : </span>
                <span>{lastUpdateLog.science_before ?? "—"}</span>
                <span className="mx-1 text-[var(--foreground-muted)]">→</span>
                <span>{lastUpdateLog.science_after ?? "—"}</span>
              </div>
              <div>
                <span className="text-[var(--foreground-muted)]">Stabilité : </span>
                <span>{lastUpdateLog.stability_before ?? "—"}</span>
                <span className="mx-1 text-[var(--foreground-muted)]">→</span>
                <span>{lastUpdateLog.stability_after ?? "—"}</span>
              </div>
              {(previousInfluenceValue != null || lastCronInfluenceAfterValue != null) && (
                <div>
                  <span className="text-[var(--foreground-muted)]">Influence : </span>
                  <span>{formatSummaryStat(previousInfluenceValue)}</span>
                  <span className="mx-1 text-[var(--foreground-muted)]">→</span>
                  <span>{formatSummaryStat(lastCronInfluenceAfterValue ?? influenceValue)}</span>
                </div>
              )}
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
