"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatNumber, formatGdp, formatPopulation } from "@/lib/format";
import { InfoTooltipWithWikiLink } from "@/components/ui/InfoTooltipWithWikiLink";

const flagLoader = ({ src }: { src: string }) => src;

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
  { key: "influence", label: "Influence totale" },
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
  glassContext = false,
  showAssignmentFilter = false,
  assignedCountryIds = [],
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
  /** Style glass (fond image accueil) : panneau flouté, texte blanc. */
  glassContext?: boolean;
  /** Afficher le filtre Tous / Assignés uniquement (masquer les pays sans joueur ni IA). */
  showAssignmentFilter?: boolean;
  /** Ids des pays assignés (joueur ou IA). Utilisé quand showAssignmentFilter est true. */
  assignedCountryIds?: string[];
}) {
  const playedSet = useMemo(() => new Set(countryIdsWithPlayer), [countryIdsWithPlayer]);
  const wikiAccueil = showWikiTooltips ? (
    <InfoTooltipWithWikiLink
      text="Colonnes de la table : pays, sphère, influence totale (influence propre + bonus de sphère), PIB, population, stabilité. Les flèches vertes/rouges indiquent la variation par rapport au dernier enregistrement."
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
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned_only">("all");
  const [isPending, startTransition] = useTransition();

  const assignedSet = useMemo(() => new Set(assignedCountryIds), [assignedCountryIds]);
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
    if (showAssignmentFilter && assignmentFilter === "assigned_only") {
      list = list.filter((row) => assignedSet.has(row.country.id));
    }
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
  }, [rows, sortKey, adminSortKey, sortOrder, adminLayout, showSearch, showAssignmentFilter, assignmentFilter, assignedSet, searchQuery, playerNameByCountryId, continentLabelById]);

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

  const glassPanelClass = "rounded-2xl border border-white/25 bg-white/15 shadow-xl backdrop-blur-xl";
  const glassBorderClass = "border-white/20";
  const glassMutedClass = "text-white/85";
  const panelStyle = glassContext
    ? undefined
    : { background: "var(--background-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)" };

  if (adminLayout) {
    return (
      <div className="rounded-lg border" style={panelStyle}>
        <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
          <input
            type="search"
            placeholder="Rechercher par pays, joueur ou continent…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full max-w-md rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
                  className="font-medium text-[var(--foreground-muted)]"
                  style={{ borderColor: "var(--border)" }}
                  aria-sort={adminSortKey === key ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => handleAdminHeaderClick(key)}
                    className="flex min-h-11 w-full items-center gap-1 p-3 text-left hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                  >
                    {label}
                    {adminSortKey === key && (
                      <span className="text-[var(--accent)]" aria-hidden>
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
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
                      href={adminLayout ? `/admin/pays/${c.id}` : `/pays/${c.slug}`}
                      className="relative z-[1] flex min-h-11 cursor-pointer items-center gap-3 font-medium text-[var(--foreground)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
                      aria-label={`Continent de ${c.name}`}
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
                      className="min-h-11 min-w-[8rem] rounded border bg-[var(--background-elevated)] px-2 py-1 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
                          aria-label={`Statut IA de ${c.name}`}
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
                          className="min-h-11 rounded border bg-[var(--background-elevated)] px-2 py-1 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
                        className="inline-flex min-h-11 items-center rounded px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warning)]"
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

  const tableWrapperClass = glassContext
    ? `${glassPanelClass} overflow-hidden`
    : showSearch ? "rounded-lg border" : "overflow-x-auto rounded-lg border";
  const theadBorder = glassContext ? glassBorderClass : "";
  const thClass = glassContext
    ? `font-medium ${glassMutedClass} border-b ${glassBorderClass}`
    : "font-medium text-[var(--foreground-muted)]";
  const thButtonClass = glassContext
    ? "flex min-h-11 items-center gap-1 text-left hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
    : "flex min-h-11 items-center gap-1 text-left hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]";
  const thStyle = glassContext ? undefined : { borderColor: "var(--border)" };
  const sortArrowClass = glassContext ? "text-white" : "text-[var(--accent)]";
  const trClass = glassContext
    ? `border-b transition-colors hover:bg-white/10 ${glassBorderClass}`
    : "border-b transition-colors hover:bg-[var(--background-elevated)]";
  const trStyle = glassContext ? undefined : { borderColor: "var(--border-muted)" };

  return (
    <div className={showSearch ? tableWrapperClass : `overflow-x-auto ${tableWrapperClass}`} style={panelStyle}>
      {showSearch && (
        <div className={`p-3 border-b ${glassContext ? `border-white/20 ${glassMutedClass}` : ""}`} style={!glassContext ? { borderColor: "var(--border)" } : undefined}>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              placeholder="Rechercher par pays ou régime…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={glassContext
                ? "min-h-11 w-full max-w-md rounded-xl border border-white/30 bg-white/20 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
                : "min-h-11 w-full max-w-md rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"}
              style={!glassContext ? { borderColor: "var(--border)" } : undefined}
              aria-label="Rechercher dans la liste des pays"
            />
            {showAssignmentFilter && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--foreground-muted)]">Afficher :</span>
                <button
                  type="button"
                  onClick={() => setAssignmentFilter("all")}
                  aria-pressed={assignmentFilter === "all"}
                  className={`min-h-11 rounded border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${assignmentFilter === "all"
                    ? glassContext ? "border-white/50 bg-white/25 text-white" : "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : glassContext ? "border-white/30 text-white/80 hover:bg-white/15" : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--border-muted)] hover:text-[var(--foreground)]"}`}
                  style={assignmentFilter !== "all" && !glassContext ? { borderColor: "var(--border)" } : undefined}
                >
                  Tous
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentFilter("assigned_only")}
                  aria-pressed={assignmentFilter === "assigned_only"}
                  className={`min-h-11 rounded border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${assignmentFilter === "assigned_only"
                    ? glassContext ? "border-white/50 bg-white/25 text-white" : "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : glassContext ? "border-white/30 text-white/80 hover:bg-white/15" : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--border-muted)] hover:text-[var(--foreground)]"}`}
                  style={assignmentFilter !== "assigned_only" && !glassContext ? { borderColor: "var(--border)" } : undefined}
                >
                  Assignés uniquement
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className={showSearch ? "overflow-x-auto" : ""}>
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead>
          <tr className={`border-b ${theadBorder}`} style={!glassContext ? { borderColor: "var(--border)" } : undefined}>
            <th
              className={thClass}
              style={thStyle}
              aria-sort={sortKey === "name" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
            >
              <div className="flex items-center gap-1 px-3">
                <button
                  type="button"
                  onClick={() => handleHeaderClick("name")}
                  className={`${thButtonClass} flex-1 py-2`}
                >
                  Pays
                  {sortKey === "name" && (
                    <span className={sortArrowClass} aria-hidden>
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
                {showWikiTooltips && wikiAccueil}
              </div>
            </th>
            <th className={glassContext ? `p-3 w-40 font-medium ${glassMutedClass} border-b ${glassBorderClass}` : "p-3 w-40 font-medium text-[var(--foreground-muted)]"} style={thStyle}>
              Sphère
            </th>
            {COLUMNS.filter((c) => c.key !== "name").map(({ key, label }) => (
              <th
                key={key}
                className={thClass}
                style={thStyle}
                aria-sort={sortKey === key ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
              >
                <button
                  type="button"
                  onClick={() => handleHeaderClick(key)}
                  className={`${thButtonClass} w-full px-3 py-2`}
                >
                  {label}
                  {sortKey === key && (
                    <span className={sortArrowClass} aria-hidden>
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              </th>
            ))}
            {showAiStatusColumn && (
              <th className={glassContext ? `p-3 w-32 font-medium ${glassMutedClass}` : "p-3 w-32 font-medium text-[var(--foreground-muted)]"} style={thStyle}>
                Statut IA
              </th>
            )}
            {showModifierButton && (
              <th className={glassContext ? `p-3 w-24 font-medium ${glassMutedClass}` : "p-3 w-24 font-medium text-[var(--foreground-muted)]"} style={thStyle}>
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const { country: c, prev } = row;
            return (
            <tr key={c.id} className={trClass} style={trStyle}>
              <td className="p-3 relative align-middle">
                <Link
                  href={`/pays/${c.slug}`}
                  className={`relative z-[1] flex min-h-11 cursor-pointer items-center gap-3 font-medium focus-visible:outline-none focus-visible:ring-2 ${glassContext ? "text-white hover:text-white/95 focus-visible:ring-white/70" : "text-[var(--foreground)] hover:text-[var(--accent)] focus-visible:ring-[var(--accent)]"}`}
                  style={{ isolation: "isolate" }}
                >
                  {c.flag_url ? (
                    <Image
                      loader={flagLoader}
                      unoptimized
                      src={c.flag_url}
                      alt=""
                      width={40}
                      height={27}
                      className="h-7 w-10 rounded object-cover pointer-events-none shrink-0"
                    />
                  ) : (
                    <div
                      className={`h-7 w-10 rounded pointer-events-none shrink-0 ${glassContext ? "bg-white/20" : ""}`}
                      style={!glassContext ? { background: "var(--background-elevated)" } : undefined}
                    />
                  )}
                  <span className="pointer-events-none flex flex-col">
                    <span>{c.name}</span>
                    <span className={`text-xs font-normal ${glassContext ? glassMutedClass : "text-[var(--foreground-muted)]"}`}>{c.regime ?? "—"}</span>
                  </span>
                </Link>
              </td>
              <SphereCell sphere={row.sphere} glass={glassContext} />
              <td className="p-3">
                <span className={`font-mono tabular-nums ${glassContext ? "text-white" : "text-[var(--foreground)]"}`}>
                  {formatNumber(row.influence)}
                </span>
              </td>
              <NumericVariationCell
                current={c.gdp}
                previous={prev?.gdp}
                formatValue={formatGdp}
                formatDiff={formatGdp}
                glass={glassContext}
              />
              <NumericVariationCell
                current={c.population}
                previous={prev?.population}
                formatValue={formatPopulation}
                formatDiff={formatPopulation}
                glass={glassContext}
              />
              <StatCell current={c.stability} previous={prev?.stability} glass={glassContext} />
              {showAiStatusColumn && (
                <td className="p-3">
                  {playedSet.has(c.id) ? (
                    <span className={glassContext ? glassMutedClass : "text-sm text-[var(--foreground-muted)]"} title="Pays assigné à un joueur">
                      Joué
                    </span>
                  ) : (
                    <select
                      aria-label={`Statut IA de ${c.name}`}
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
                      className={glassContext
                        ? "min-h-11 rounded-xl border border-white/30 bg-white/20 px-2 py-1 text-sm text-white focus:border-white/50 focus:outline-none"
                        : "min-h-11 rounded border bg-[var(--background-elevated)] px-2 py-1 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"}
                      style={!glassContext ? { borderColor: "var(--border)" } : undefined}
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
                    className="inline-flex min-h-11 items-center rounded px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warning)]"
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
  glass = false,
}: {
  current: number | null | undefined;
  previous?: number | string | null;
  formatValue: (n: number) => string;
  formatDiff?: (n: number) => string;
  glass?: boolean;
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
  const color = glass ? (isUp ? "#86efac" : isDown ? "#fca5a5" : undefined) : (isUp ? "var(--accent)" : isDown ? "var(--danger)" : undefined);

  return (
    <td className="p-3">
      <span className={`font-mono tabular-nums ${glass ? "text-white" : "text-[var(--foreground)]"}`}>
        {num != null ? formatValue(num) : "—"}
      </span>
      {diff != null && diff !== 0 && (
        <span
          className="ml-1 font-mono text-xs"
          style={{ color }}
          title={isUp ? "En hausse" : "En baisse"}
        >
          ({isUp ? "+" : ""}{formatDelta(diff)})
        </span>
      )}
    </td>
  );
}

function SphereCell({ sphere, glass = false }: { sphere?: SphereEntry[]; glass?: boolean }) {
  if (!sphere?.length) return <td className={`p-3 ${glass ? "text-white/85" : "text-[var(--foreground-muted)]"}`}>—</td>;
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
              className={`inline-flex h-11 w-11 items-center justify-center rounded border border-transparent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 ${glass ? "border-white/25 focus-visible:ring-white/70" : "focus-visible:ring-[var(--accent)]"}`}
              style={!glass ? { borderColor: "var(--border-muted)" } : undefined}
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
                  className={`h-5 w-7 rounded ${glass ? "bg-white/20" : ""}`}
                  style={!glass ? { background: "var(--background-elevated)" } : undefined}
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
  glass = false,
}: {
  current: number | null | undefined;
  previous?: number | string | null;
  glass?: boolean;
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
  const color = glass ? (isUp ? "#86efac" : isDown ? "#fca5a5" : undefined) : (isUp ? "var(--accent)" : isDown ? "var(--danger)" : undefined);

  return (
    <td className="p-3">
      <span className={`font-mono tabular-nums ${glass ? "text-white" : "text-[var(--foreground)]"}`}>
        {formatNumber(num)}
      </span>
      {diffFormatted != null && diffFormatted !== 0 && (
        <span
          className="ml-1 font-mono text-xs"
          style={{ color }}
          title={isUp ? "En hausse" : "En baisse"}
        >
          ({isUp ? "+" : ""}{formatNumber(diffFormatted)})
        </span>
      )}
    </td>
  );
}
