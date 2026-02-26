"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/format";

type CountryForClassement = {
  id: string;
  name: string;
  slug: string;
  flag_url: string | null;
  population: number | null;
  gdp: number | null;
  militarism: number | null;
  industry: number | null;
  science: number | null;
  stability: number | null;
};

type PrevSnapshot = {
  population?: number | string | null;
  gdp?: number | string | null;
  militarism?: number | string | null;
  industry?: number | string | null;
  science?: number | string | null;
  stability?: number | string | null;
};

type Row = { country: CountryForClassement; prev: PrevSnapshot | null };

const panelStyle = {
  background: "var(--background-panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
};

function getNum(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isNaN(n) ? 0 : n;
}

type MetricKey = keyof CountryForClassement | "global";

function getRowValue(r: Row, key: MetricKey): number {
  if (key === "global") {
    return (r.country.population ?? 0) + getNum(r.country.gdp) / 1e9;
  }
  const v = r.country[key];
  return v != null && typeof v === "number" ? v : 0;
}

function getRowPrevValue(r: Row, key: MetricKey): number | null {
  if (!r.prev) return null;
  if (key === "global") {
    return getNum(r.prev.population) + getNum(r.prev.gdp) / 1e9;
  }
  const v = r.prev[key as keyof PrevSnapshot];
  return v != null && v !== "" ? getNum(v) : null;
}

/** Tri par valeur courante desc, avec rang et rang précédent pour l’évolution. */
function useRanked(rows: Row[], metricKey: MetricKey): { row: Row; rank: number; prev_rank: number | null }[] {
  return useMemo(() => {
    const withVal = rows.map((r) => ({
      row: r,
      value: getRowValue(r, metricKey),
      prevValue: getRowPrevValue(r, metricKey),
    }));
    const sorted = [...withVal].sort((a, b) => b.value - a.value);
    sorted.forEach((x, i) => {
      (x as { rank: number }).rank = i + 1;
    });
    const byPrev = [...withVal].sort(
      (a, b) => (b.prevValue ?? -Infinity) - (a.prevValue ?? -Infinity)
    );
    const prevRankById = new Map<string, number>();
    byPrev.forEach((x, i) => prevRankById.set(x.row.country.id, i + 1));
    return sorted.map((x) => ({
      row: x.row,
      rank: (x as { rank: number }).rank,
      prev_rank: prevRankById.get(x.row.country.id) ?? null,
    }));
  }, [rows, metricKey]);
}

function EvolutionCell({ rank, prev_rank }: { rank: number; prev_rank: number | null }) {
  if (prev_rank == null || prev_rank === rank) {
    return <td className="p-3 text-[var(--foreground-muted)]">—</td>;
  }
  const up = rank < prev_rank;
  return (
    <td className="p-3" title={up ? "Rang en hausse" : "Rang en baisse"}>
      <span
        className="text-lg leading-none"
        style={{ color: up ? "var(--accent)" : "var(--danger)" }}
        aria-hidden
      >
        {up ? "▲" : "▼"}
      </span>
    </td>
  );
}

export function ClassementContent({ rows }: { rows: Row[] }) {
  const [mainTab, setMainTab] = useState<"global" | "militaire" | "economique">("global");
  const [militaireSub, setMilitaireSub] = useState<"terre" | "air" | "mer">("terre");
  const [economiqueSub, setEconomiqueSub] = useState<"industrie" | "science" | "population">("industrie");

  const rankedGlobal = useRanked(rows, "global");
  const top3 = rankedGlobal.slice(0, 3);
  const rest = rankedGlobal.slice(3);

  const rankedMilitaire = useRanked(rows, "militarism");
  const rankedIndustry = useRanked(rows, "industry");
  const rankedScience = useRanked(rows, "science");
  const rankedPopulation = useRanked(rows, "population");

  const tabClass = (active: boolean) =>
    `tab ${active ? "tab-active" : ""}`;
  const tabStyle = (active: boolean) =>
    active ? { color: "var(--accent)", borderBottomColor: "var(--accent)" } : undefined;

  return (
    <div>
      <div className="tab-list mb-6" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          className={tabClass(mainTab === "global")}
          data-state={mainTab === "global" ? "active" : "inactive"}
          onClick={() => setMainTab("global")}
          style={tabStyle(mainTab === "global")}
        >
          Global
        </button>
        <button
          type="button"
          className={tabClass(mainTab === "militaire")}
          data-state={mainTab === "militaire" ? "active" : "inactive"}
          onClick={() => setMainTab("militaire")}
          style={tabStyle(mainTab === "militaire")}
        >
          Militaire
        </button>
        <button
          type="button"
          className={tabClass(mainTab === "economique")}
          data-state={mainTab === "economique" ? "active" : "inactive"}
          onClick={() => setMainTab("economique")}
          style={tabStyle(mainTab === "economique")}
        >
          Economique
        </button>
      </div>

      {mainTab === "global" && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Les 3 grandes puissances
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {top3.length === 0 ? (
                <p className="col-span-3 text-[var(--foreground-muted)]">Aucun pays en base.</p>
              ) : (
                top3.map(({ row, rank, prev_rank }) => (
                  <Link
                    key={row.country.id}
                    href={`/pays/${row.country.slug}`}
                    className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:border-[var(--accent)]"
                    style={{ ...panelStyle, borderColor: "var(--border)" }}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-[var(--foreground-muted)]" style={{ background: "var(--background-elevated)" }}>
                      {rank}
                    </span>
                    {prev_rank != null && prev_rank !== rank && (
                      <span
                        className="text-lg leading-none"
                        style={{ color: rank < prev_rank ? "var(--accent)" : "var(--danger)" }}
                        aria-hidden
                      >
                        {rank < prev_rank ? "▲" : "▼"}
                      </span>
                    )}
                    {row.country.flag_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.country.flag_url} alt="" width={48} height={32} className="h-8 w-12 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-12 rounded bg-[var(--background-elevated)]" />
                    )}
                    <span className="font-medium text-[var(--foreground)]">{row.country.name}</span>
                  </Link>
                ))
              )}
            </div>
          </section>
          <section>
            <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
              Autres nations
            </h2>
            <div className="rounded-lg border overflow-hidden" style={panelStyle}>
              {rest.length === 0 ? (
                <p className="p-6 text-center text-[var(--foreground-muted)]">Aucune autre nation.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <th className="p-3 font-medium text-[var(--foreground-muted)]">Rang</th>
                      <th className="p-3 font-medium text-[var(--foreground-muted)]"></th>
                      <th className="p-3 font-medium text-[var(--foreground-muted)]">Pays</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map(({ row, rank, prev_rank }) => (
                      <tr key={row.country.id} className="border-b" style={{ borderColor: "var(--border-muted)" }}>
                        <td className="p-3 font-mono text-[var(--foreground-muted)]">{rank}</td>
                        <td className="p-3">
                          {prev_rank != null && prev_rank !== rank ? (
                            <span
                              className="text-lg leading-none"
                              style={{ color: rank < prev_rank ? "var(--accent)" : "var(--danger)" }}
                              aria-hidden
                            >
                              {rank < prev_rank ? "▲" : "▼"}
                            </span>
                          ) : (
                            <span className="text-[var(--foreground-muted)]">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Link
                            href={`/pays/${row.country.slug}`}
                            className="flex items-center gap-2 text-[var(--foreground)] hover:text-[var(--accent)]"
                          >
                            {row.country.flag_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.country.flag_url} alt="" width={24} height={16} className="h-4 w-6 rounded object-cover" />
                            ) : (
                              <div className="h-4 w-6 rounded bg-[var(--background-elevated)]" />
                            )}
                            {row.country.name}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}

      {mainTab === "militaire" && (
        <div>
          <div className="mb-4 flex gap-2 border-b pb-2" style={{ borderColor: "var(--border-muted)" }}>
            {(["terre", "air", "mer"] as const).map((branch) => (
              <button
                key={branch}
                type="button"
                onClick={() => setMilitaireSub(branch)}
                className="rounded px-3 py-1.5 text-sm font-medium transition-colors"
                style={{
                  background: militaireSub === branch ? "var(--accent)" : "var(--background-elevated)",
                  color: militaireSub === branch ? "#0f1419" : "var(--foreground-muted)",
                }}
              >
                {branch === "terre" ? "Terrestre" : branch === "air" ? "Aérien" : "Naval"}
              </button>
            ))}
          </div>
          <div className="rounded-lg border overflow-hidden" style={panelStyle}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="p-3 font-medium text-[var(--foreground-muted)]">Rang</th>
                  <th className="p-3 w-10 font-medium text-[var(--foreground-muted)]" title="Évolution du rang">Évol.</th>
                  <th className="p-3 font-medium text-[var(--foreground-muted)]">Pays</th>
                  <th className="p-3 font-medium text-[var(--foreground-muted)]">Score</th>
                </tr>
              </thead>
              <tbody>
                {rankedMilitaire.map(({ row, rank, prev_rank }) => (
                  <tr key={row.country.id} className="border-b" style={{ borderColor: "var(--border-muted)" }}>
                    <td className="p-3 font-mono text-[var(--foreground-muted)]">{rank}</td>
                    <EvolutionCell rank={rank} prev_rank={prev_rank} />
                    <td className="p-3">
                      <Link href={`/pays/${row.country.slug}`} className="flex items-center gap-2 text-[var(--foreground)] hover:text-[var(--accent)]">
                        {row.country.flag_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.country.flag_url} alt="" width={24} height={16} className="h-4 w-6 rounded object-cover" />
                        ) : (
                          <div className="h-4 w-6 rounded bg-[var(--background-elevated)]" />
                        )}
                        {row.country.name}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-[var(--foreground-muted)]">{row.country.militarism ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="p-6 text-center text-[var(--foreground-muted)]">Aucun pays.</p>
            )}
          </div>
        </div>
      )}

      {mainTab === "economique" && (
        <div>
          <div className="mb-4 flex gap-2 border-b pb-2" style={{ borderColor: "var(--border-muted)" }}>
            {(["industrie", "science", "population"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setEconomiqueSub(cat)}
                className="rounded px-3 py-1.5 text-sm font-medium transition-colors"
                style={{
                  background: economiqueSub === cat ? "var(--accent)" : "var(--background-elevated)",
                  color: economiqueSub === cat ? "#0f1419" : "var(--foreground-muted)",
                }}
              >
                {cat === "industrie" ? "Industriel" : cat === "science" ? "Scientifique" : "Population"}
              </button>
            ))}
          </div>
          <div className="rounded-lg border overflow-hidden" style={panelStyle}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="p-3 font-medium text-[var(--foreground-muted)]">Rang</th>
                  <th className="p-3 w-10 font-medium text-[var(--foreground-muted)]" title="Évolution du rang">Évol.</th>
                  <th className="p-3 font-medium text-[var(--foreground-muted)]">Pays</th>
                  <th className="p-3 font-medium text-[var(--foreground-muted)]">Score</th>
                </tr>
              </thead>
              <tbody>
                {economiqueSub === "industrie" &&
                  rankedIndustry.map(({ row, rank, prev_rank }) => (
                    <tr key={row.country.id} className="border-b" style={{ borderColor: "var(--border-muted)" }}>
                      <td className="p-3 font-mono text-[var(--foreground-muted)]">{rank}</td>
                      <EvolutionCell rank={rank} prev_rank={prev_rank} />
                      <td className="p-3">
                        <Link href={`/pays/${row.country.slug}`} className="flex items-center gap-2 text-[var(--foreground)] hover:text-[var(--accent)]">
                          {row.country.flag_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.country.flag_url} alt="" width={24} height={16} className="h-4 w-6 rounded object-cover" />
                          ) : (
                            <div className="h-4 w-6 rounded bg-[var(--background-elevated)]" />
                          )}
                          {row.country.name}
                        </Link>
                      </td>
                      <td className="p-3 font-mono text-[var(--foreground-muted)]">{row.country.industry ?? "—"}</td>
                    </tr>
                  ))}
                {economiqueSub === "science" &&
                  rankedScience.map(({ row, rank, prev_rank }) => (
                    <tr key={row.country.id} className="border-b" style={{ borderColor: "var(--border-muted)" }}>
                      <td className="p-3 font-mono text-[var(--foreground-muted)]">{rank}</td>
                      <EvolutionCell rank={rank} prev_rank={prev_rank} />
                      <td className="p-3">
                        <Link href={`/pays/${row.country.slug}`} className="flex items-center gap-2 text-[var(--foreground)] hover:text-[var(--accent)]">
                          {row.country.flag_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.country.flag_url} alt="" width={24} height={16} className="h-4 w-6 rounded object-cover" />
                          ) : (
                            <div className="h-4 w-6 rounded bg-[var(--background-elevated)]" />
                          )}
                          {row.country.name}
                        </Link>
                      </td>
                      <td className="p-3 font-mono text-[var(--foreground-muted)]">{row.country.science ?? "—"}</td>
                    </tr>
                  ))}
                {economiqueSub === "population" &&
                  rankedPopulation.map(({ row, rank, prev_rank }) => {
                    const pop = row.country.population ?? 0;
                    const prevPop = row.prev ? getNum(row.prev.population) : null;
                    const diff = prevPop != null ? pop - prevPop : null;
                    const isUp = diff != null && diff > 0;
                    const isDown = diff != null && diff < 0;
                    return (
                      <tr key={row.country.id} className="border-b" style={{ borderColor: "var(--border-muted)" }}>
                        <td className="p-3 font-mono text-[var(--foreground-muted)]">{rank}</td>
                        <EvolutionCell rank={rank} prev_rank={prev_rank} />
                        <td className="p-3">
                          <Link href={`/pays/${row.country.slug}`} className="flex items-center gap-2 text-[var(--foreground)] hover:text-[var(--accent)]">
                            {row.country.flag_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={row.country.flag_url} alt="" width={24} height={16} className="h-4 w-6 rounded object-cover" />
                            ) : (
                              <div className="h-4 w-6 rounded bg-[var(--background-elevated)]" />
                            )}
                            {row.country.name}
                          </Link>
                        </td>
                        <td className="p-3 font-mono">
                          <span className="tabular-nums text-[var(--foreground)]">
                            {pop ? formatNumber(pop) : "—"}
                          </span>
                          {diff != null && diff !== 0 && (
                            <span
                              className="ml-1 font-mono text-xs"
                              style={{
                                color: isUp ? "var(--accent)" : isDown ? "var(--danger)" : undefined,
                              }}
                              title={isUp ? "En hausse" : "En baisse"}
                            >
                              ({isUp ? "+" : ""}{formatNumber(diff)})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="p-6 text-center text-[var(--foreground-muted)]">Aucun pays.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
