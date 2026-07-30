"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatNumber, formatGdp, formatPopulation } from "@/lib/format";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { InfoTooltipWithWikiLink } from "@/components/ui/InfoTooltipWithWikiLink";
import { matchesSearchText } from "@/lib/searchText";

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
const ADMIN_PAGE_SIZE = 25;

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
type AdminStatusFilter = "all" | "played" | "ai" | "inactive";

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
  const [adminStatusFilter, setAdminStatusFilter] = useState<AdminStatusFilter>("all");
  const [adminPage, setAdminPage] = useState(1);
  const [editingAdminCountryId, setEditingAdminCountryId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const assignedSet = useMemo(() => new Set(assignedCountryIds), [assignedCountryIds]);
  const continentLabelById = useMemo(
    () => Object.fromEntries(continents.map((co) => [co.id, co.label_fr])),
    [continents]
  );

  const sortedRows = useMemo(() => {
    if (adminLayout) {
      let list = [...rows];
      if (adminStatusFilter === "played") {
        list = list.filter((row) => playedSet.has(row.country.id));
      } else if (adminStatusFilter === "ai") {
        list = list.filter((row) => !playedSet.has(row.country.id) && !!row.country.ai_status);
      } else if (adminStatusFilter === "inactive") {
        list = list.filter((row) => !playedSet.has(row.country.id) && !row.country.ai_status);
      }
      if (searchQuery.trim()) {
        list = list.filter((row) => {
          const c = row.country;
          return matchesSearchText(searchQuery, [
            c.name ?? "",
            c.regime ?? "",
            playerNameByCountryId[c.id] ?? "",
            continentLabelById[c.continent_id ?? ""] ?? "",
          ]);
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
      list = list.filter((row) => {
        const c = row.country;
        return matchesSearchText(searchQuery, [c.name ?? "", c.regime ?? ""]);
      });
    }
    return list.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      return compare(va, vb, sortOrder === "asc");
    });
  }, [rows, sortKey, adminSortKey, sortOrder, adminLayout, showSearch, showAssignmentFilter, assignmentFilter, adminStatusFilter, assignedSet, playedSet, searchQuery, playerNameByCountryId, continentLabelById]);

  const adminStatusCounts = useMemo(
    () => ({
      all: rows.length,
      played: rows.filter((row) => playedSet.has(row.country.id)).length,
      ai: rows.filter((row) => !playedSet.has(row.country.id) && !!row.country.ai_status).length,
      inactive: rows.filter((row) => !playedSet.has(row.country.id) && !row.country.ai_status).length,
    }),
    [rows, playedSet]
  );

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

  function handleAdminContinentChange(country: CountryRow, value: string) {
    if (!updateCountryContinentAction) return;
    const continentId = value === "" ? null : value;
    setContinentPendingId(country.id);
    setActionError(null);
    setActionSuccess(null);
    startTransition(() => {
      void updateCountryContinentAction(country.id, continentId)
        .then((result) => {
          if (result.error) setActionError(`${country.name} : ${result.error}`);
          else setActionSuccess(`Continent de ${country.name} enregistré.`);
        })
        .finally(() => setContinentPendingId(null));
    });
  }

  function handleAdminAiChange(country: CountryRow, value: string) {
    if (!updateAiStatusAction) return;
    const aiStatus = value === "major" || value === "minor" ? value : null;
    setPendingId(country.id);
    setActionError(null);
    setActionSuccess(null);
    startTransition(() => {
      void updateAiStatusAction(country.id, aiStatus)
        .then((result) => {
          if (result.error) setActionError(`${country.name} : ${result.error}`);
          else setActionSuccess(`Rôle automatique de ${country.name} enregistré.`);
        })
        .finally(() => setPendingId(null));
    });
  }

  const glassPanelClass = "rounded-2xl border border-white/25 bg-white/15 shadow-xl backdrop-blur-xl";
  const glassBorderClass = "border-white/20";
  const glassMutedClass = "text-white/85";
  const panelStyle = glassContext
    ? undefined
    : { background: "var(--background-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)" };

  if (adminLayout) {
    const adminPageCount = Math.max(1, Math.ceil(sortedRows.length / ADMIN_PAGE_SIZE));
    const effectiveAdminPage = Math.min(adminPage, adminPageCount);
    const visibleAdminRows = sortedRows.slice(
      (effectiveAdminPage - 1) * ADMIN_PAGE_SIZE,
      effectiveAdminPage * ADMIN_PAGE_SIZE
    );
    const adminFilters: Array<{ key: AdminStatusFilter; label: string }> = [
      { key: "all", label: "Tous" },
      { key: "played", label: "Joués" },
      { key: "ai", label: "Pilotés par l’IA" },
      { key: "inactive", label: "Sans gestion" },
    ];
    const editingCountry = editingAdminCountryId
      ? rows.find((row) => row.country.id === editingAdminCountryId)?.country ?? null
      : null;
    const editingCountryPlayer = editingCountry
      ? playerNameByCountryId[editingCountry.id]
      : null;
    const editingCountryIsPlayed = editingCountry
      ? playedSet.has(editingCountry.id)
      : false;
    const aiStatusLabel = (status: string | null | undefined) => {
      if (status === "major") return "Grande puissance";
      if (status === "minor") return "Puissance secondaire";
      return "Sans gestion automatique";
    };
    return (
      <section aria-label="Liste des pays" className="border-y" style={{ borderColor: "var(--border)" }}>
        <div className="border-b bg-[var(--background-panel)] p-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2" aria-label="Filtrer les pays">
              {adminFilters.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={adminStatusFilter === key}
                  onClick={() => {
                    setAdminStatusFilter(key);
                    setAdminPage(1);
                  }}
                  className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    adminStatusFilter === key
                      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {label} <span className="ml-1 opacity-70">{adminStatusCounts[key]}</span>
                </button>
              ))}
            </div>
          <input
            type="search"
              placeholder="Pays, joueur, régime ou continent…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setAdminPage(1);
            }}
              className="min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:max-w-md"
            style={{ borderColor: "var(--border)" }}
            aria-label="Rechercher dans la liste des pays"
          />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--foreground-muted)]">
            <span>{sortedRows.length} résultat{sortedRows.length > 1 ? "s" : ""}</span>
            <span>Page {effectiveAdminPage} sur {adminPageCount}</span>
          </div>
          {actionError && (
            <p role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-[var(--danger)]">
              {actionError}
            </p>
          )}
          {!actionError && actionSuccess && (
            <p aria-live="polite" className="mt-3 text-sm text-[var(--accent)]">{actionSuccess}</p>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
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
                    className="flex min-h-11 w-full items-center gap-1 p-2 text-left hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
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
                <th className="w-44 p-2 font-medium text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
                  Rôle sans joueur
                </th>
              )}
              {showModifierButton && (
                <th className="w-24 p-2 font-medium text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleAdminRows.map((row) => {
              const { country: c } = row;
              const playerName = playerNameByCountryId[c.id];
              return (
                <tr
                  key={c.id}
                  className="border-b transition-colors hover:bg-[var(--background-elevated)]"
                  style={{ borderColor: "var(--border-muted)" }}
                >
                  <td className="relative p-2 align-middle">
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
                  <td className="p-2 text-[var(--foreground)]">
                    {playerName ?? "—"}
                  </td>
                  <td className="p-2 text-[var(--foreground-muted)]">
                    {continentLabelById[c.continent_id ?? ""] ?? "Non renseigné"}
                  </td>
                  {showAiStatusColumn && (
                    <td className="p-2">
                      {playedSet.has(c.id) ? (
                        <span className="inline-flex rounded-md bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--accent)]">
                          Joué
                        </span>
                      ) : (
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
                            c.ai_status
                              ? "bg-blue-500/12 text-blue-200"
                              : "bg-[var(--background-elevated)] text-[var(--foreground-muted)]"
                          }`}
                        >
                          {aiStatusLabel(c.ai_status)}
                        </span>
                      )}
                    </td>
                  )}
                  {showModifierButton && (
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => setEditingAdminCountryId(c.id)}
                        className="inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Gérer
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {visibleAdminRows.length === 0 && (
              <tr>
                <td
                  colSpan={ADMIN_COLUMNS.length + Number(showAiStatusColumn) + Number(showModifierButton)}
                  className="p-8 text-center text-[var(--foreground-muted)]"
                >
                  Aucun pays ne correspond à cette recherche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        <div className="divide-y md:hidden" style={{ borderColor: "var(--border-muted)" }}>
          {visibleAdminRows.map(({ country: c }) => {
            const playerName = playerNameByCountryId[c.id];
            const isPlayed = playedSet.has(c.id);
            return (
              <article key={c.id} className="bg-[var(--background-panel)] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/admin/pays/${c.id}`}
                    className="flex min-w-0 items-center gap-3 font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    {c.flag_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.flag_url} alt="" className="h-8 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-8 w-12 shrink-0 rounded bg-[var(--background-elevated)]" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate">{c.name}</span>
                      <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs font-normal text-[var(--foreground-muted)]">
                        <span>{continentLabelById[c.continent_id ?? ""] ?? "Continent non renseigné"}</span>
                        <span aria-hidden>·</span>
                        <span className={isPlayed || c.ai_status ? "text-[var(--accent)]" : ""}>
                          {isPlayed ? playerName ?? "Pays joué" : aiStatusLabel(c.ai_status)}
                        </span>
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setEditingAdminCountryId(c.id)}
                    className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-lg border text-xl text-[var(--foreground-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    style={{ borderColor: "var(--border)" }}
                    aria-label={`Gérer ${c.name}`}
                  >
                    <span aria-hidden>›</span>
                  </button>
                </div>
              </article>
            );
          })}
          {visibleAdminRows.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--foreground-muted)]">
              Aucun pays ne correspond à cette recherche.
            </p>
          )}
        </div>

        {sortedRows.length > ADMIN_PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t p-3" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={() => setAdminPage((page) => Math.max(1, page - 1))}
              disabled={effectiveAdminPage === 1}
              className="min-h-11 rounded-lg border px-4 text-sm font-medium text-[var(--foreground)] disabled:opacity-40"
              style={{ borderColor: "var(--border)" }}
            >
              Précédent
            </button>
            <span className="text-sm text-[var(--foreground-muted)]">
              {Math.min((effectiveAdminPage - 1) * ADMIN_PAGE_SIZE + 1, sortedRows.length)}–
              {Math.min(effectiveAdminPage * ADMIN_PAGE_SIZE, sortedRows.length)} sur {sortedRows.length}
            </span>
            <button
              type="button"
              onClick={() => setAdminPage((page) => Math.min(adminPageCount, page + 1))}
              disabled={effectiveAdminPage === adminPageCount}
              className="min-h-11 rounded-lg border px-4 text-sm font-medium text-[var(--foreground)] disabled:opacity-40"
              style={{ borderColor: "var(--border)" }}
            >
              Suivant
            </button>
          </div>
        )}

        <AdminDialog
          open={Boolean(editingCountry)}
          onClose={() => setEditingAdminCountryId(null)}
          title={editingCountry ? `Gérer ${editingCountry.name}` : "Gérer le pays"}
          description={
            editingCountryIsPlayed
              ? `Assigné à ${editingCountryPlayer ?? "un joueur"}.`
              : "Définissez sa région et son comportement lorsqu’aucun joueur ne le contrôle."
          }
          size="sm"
          busy={Boolean(editingCountry && (
            continentPendingId === editingCountry.id
            || (isPending && pendingId === editingCountry.id)
          ))}
          actions={editingCountry ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setEditingAdminCountryId(null)}
                className="min-h-11 rounded-lg border px-4 text-sm font-medium text-[var(--foreground)]"
                style={{ borderColor: "var(--border)" }}
              >
                Fermer
              </button>
              <Link
                href={`/admin/pays/${editingCountry.id}`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#08110c]"
              >
                Ouvrir la fiche complète
              </Link>
            </div>
          ) : null}
        >
          {editingCountry ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-[var(--background-elevated)] p-3">
                {editingCountry.flag_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editingCountry.flag_url} alt="" className="h-10 w-16 rounded object-cover" />
                ) : (
                  <span className="h-10 w-16 rounded bg-[var(--background)]" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--foreground)]">{editingCountry.name}</p>
                  <p className="truncate text-sm text-[var(--foreground-muted)]">{editingCountry.regime ?? "Régime non renseigné"}</p>
                </div>
              </div>

              <label className="block text-sm font-medium text-[var(--foreground)]">
                Continent
                <select
                  aria-label={`Continent de ${editingCountry.name}`}
                  value={editingCountry.continent_id ?? ""}
                  onChange={(event) => handleAdminContinentChange(editingCountry, event.target.value)}
                  disabled={continentPendingId === editingCountry.id}
                  className="mt-1 min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <option value="">Non renseigné</option>
                  {continents.map((continent) => (
                    <option key={continent.id} value={continent.id}>{continent.label_fr}</option>
                  ))}
                </select>
              </label>

              {editingCountryIsPlayed ? (
                <div className="rounded-xl border px-3 py-3" style={{ borderColor: "var(--border)" }}>
                  <p className="text-sm font-semibold text-[var(--foreground)]">Contrôlé par un joueur</p>
                  <p className="mt-0.5 text-sm text-[var(--foreground-muted)]">{editingCountryPlayer ?? "Joueur assigné"}</p>
                </div>
              ) : showAiStatusColumn ? (
                <label className="block text-sm font-medium text-[var(--foreground)]">
                  Gestion automatique
                  <select
                    aria-label={`Rôle automatique de ${editingCountry.name} lorsqu’aucun joueur ne le contrôle`}
                    value={editingCountry.ai_status ?? ""}
                    onChange={(event) => handleAdminAiChange(editingCountry, event.target.value)}
                    disabled={isPending && pendingId === editingCountry.id}
                    className="mt-1 min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-[var(--foreground)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <option value="">Aucune gestion</option>
                    <option value="major">Grande puissance</option>
                    <option value="minor">Puissance secondaire</option>
                  </select>
                </label>
              ) : null}

              {actionError ? <p role="alert" className="text-sm text-[var(--danger)]">{actionError}</p> : null}
              {!actionError && actionSuccess ? <p role="status" className="text-sm text-[var(--accent)]">{actionSuccess}</p> : null}
            </div>
          ) : null}
        </AdminDialog>
      </section>
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
          <p className={`mt-2 text-xs sm:hidden ${glassContext ? "text-white/65" : "text-[var(--foreground-muted)]"}`}>
            Faites glisser le tableau pour voir toutes les colonnes.
          </p>
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
              <th className={glassContext ? `p-3 w-44 font-medium ${glassMutedClass}` : "p-3 w-44 font-medium text-[var(--foreground-muted)]"} style={thStyle}>
                Rôle sans joueur
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
                      aria-label={`Rôle automatique de ${c.name} lorsqu’aucun joueur ne le contrôle`}
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
                      <option value="">Aucun</option>
                      <option value="major">Grande puissance</option>
                      <option value="minor">Puissance secondaire</option>
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
          {sortedRows.length === 0 && (
            <tr>
              <td
                colSpan={6 + Number(showAiStatusColumn) + Number(showModifierButton)}
                className={`p-8 text-center ${glassContext ? "text-white/70" : "text-[var(--foreground-muted)]"}`}
              >
                Aucun pays ne correspond aux filtres choisis.
              </td>
            </tr>
          )}
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
