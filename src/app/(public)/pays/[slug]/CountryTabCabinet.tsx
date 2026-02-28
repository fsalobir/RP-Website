"use client";

import { formatNumber, formatGdp } from "@/lib/format";
import { formatWorldDate } from "@/lib/worldDate";
import { getCabinetPhrases } from "@/lib/cabinetReport";
import type { TickBreakdown } from "@/lib/tickBreakdown";
import type { ExpectedNextTickResult } from "@/lib/expectedNextTick";
import type { Country } from "@/types/database";
import type { CountryUpdateLog } from "@/types/database";

type CountryTabCabinetProps = {
  breakdown: TickBreakdown | null;
  expected: ExpectedNextTickResult | null;
  country: Country;
  worldDate: { month: number; year: number } | null;
  worldAverages: { pop_avg: number; gdp_avg: number; mil_avg: number; ind_avg: number; sci_avg: number; stab_avg: number } | null;
  lastUpdateLog: CountryUpdateLog | null;
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

export function CountryTabCabinet({
  breakdown,
  expected,
  country,
  worldDate,
  worldAverages,
  lastUpdateLog,
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
      ? getCabinetPhrases(breakdown, expected, snapshot, worldAverages, seedFromCountryAndDate(c.id, worldDate))
      : [];

  const reportTitleDate = worldDate ? formatWorldDate(worldDate) : "—";

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
                  <p className="mt-2 text-center text-sm italic text-[var(--foreground-muted)]">
                    Synthèse des rapports ministériels — date d’avant la mise à jour
                  </p>
                </header>
                <div className="space-y-6 text-[15px] leading-relaxed text-[var(--foreground)]">
                  {cabinetBlocks.map((block) => (
                    <section key={block.ministryKey} className="space-y-2">
                      <h3 className="text-base font-semibold text-[var(--foreground)]" style={{ fontFamily: "inherit" }}>
                        {block.ministryLabel}
                      </h3>
                      <div className="space-y-2 pl-0 text-[var(--foreground-muted)]" style={{ textAlign: "justify" }}>
                        {block.paragraphs.map((p, i) => (
                          <p key={i} className="indent-0 first-letter:capitalize">
                            {p}
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
                <span>{formatNumber(Number(lastUpdateLog.population_before ?? 0))}</span>
                <span className="mx-1 text-[var(--foreground-muted)]">→</span>
                <span>{formatNumber(Number(lastUpdateLog.population_after ?? 0))}</span>
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
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
