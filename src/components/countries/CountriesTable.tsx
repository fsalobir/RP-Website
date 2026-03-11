"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { formatNumber, formatGdp, formatPopulation } from "@/lib/format";
import { InfoTooltipWithWikiLink } from "@/components/ui/InfoTooltipWithWikiLink";

export type SortKey =
  | "name"
  | "population"
  | "gdp"
  | "stability"
  | "influence";

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
  ai_status?: string | null;
  continent_id?: string | null;
};

type HistoryRow = {
  population?: number | string | null;
  gdp?: number | string | null;
  militarism?: number | string | null;
  industry?: number | string | null;
  science?: number | string | null;
  stability?: number | string | null;
};

/** Entrée « sphère » : pays contrôlé par ce pays (pour affichage drapeaux + tooltip). */
export type SphereEntry = {
  slug: string;
  flag_url: string | null;
  name: string;
  share_pct: number;
  is_annexed: boolean;
};

export type Row = {
  country: CountryRow;
  prev?: HistoryRow | null;
  influence?: number | null;
  /** Pays dans la sphère de ce pays (contrôlés / occupés / annexés). Affiché en colonne Sphère. */
  sphere?: SphereEntry[];
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Pays" },
  { key: "influence", label: "Influence" },
  { key: "gdp", label: "PIB" },
  { key: "population", label: "Population" },
  { key: "stability", label: "Stabilité" },
];

const ADMIN_COLUMNS = [
  { key: "name" as const, label: "Pays" },
  { key: "player" as const, label: "Joueur" },
  { key: "continent" as const, label: "Continent" },
];

function getSortValue(row: Row, key: SortKey): number | string | null {
  const c = row.country;
  if (key === "name") return (c.name ?? "").toLowerCase() || null;
  if (key === "influence") return row.influence ?? null;
  const n =
    key === "population"
      ? c.population
      : key === "gdp"
        ? c.gdp
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

type AdminSortKey = "name" | "player" | "continent";

function getAdminSortValue(
  row: Row,
  key: AdminSortKey,
  playerNameByCountryId: Record<string, string>,
  continentLabelById: Record<string, string>
): number | string | null {
  const c = row.country;
  if (key === "name") return (c.name ?? "").toLowerCase() || null;
  if (key === "player") return (playerNameByCountryId[c.id] ?? "").toLowerCase() || null;
  if (key === "continent") return (continentLabelById[c.continent_id ?? ""] ?? "").toLowerCase() || null;
  return null;
}

export function CountriesTable({
  rows,
  showModifierButton = false,
  showAiStatusColumn = false,
  updateAiStatusAction,
  countryIdsWithPlayer = [],
  adminLayout = false,
  playerNameByCountryId = {},
  continents = [],
  updateCountryContinentAction,
  showSearch = false,
  showWikiTooltips = false,
}: {
  rows: Row[];
  showModifierButton?: boolean;
  showAiStatusColumn?: boolean;
  updateAiStatusAction?: (countryId: string, aiStatus: string | null) => Promise<{ error?: string }>;
  countryIdsWithPlayer?: string[];
  /** Layout liste admin : colonnes Joueur, Continent (sans Sphère/PIB/Population/Stabilité). */
  adminLayout?: boolean;
  playerNameByCountryId?: Record<string, string>;
  continents?: Array<{ id: string; slug: string; label_fr: string }>;
  updateCountryContinentAction?: (countryId: string, continentId: string | null) => Promise<{ error?: string }>;
  /** Barre de recherche au-dessus de la table (liste joueur ou admin). */
  showSearch?: boolean;
  /** Afficher les infobulles Wiki sur les en-têtes de colonnes (page accueil). */
  showWikiTooltips?: boolean;
}) {
  const playedSet = useMemo(() => new Set(countryIdsWithPlayer), [countryIdsWithPlayer]);
  const wikiAccueil = showWikiTooltips ? (
    <InfoTooltipWithWikiLink
      text="Colonnes de la table : pays, sphère, influence, PIB, population, stabilité. Les flèches vertes/rouges indiquent la variation par rapport au dernier enregistrement."
      wikiSectionId="accueil-colonnes"
      side="bottom"
    />
  ) : null;
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [adminSortKey, setAdminSortKey] = useState<AdminSortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [continentPendingId, setContinentPendingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const continentLabelById = useMemo(
    () => Object.fromEntries(continents.map((co) => [co.id, co.label_fr])),
    [continents]
  );

  const sortedRows = useMemo(() => {
    if (adminLayout) {
      let list = [...rows];
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        list = list.filter((row) => {
          const c = row.country;
          const name = (c.name ?? "").toLowerCase();
          const player = (playerNameByCountryId[c.id] ?? "").toLowerCase();
          const continent = (continentLabelById[c.continent_id ?? ""] ?? "").toLowerCase();
          return name.includes(q) || player.includes(q) || continent.includes(q);
        });
      }
      return list.sort((a, b) => {
        const va = getAdminSortValue(a, adminSortKey, playerNameByCountryId, continentLabelById);
        const vb = getAdminSortValue(b, adminSortKey, playerNameByCountryId, continentLabelById);
        return compare(va, vb, sortOrder === "asc");
      });
    }
    let list = [...rows];
    if (showSearch && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((row) => {
        const c = row.country;
        const name = (c.name ?? "").toLowerCase();
        const regime = (c.regime ?? "").toLowerCase();
        return name.includes(q) || regime.includes(q);
      });
    }
    return list.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      return compare(va, vb, sortOrder === "asc");
    });
  }, [rows, sortKey, adminSortKey, sortOrder, adminLayout, showSearch, searchQuery, playerNameByCountryId, continentLabelById]);

  function handleHeaderClick(key: SortKey) {
    if (sortKey === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  }

  function handleAdminHeaderClick(key: AdminSortKey) {
    if (adminSortKey === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setAdminSortKey(key);
      setSortOrder("asc");
    }
  }

  const panelStyle = {
    background: "var(--background-panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
  };

  if (adminLayout) {
    return (
      <div className="rounded-lg border" style={panelStyle}>
        <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
          <input
            type="search"
            placeholder="Rechercher par pays, joueur ou continent…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
            style={{ borderColor: "var(--border)" }}
            aria-label="Rechercher dans la liste des pays"
          />
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              {ADMIN_COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  className="p-3 font-medium text-[var(--foreground-muted)] cursor-pointer select-none hover:text-[var(--foreground)] hover:bg-[var(--background-elevated)]"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => handleAdminHeaderClick(key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {adminSortKey === key && (
                      <span className="text-[var(--accent)]" aria-hidden>
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              {showAiStatusColumn && (
                <th className="p-3 w-32 font-medium text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
                  Statut IA
                </th>
              )}
              {showModifierButton && (
                <th className="p-3 w-24 font-medium text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const { country: c } = row;
              const playerName = playerNameByCountryId[c.id];
              const isContinentPending = continentPendingId === c.id;
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
                          className="h-7 w-10 rounded object-cover pointer-events-none shrink-0"
                        />
                      ) : (
                        <div
                          className="h-7 w-10 rounded bg-[var(--background-elevated)] pointer-events-none shrink-0"
                          style={{ background: "var(--background-elevated)" }}
                        />
                      )}
                      <span className="pointer-events-none flex flex-col">
                        <span>{c.name}</span>
                        <span className="text-xs font-normal text-[var(--foreground-muted)]">{c.regime ?? "—"}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="p-3 text-[var(--foreground)]">
                    {playerName ?? "—"}
                  </td>
                  <td className="p-3">
                    <select
                      value={c.continent_id ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        const continentId = v === "" ? null : v;
                        if (updateCountryContinentAction) {
                          setContinentPendingId(c.id);
                          startTransition(() => {
                            updateCountryContinentAction(c.id, continentId).finally(() => setContinentPendingId(null));
                          });
                        }
                      }}
                      disabled={isContinentPending}
                      className="rounded border bg-[var(--background-elevated)] px-2 py-1 text-sm text-[var(--foreground)] min-w-[8rem]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <option value="">—</option>
                      {continents.map((co) => (
                        <option key={co.id} value={co.id}>
                          {co.label_fr}
                        </option>
                      ))}
                    </select>
                  </td>
                  {showAiStatusColumn && (
                    <td className="p-3">
                      {playedSet.has(c.id) ? (
                        <span className="text-sm text-[var(--foreground-muted)]" title="Pays assigné à un joueur">
                          {playerName ?? "Joué"}
                        </span>
                      ) : (
                        <select
                          value={c.ai_status ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            const aiStatus = v === "major" || v === "minor" ? v : null;
                            if (updateAiStatusAction) {
                              setPendingId(c.id);
                              startTransition(() => {
                                updateAiStatusAction(c.id, aiStatus).finally(() => setPendingId(null));
                              });
                            }
                          }}
                          disabled={isPending && pendingId === c.id}
                          className="rounded border bg-[var(--background-elevated)] px-2 py-1 text-sm text-[var(--foreground)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <option value="">—</option>
                          <option value="major">Majeur</option>
                          <option value="minor">Mineur</option>
                        </select>
                      )}
                    </td>
                  )}
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
      </div>
    );
  }

  return (
    <div className={showSearch ? "rounded-lg border" : "overflow-x-auto rounded-lg border"} style={panelStyle}>
      {showSearch && (
        <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
          <input
            type="search"
            placeholder="Rechercher par pays ou régime…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
            style={{ borderColor: "var(--border)" }}
            aria-label="Rechercher dans la liste des pays"
          />
        </div>
      )}
      <div className={showSearch ? "overflow-x-auto" : ""}>
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: "var(--border)" }}>
            <th
              className="p-3 font-medium text-[var(--foreground-muted)] cursor-pointer select-none hover:text-[var(--foreground)] hover:bg-[var(--background-elevated)]"
              style={{ borderColor: "var(--border)" }}
              onClick={() => handleHeaderClick("name")}
            >
              <span className="inline-flex items-center gap-1">
                Pays
                {showWikiTooltips && wikiAccueil}
                {sortKey === "name" && (
                  <span className="text-[var(--accent)]" aria-hidden>
                    {sortOrder === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </span>
            </th>
            <th className="p-3 w-40 font-medium text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
              Sphère
            </th>
            {COLUMNS.filter((c) => c.key !== "name").map(({ key, label }) => (
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
            {showAiStatusColumn && (
              <th className="p-3 w-32 font-medium text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
                Statut IA
              </th>
            )}
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
                      className="h-7 w-10 rounded object-cover pointer-events-none shrink-0"
                    />
                  ) : (
                    <div
                      className="h-7 w-10 rounded bg-[var(--background-elevated)] pointer-events-none shrink-0"
                      style={{ background: "var(--background-elevated)" }}
                    />
                  )}
                  <span className="pointer-events-none flex flex-col">
                    <span>{c.name}</span>
                    <span className="text-xs font-normal text-[var(--foreground-muted)]">{c.regime ?? "—"}</span>
                  </span>
                </Link>
              </td>
              <SphereCell sphere={row.sphere} />
              <td className="p-3">
                <span className="font-mono tabular-nums text-[var(--foreground)]">
                  {row.influence != null && !Number.isNaN(row.influence) ? Number(row.influence).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "—"}
                </span>
              </td>
              <NumericVariationCell
                current={c.gdp}
                previous={prev?.gdp}
                formatValue={formatGdp}
                formatDiff={formatGdp}
              />
              <NumericVariationCell
                current={c.population}
                previous={prev?.population}
                formatValue={formatPopulation}
                formatDiff={formatPopulation}
              />
              <StatCell current={c.stability} previous={prev?.stability} />
              {showAiStatusColumn && (
                <td className="p-3">
                  {playedSet.has(c.id) ? (
                    <span className="text-sm text-[var(--foreground-muted)]" title="Pays assigné à un joueur">
                      Joué
                    </span>
                  ) : (
                    <select
                      value={c.ai_status ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        const aiStatus = v === "major" || v === "minor" ? v : null;
                        if (updateAiStatusAction) {
                          setPendingId(c.id);
                          startTransition(() => {
                            updateAiStatusAction(c.id, aiStatus).finally(() => setPendingId(null));
                          });
                        }
                      }}
                      disabled={isPending && pendingId === c.id}
                      className="rounded border bg-[var(--background-elevated)] px-2 py-1 text-sm text-[var(--foreground)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <option value="">—</option>
                      <option value="major">Majeur</option>
                      <option value="minor">Mineur</option>
                    </select>
                  )}
                </td>
              )}
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

function SphereCell({ sphere }: { sphere?: SphereEntry[] }) {
  if (!sphere?.length) return <td className="p-3 text-[var(--foreground-muted)]">—</td>;
  return (
    <td className="p-3">
      <span className="inline-flex flex-wrap items-center gap-1">
        {sphere.map((entry) => {
          const tooltip = entry.is_annexed
            ? "Annexé"
            : entry.share_pct >= 100
              ? "Occupé"
              : `Contrôle ${entry.share_pct} %`;
          return (
            <Link
              key={entry.slug}
              href={`/pays/${entry.slug}`}
              title={`${entry.name} – ${tooltip}`}
              className="inline-block rounded border border-transparent transition-opacity hover:opacity-90 focus:opacity-90"
              style={{ borderColor: "var(--border-muted)" }}
            >
              {entry.flag_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.flag_url}
                  alt=""
                  width={28}
                  height={19}
                  className="h-5 w-7 rounded object-cover"
                />
              ) : (
                <div
                  className="h-5 w-7 rounded bg-[var(--background-elevated)]"
                  title={tooltip}
                />
              )}
            </Link>
          );
        })}
      </span>
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
