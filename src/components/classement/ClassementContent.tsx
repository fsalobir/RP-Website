"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatNumber, formatGdp, formatPopulation } from "@/lib/format";
import { InfoTooltipWithWikiLink } from "@/components/ui/InfoTooltipWithWikiLink";
import { matchesSearchText } from "@/lib/searchText";

const flagLoader = ({ src }: { src: string }) => src;

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

type Row = {
  country: CountryForClassement;
  prev: PrevSnapshot | null;
  influence?: number | null;
  hard_power_terre?: number;
  hard_power_air?: number;
  hard_power_mer?: number;
  hard_power_strategique?: number;
  hard_power_total?: number;
};

/** Surface de lecture commune aux classements. */
const glassPanelClass = "rounded-2xl border border-white/15 bg-[#091118]/90 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-md";
const glassTitleClass = "text-lg font-semibold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]";
const glassMutedClass = "text-white/70";
const glassBorderClass = "border-white/10";
const PAGE_SIZE = 30;

function getNum(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isNaN(n) ? 0 : n;
}

type MetricKey = keyof CountryForClassement | "global" | "influence" | "hard_power_terre" | "hard_power_air" | "hard_power_mer" | "hard_power_strategique" | "hard_power_total";

function getRowValue(r: Row, key: MetricKey): number {
  if (key === "global") {
    return (r.country.population ?? 0) + getNum(r.country.gdp) / 1e9;
  }
  if (key === "influence") return r.influence != null && !Number.isNaN(r.influence) ? r.influence : 0;
  if (key === "hard_power_terre") return r.hard_power_terre ?? 0;
  if (key === "hard_power_air") return r.hard_power_air ?? 0;
  if (key === "hard_power_mer") return r.hard_power_mer ?? 0;
  if (key === "hard_power_strategique") return r.hard_power_strategique ?? 0;
  if (key === "hard_power_total") return r.hard_power_total ?? 0;
  const v = r.country[key as keyof CountryForClassement];
  return v != null && typeof v === "number" ? v : 0;
}

function getRowPrevValue(r: Row, key: MetricKey): number | null {
  if (!r.prev) return null;
  if (key === "global") {
    return getNum(r.prev.population) + getNum(r.prev.gdp) / 1e9;
  }
  if (key === "influence" || key.startsWith("hard_power_")) return null;
  const v = r.prev[key as keyof PrevSnapshot];
  return v != null && v !== "" ? getNum(v) : null;
}

/** Tri par valeur courante desc, avec rang et rang précédent pour l’évolution. */
function useRanked(rows: Row[], metricKey: MetricKey): { row: Row; rank: number; prev_rank: number | null }[] {
  return useMemo(() => {
    type WithVal = { row: Row; value: number; prevValue: number | null; rank?: number };
    const withVal: WithVal[] = rows.map((r) => ({
      row: r,
      value: getRowValue(r, metricKey),
      prevValue: getRowPrevValue(r, metricKey),
    }));
    const sorted = [...withVal].sort((a, b) => b.value - a.value);
    sorted.forEach((x, i) => {
      x.rank = i + 1;
    });
    const byPrev = [...withVal].sort(
      (a, b) => (b.prevValue ?? -Infinity) - (a.prevValue ?? -Infinity)
    );
    const prevRankById = new Map<string, number>();
    byPrev.forEach((x, i) => prevRankById.set(x.row.country.id, i + 1));
    return sorted.map((x) => ({
      row: x.row,
      rank: x.rank!,
      prev_rank: prevRankById.get(x.row.country.id) ?? null,
    }));
  }, [rows, metricKey]);
}

function EvolutionCell({ rank, prev_rank, glass = false }: { rank: number; prev_rank: number | null; glass?: boolean }) {
  if (prev_rank == null || prev_rank === rank) {
    return <td className={`p-3 ${glass ? "text-white/85" : "text-[var(--foreground-muted)]"}`}>—</td>;
  }
  const up = rank < prev_rank;
  const color = glass ? (up ? "#86efac" : "#fca5a5") : (up ? "var(--accent)" : "var(--danger)");
  return (
    <td className="p-3" title={up ? "Rang en hausse" : "Rang en baisse"}>
      <span className="text-lg leading-none" style={{ color }} aria-hidden>
        {up ? "▲" : "▼"}
      </span>
      <span className="sr-only">{up ? "Rang en hausse" : "Rang en baisse"}</span>
    </td>
  );
}

type MilitaireSubKey = "militarism" | "terre" | "air" | "mer" | "strategique";

export function ClassementContent({ rows }: { rows: Row[] }) {
  const [mainTab, setMainTab] = useState<"global" | "militaire" | "economique">("global");
  const [militaireSub, setMilitaireSub] = useState<MilitaireSubKey>("militarism");
  const [economiqueSub, setEconomiqueSub] = useState<"population" | "gdp">("population");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleRows, setVisibleRows] = useState(PAGE_SIZE);

  const rankedInfluence = useRanked(rows, "influence");
  const top3 = rankedInfluence.slice(0, 3);
  const middle5 = rankedInfluence.slice(3, 8);
  const middle5Top = middle5.slice(0, 3);
  const middle5Bottom = middle5.slice(3);
  const rest = rankedInfluence.slice(8);

  const rankedMilitaire = useRanked(rows, "militarism");
  const rankedHPTerre = useRanked(rows, "hard_power_terre");
  const rankedHPAir = useRanked(rows, "hard_power_air");
  const rankedHPMer = useRanked(rows, "hard_power_mer");
  const rankedHPStrategique = useRanked(rows, "hard_power_strategique");
  const rankedPopulation = useRanked(rows, "population");
  const rankedGdp = useRanked(rows, "gdp");
  const matchesCountry = (row: Row) =>
    !searchQuery.trim() || matchesSearchText(searchQuery, [row.country.name]);
  const globalSource = searchQuery.trim() ? rankedInfluence : rest;
  const filteredGlobalRows = globalSource.filter(({ row }) => matchesCountry(row));
  const displayedGlobalRows = filteredGlobalRows.slice(0, visibleRows);
  const militarySource =
    militaireSub === "militarism"
      ? rankedMilitaire
      : militaireSub === "terre"
        ? rankedHPTerre
        : militaireSub === "air"
          ? rankedHPAir
          : militaireSub === "mer"
            ? rankedHPMer
            : rankedHPStrategique;
  const filteredMilitaryRows = militarySource.filter(({ row }) => matchesCountry(row));
  const displayedMilitaryRows = filteredMilitaryRows.slice(0, visibleRows);
  const economicSource = economiqueSub === "population" ? rankedPopulation : rankedGdp;
  const filteredEconomicRows = economicSource.filter(({ row }) => matchesCountry(row));
  const displayedEconomicRows = filteredEconomicRows.slice(0, visibleRows);

  const tabButtonClass = (active: boolean) =>
    `min-h-11 rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:px-3 sm:text-sm ${
      active ? "bg-[var(--accent)] text-[#071016] shadow-[0_8px_22px_rgba(103,211,122,0.14)]" : "text-white/70 hover:bg-white/[0.07] hover:text-white"
    }`;

  return (
    <div>
      <div className={`mb-6 flex flex-wrap items-center gap-2 ${glassPanelClass} p-2`}>
        <button
          type="button"
          className={tabButtonClass(mainTab === "global")}
          onClick={() => {
            setMainTab("global");
            setVisibleRows(PAGE_SIZE);
          }}
          aria-pressed={mainTab === "global"}
        >
          Classement
        </button>
        <button
          type="button"
          className={tabButtonClass(mainTab === "militaire")}
          onClick={() => {
            setMainTab("militaire");
            setVisibleRows(PAGE_SIZE);
          }}
          aria-pressed={mainTab === "militaire"}
        >
          Militaire
        </button>
        <button
          type="button"
          className={tabButtonClass(mainTab === "economique")}
          onClick={() => {
            setMainTab("economique");
            setVisibleRows(PAGE_SIZE);
          }}
          aria-pressed={mainTab === "economique"}
        >
          Économique
        </button>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setVisibleRows(PAGE_SIZE);
          }}
          placeholder="Rechercher un pays…"
          aria-label="Rechercher un pays dans le classement"
          className="order-last min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-base text-white placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:order-none lg:ml-auto lg:max-w-xs"
        />
        <span className="ml-auto inline-flex items-center" onClick={(e) => e.stopPropagation()}>
          <InfoTooltipWithWikiLink
            text="Rangs des pays par influence totale (influence propre + bonus de sphère), puissance militaire ou indicateurs économiques. Les flèches indiquent l'évolution du rang."
            wikiSectionId="classement-metrics"
            side="bottom"
          />
        </span>
      </div>

      {mainTab === "global" && (
        <div className="space-y-8">
          {!searchQuery.trim() && <section className={`${glassPanelClass} p-6`}>
            <h2 className={`mb-4 ${glassTitleClass}`}>
              Les 3 grandes puissances
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {top3.length === 0 ? (
                <p className={`col-span-3 ${glassMutedClass}`}>Aucun pays en base.</p>
              ) : (
                top3.map(({ row, rank }) => (
                  <Link
                    key={row.country.id}
                    href={`/pays/${row.country.slug}`}
                    className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                      rank === 1
                        ? "border-[var(--accent)]/55 bg-[var(--accent)]/[0.09] hover:bg-[var(--accent)]/[0.14]"
                        : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                      rank === 1 ? "bg-[var(--accent)] text-[#071016]" : "bg-white/10 text-white"
                    }`}>
                      {rank}
                    </span>
                    {row.country.flag_url ? (
                      <Image loader={flagLoader} unoptimized src={row.country.flag_url} alt="" width={48} height={32} className="h-8 w-12 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-12 rounded bg-white/20" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-white">{row.country.name}</span>
                      {row.influence != null && !Number.isNaN(row.influence) && (
                        <p className={`text-xs ${glassMutedClass}`}>
                          Influence totale : {formatNumber(row.influence)}
                        </p>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>}
          {!searchQuery.trim() && <section className={`${glassPanelClass} p-6`}>
            <h2 className={`mb-4 ${glassTitleClass}`}>
              Les 5 puissances moyennes
            </h2>
            {middle5.length === 0 ? (
              <p className={glassMutedClass}>Aucun pays en base.</p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  {middle5Top.map(({ row, rank }) => (
                    <Link
                      key={row.country.id}
                      href={`/pays/${row.country.slug}`}
                      className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white/90 bg-white/20">
                        {rank}
                      </span>
                      {row.country.flag_url ? (
                        <Image loader={flagLoader} unoptimized src={row.country.flag_url} alt="" width={48} height={32} className="h-8 w-12 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-12 rounded bg-white/20" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-white">{row.country.name}</span>
                        {row.influence != null && !Number.isNaN(row.influence) && (
                          <p className={`text-xs ${glassMutedClass}`}>
                            Influence totale : {formatNumber(row.influence)}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
                {middle5Bottom.length > 0 && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-6">
                    {middle5Bottom.map(({ row, rank }, idx) => (
                      <Link
                        key={row.country.id}
                        href={`/pays/${row.country.slug}`}
                        className={`flex items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06] sm:col-span-2 ${idx === 0 ? "sm:col-start-2" : "sm:col-start-4"}`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white/90 bg-white/20">
                          {rank}
                        </span>
                        {row.country.flag_url ? (
                          <Image loader={flagLoader} unoptimized src={row.country.flag_url} alt="" width={48} height={32} className="h-8 w-12 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-12 rounded bg-white/20" />
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-white">{row.country.name}</span>
                          {row.influence != null && !Number.isNaN(row.influence) && (
                            <p className={`text-xs ${glassMutedClass}`}>
                              Influence totale : {formatNumber(row.influence)}
                            </p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>}
          <section className={`${glassPanelClass} overflow-hidden`}>
            <h2 className={`mb-0 px-6 pt-6 pb-4 ${glassTitleClass}`}>
              {searchQuery.trim() ? "Résultats" : "Les puissances mineures"}
            </h2>
            {filteredGlobalRows.length === 0 ? (
              <p className={`p-6 text-center ${glassMutedClass}`}>
                {searchQuery.trim() ? "Aucun pays ne correspond à cette recherche." : "Aucune autre nation."}
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={`border-b ${glassBorderClass}`}>
                    <th className={`p-3 font-medium ${glassMutedClass}`}>Rang</th>
                    <th className={`p-3 font-medium ${glassMutedClass}`}></th>
                    <th className={`p-3 font-medium ${glassMutedClass}`}>Pays</th>
                    <th className={`p-3 font-medium ${glassMutedClass}`}>Influence totale</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedGlobalRows.map(({ row, rank, prev_rank }) => (
                    <tr key={row.country.id} className={`border-b ${glassBorderClass}`}>
                      <td className={`p-3 font-mono ${glassMutedClass}`}>{rank}</td>
                      <td className="p-3">
                        {prev_rank != null && prev_rank !== rank ? (
                          <span title={rank < prev_rank ? "Rang en hausse" : "Rang en baisse"}>
                            <span
                              className="text-lg leading-none"
                              style={{ color: rank < prev_rank ? "#86efac" : "#fca5a5" }}
                              aria-hidden
                            >
                              {rank < prev_rank ? "▲" : "▼"}
                            </span>
                            <span className="sr-only">
                              {rank < prev_rank ? "Rang en hausse" : "Rang en baisse"}
                            </span>
                          </span>
                        ) : (
                          <span className={glassMutedClass}>—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/pays/${row.country.slug}`}
                          className="flex min-h-11 items-center gap-2 text-white hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                        >
                          {row.country.flag_url ? (
                            <Image loader={flagLoader} unoptimized src={row.country.flag_url} alt="" width={24} height={16} className="h-4 w-6 rounded object-cover" />
                          ) : (
                            <div className="h-4 w-6 rounded bg-white/20" />
                          )}
                          {row.country.name}
                        </Link>
                      </td>
                      <td className={`p-3 font-mono ${glassMutedClass}`}>
                        {formatNumber(row.influence)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {filteredGlobalRows.length > displayedGlobalRows.length && (
              <button
                type="button"
                onClick={() => setVisibleRows((count) => count + PAGE_SIZE)}
                className="m-4 min-h-11 rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                Afficher {Math.min(PAGE_SIZE, filteredGlobalRows.length - displayedGlobalRows.length)} pays de plus
              </button>
            )}
          </section>
        </div>
      )}

      {mainTab === "militaire" && (
        <div className={`${glassPanelClass} overflow-hidden`}>
          <div className="flex flex-wrap gap-2 p-4 pb-2 border-b border-white/20">
            {([
              { key: "militarism" as const, label: "Militarisme" },
              { key: "terre" as const, label: "Terrestre (HP)" },
              { key: "air" as const, label: "Aérien (HP)" },
              { key: "mer" as const, label: "Naval (HP)" },
              { key: "strategique" as const, label: "Stratégique (HP)" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setMilitaireSub(key);
                  setVisibleRows(PAGE_SIZE);
                }}
                aria-pressed={militaireSub === key}
                className={`min-h-11 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                  militaireSub === key ? "bg-white/25 text-white" : "text-white/85 hover:bg-white/15 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={`border-b ${glassBorderClass}`}>
                <th className={`p-3 font-medium ${glassMutedClass}`}>Rang</th>
                <th className={`p-3 w-10 font-medium ${glassMutedClass}`} title="Évolution du rang">Évol.</th>
                <th className={`p-3 font-medium ${glassMutedClass}`}>Pays</th>
                <th className={`p-3 font-medium ${glassMutedClass}`}>Score</th>
              </tr>
            </thead>
            <tbody>
              {displayedMilitaryRows.map(({ row, rank, prev_rank }) => (
                <tr key={row.country.id} className={`border-b ${glassBorderClass}`}>
                  <td className={`p-3 font-mono ${glassMutedClass}`}>{rank}</td>
                  <EvolutionCell rank={rank} prev_rank={prev_rank} glass />
                  <td className="p-3">
                    <Link href={`/pays/${row.country.slug}`} className="flex min-h-11 items-center gap-2 text-white hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                      {row.country.flag_url ? (
                        <Image loader={flagLoader} unoptimized src={row.country.flag_url} alt="" width={24} height={16} className="h-4 w-6 rounded object-cover" />
                      ) : (
                        <div className="h-4 w-6 rounded bg-white/20" />
                      )}
                      {row.country.name}
                    </Link>
                  </td>
                  <td className={`p-3 font-mono ${glassMutedClass}`}>
                    {militaireSub === "militarism"
                      ? formatNumber(row.country.militarism)
                      : formatNumber(militaireSub === "terre" ? (row.hard_power_terre ?? 0) : militaireSub === "air" ? (row.hard_power_air ?? 0) : militaireSub === "mer" ? (row.hard_power_mer ?? 0) : (row.hard_power_strategique ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredMilitaryRows.length === 0 && (
            <p className={`p-6 text-center ${glassMutedClass}`}>Aucun pays ne correspond.</p>
          )}
          {filteredMilitaryRows.length > displayedMilitaryRows.length && (
            <button
              type="button"
              onClick={() => setVisibleRows((count) => count + PAGE_SIZE)}
              className="m-4 min-h-11 rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Afficher {Math.min(PAGE_SIZE, filteredMilitaryRows.length - displayedMilitaryRows.length)} pays de plus
            </button>
          )}
        </div>
      )}

      {mainTab === "economique" && (
        <div className={`${glassPanelClass} overflow-hidden`}>
          <div className="flex flex-wrap gap-2 p-4 pb-2 border-b border-white/20">
            {(["population", "gdp"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setEconomiqueSub(cat);
                  setVisibleRows(PAGE_SIZE);
                }}
                aria-pressed={economiqueSub === cat}
                className={`min-h-11 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                  economiqueSub === cat ? "bg-white/25 text-white" : "text-white/85 hover:bg-white/15 hover:text-white"
                }`}
              >
                {cat === "gdp" ? "PIB" : "Population"}
              </button>
            ))}
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={`border-b ${glassBorderClass}`}>
                <th className={`p-3 font-medium ${glassMutedClass}`}>Rang</th>
                <th className={`p-3 w-10 font-medium ${glassMutedClass}`} title="Évolution du rang">Évol.</th>
                <th className={`p-3 font-medium ${glassMutedClass}`}>Pays</th>
                <th className={`p-3 font-medium ${glassMutedClass}`}>Score</th>
              </tr>
            </thead>
            <tbody>
              {economiqueSub === "population" &&
                displayedEconomicRows.map(({ row, rank, prev_rank }) => {
                  const pop = row.country.population ?? 0;
                  const prevPop = row.prev ? getNum(row.prev.population) : null;
                  const diff = prevPop != null ? pop - prevPop : null;
                  const isUp = diff != null && diff > 0;
                  const isDown = diff != null && diff < 0;
                  return (
                    <tr key={row.country.id} className={`border-b ${glassBorderClass}`}>
                      <td className={`p-3 font-mono ${glassMutedClass}`}>{rank}</td>
                      <EvolutionCell rank={rank} prev_rank={prev_rank} glass />
                      <td className="p-3">
                        <Link href={`/pays/${row.country.slug}`} className="flex min-h-11 items-center gap-2 text-white hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                          {row.country.flag_url ? (
                            <Image loader={flagLoader} unoptimized src={row.country.flag_url} alt="" width={24} height={16} className="h-4 w-6 rounded object-cover" />
                          ) : (
                            <div className="h-4 w-6 rounded bg-white/20" />
                          )}
                          {row.country.name}
                        </Link>
                      </td>
                      <td className="p-3 font-mono">
                        <span className="tabular-nums text-white">
                          {pop ? formatPopulation(pop) : "—"}
                        </span>
                        {diff != null && diff !== 0 && (
                          <span
                            className="ml-1 font-mono text-xs"
                            style={{
                              color: isUp ? "#86efac" : isDown ? "#fca5a5" : undefined,
                            }}
                            title={isUp ? "En hausse" : "En baisse"}
                          >
                            ({isUp ? "+" : ""}{formatPopulation(diff)})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {economiqueSub === "gdp" &&
                displayedEconomicRows.map(({ row, rank, prev_rank }) => (
                  <tr key={row.country.id} className={`border-b ${glassBorderClass}`}>
                    <td className={`p-3 font-mono ${glassMutedClass}`}>{rank}</td>
                    <EvolutionCell rank={rank} prev_rank={prev_rank} glass />
                    <td className="p-3">
                      <Link href={`/pays/${row.country.slug}`} className="flex min-h-11 items-center gap-2 text-white hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                        {row.country.flag_url ? (
                          <Image loader={flagLoader} unoptimized src={row.country.flag_url} alt="" width={24} height={16} className="h-4 w-6 rounded object-cover" />
                        ) : (
                          <div className="h-4 w-6 rounded bg-white/20" />
                        )}
                        {row.country.name}
                      </Link>
                    </td>
                    <td className={`p-3 font-mono ${glassMutedClass}`}>
                      {formatGdp(row.country.gdp)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {filteredEconomicRows.length === 0 && (
            <p className={`p-6 text-center ${glassMutedClass}`}>Aucun pays ne correspond.</p>
          )}
          {filteredEconomicRows.length > displayedEconomicRows.length && (
            <button
              type="button"
              onClick={() => setVisibleRows((count) => count + PAGE_SIZE)}
              className="m-4 min-h-11 rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Afficher {Math.min(PAGE_SIZE, filteredEconomicRows.length - displayedEconomicRows.length)} pays de plus
            </button>
          )}
        </div>
      )}
    </div>
  );
}
