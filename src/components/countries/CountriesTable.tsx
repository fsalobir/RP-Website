"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatNumber, formatGdp } from "@/lib/format";

export type SortKey =
  | "name"
  | "regime"
  | "population"
  | "gdp"
  | "militarism"
  | "industry"
  | "science"
  | "stability";

type CountryRow = {
  id: string;
  name: string;
  slug: string;
  flag_url: string | null;
  regime: string | null;
  population: number | null;
  gdp: number | null;
  militarism: number | null;
  industry: number | null;
  science: number | null;
  stability: number | null;
};

type HistoryRow = {
  population?: number | string | null;
  gdp?: number | string | null;
  militarism?: number | string | null;
  industry?: number | string | null;
  science?: number | string | null;
  stability?: number | string | null;
};

export type Row = { country: CountryRow; prev?: HistoryRow | null };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Pays" },
  { key: "regime", label: "Régime" },
  { key: "population", label: "Population" },
  { key: "gdp", label: "PIB" },
  { key: "militarism", label: "Militarisme" },
  { key: "industry", label: "Industrie" },
  { key: "science", label: "Science" },
  { key: "stability", label: "Stabilité" },
];

function getSortValue(row: Row, key: SortKey): number | string | null {
  const c = row.country;
  if (key === "name") return (c.name ?? "").toLowerCase() || null;
  if (key === "regime") return (c.regime ?? "").toLowerCase() || null;
  const n =
    key === "population"
      ? c.population
      : key === "gdp"
        ? c.gdp
        : key === "militarism"
          ? c.militarism
          : key === "industry"
            ? c.industry
            : key === "science"
              ? c.science
              : c.stability;
  if (n == null || Number.isNaN(Number(n))) return null;
  return Number(n);
}

function compare(
  a: number | string | null,
  b: number | string | null,
  asc: boolean
): number {
  const mul = asc ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") {
    return mul * a.localeCompare(b, "fr");
  }
  const na = Number(a);
  const nb = Number(b);
  if (na < nb) return -1 * mul;
  if (na > nb) return 1 * mul;
  return 0;
}

export function CountriesTable({
  rows,
  showModifierButton = false,
}: {
  rows: Row[];
  /** Affiche une colonne « Modifier » (lien vers /admin/pays/[id]) pour les listes admin. */
  showModifierButton?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      return compare(va, vb, sortOrder === "asc");
    });
  }, [rows, sortKey, sortOrder]);

  function handleHeaderClick(key: SortKey) {
    if (sortKey === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  }

  const panelStyle = {
    background: "var(--background-panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
  };

  return (
    <div className="overflow-x-auto rounded-lg border" style={panelStyle}>
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: "var(--border)" }}>
            {COLUMNS.map(({ key, label }) => (
              <th
                key={key}
                className="p-3 font-medium text-[var(--foreground-muted)] cursor-pointer select-none hover:text-[var(--foreground)] hover:bg-[var(--background-elevated)]"
                style={{ borderColor: "var(--border)" }}
                onClick={() => handleHeaderClick(key)}
              >
                <span className="inline-flex items-center gap-1">
                  {label}
                  {sortKey === key && (
                    <span className="text-[var(--accent)]" aria-hidden>
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </span>
              </th>
            ))}
            {showModifierButton && (
              <th className="p-3 w-24 font-medium text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const { country: c, prev } = row;
            return (
            <tr
              key={c.id}
              className="border-b transition-colors hover:bg-[var(--background-elevated)]"
              style={{ borderColor: "var(--border-muted)" }}
            >
              <td className="p-3 relative align-middle">
                <Link
                  href={`/pays/${c.slug}`}
                  className="flex items-center gap-3 font-medium text-[var(--foreground)] hover:text-[var(--accent)] cursor-pointer relative z-[1] min-h-[2rem]"
                  style={{ isolation: "isolate" }}
                >
                  {c.flag_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.flag_url}
                      alt=""
                      width={40}
                      height={27}
                      className="h-7 w-10 rounded object-cover pointer-events-none"
                    />
                  ) : (
                    <div
                      className="h-7 w-10 rounded bg-[var(--background-elevated)] pointer-events-none"
                      style={{ background: "var(--background-elevated)" }}
                    />
                  )}
                  <span className="pointer-events-none">{c.name}</span>
                </Link>
              </td>
              <td className="p-3 text-[var(--foreground-muted)]">{c.regime ?? "—"}</td>
              <NumericVariationCell
                current={c.population}
                previous={prev?.population}
                formatValue={formatNumber}
              />
              <NumericVariationCell
                current={c.gdp}
                previous={prev?.gdp}
                formatValue={formatGdp}
                formatDiff={formatGdp}
              />
              <StatCell current={c.militarism} previous={prev?.militarism} />
              <StatCell current={c.industry} previous={prev?.industry} />
              <StatCell current={c.science} previous={prev?.science} />
              <StatCell current={c.stability} previous={prev?.stability} />
              {showModifierButton && (
                <td className="p-3">
                  <Link
                    href={`/admin/pays/${c.id}`}
                    className="inline-block rounded px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
                    style={{ background: "var(--warning)", color: "#0f1419" }}
                  >
                    Modifier
                  </Link>
                </td>
              )}
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NumericVariationCell({
  current,
  previous,
  formatValue,
  formatDiff,
}: {
  current: number | null | undefined;
  previous?: number | string | null;
  formatValue: (n: number) => string;
  formatDiff?: (n: number) => string;
}) {
  const num = current != null && !Number.isNaN(Number(current)) ? Number(current) : null;
  const prevNum =
    previous != null && previous !== "" && !Number.isNaN(Number(previous))
      ? Number(previous)
      : null;
  const diff = num != null && prevNum != null ? num - prevNum : null;
  const isUp = diff != null && diff > 0;
  const isDown = diff != null && diff < 0;
  const formatDelta = formatDiff ?? formatNumber;

  return (
    <td className="p-3">
      <span className="font-mono tabular-nums text-[var(--foreground)]">
        {num != null ? formatValue(num) : "—"}
      </span>
      {diff != null && diff !== 0 && (
        <span
          className="ml-1 font-mono text-xs"
          style={{
            color: isUp ? "var(--accent)" : isDown ? "var(--danger)" : undefined,
          }}
          title={isUp ? "En hausse" : "En baisse"}
        >
          ({isUp ? "+" : ""}{formatDelta(diff)})
        </span>
      )}
    </td>
  );
}

function StatCell({
  current,
  previous,
}: {
  current: number | null | undefined;
  previous?: number | string | null;
}) {
  const num = current != null && !Number.isNaN(Number(current)) ? Number(current) : null;
  const prevNum =
    previous != null && previous !== "" && !Number.isNaN(Number(previous))
      ? Number(previous)
      : null;
  const diff = num != null && prevNum != null ? num - prevNum : null;
  const isUp = diff != null && diff > 0;
  const isDown = diff != null && diff < 0;
  const diffFormatted = diff != null ? Number(diff.toFixed(2)) : null;

  return (
    <td className="p-3">
      <span className="font-mono tabular-nums text-[var(--foreground)]">
        {num != null ? Number(num).toFixed(2) : "—"}
      </span>
      {diffFormatted != null && diffFormatted !== 0 && (
        <span
          className="ml-1 font-mono text-xs"
          style={{
            color: isUp ? "var(--accent)" : isDown ? "var(--danger)" : undefined,
          }}
          title={isUp ? "En hausse" : "En baisse"}
        >
          ({isUp ? "+" : ""}{diffFormatted})
        </span>
      )}
    </td>
  );
}
