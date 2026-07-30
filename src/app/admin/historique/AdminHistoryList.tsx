"use client";

import { useMemo, useState, useTransition } from "react";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { restoreAdminChange } from "./actions";
import { formatNumber } from "@/lib/format";
import { matchesSearchText } from "@/lib/searchText";

export type AdminHistoryRow = {
  id: string;
  actorEmail: string;
  tableName: string;
  tableLabel: string;
  entityLabel: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
  revertedAt: string | null;
  canRestore: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  name_fr: "Nom",
  title: "Titre",
  slug: "Adresse",
  regime: "Régime",
  flag_url: "Drapeau",
  continent_id: "Continent",
  militarism: "Militarisme",
  industry: "Industrie",
  science: "Science",
  stability: "Stabilité",
  population: "Population",
  gdp: "PIB",
  growth: "Croissance",
  ai_status: "Statut IA",
  value: "Valeur",
  description: "Description",
  label_fr: "Libellé",
  cost: "Coût",
  params_schema: "Paramètres",
  budget_fraction: "Part du PIB",
  score: "Score",
  target_score: "Cible",
  balance: "Points d’action",
  country_id: "Pays",
  content: "Contenu",
  is_published: "Publication",
};

const IGNORED_FIELDS = new Set(["id", "created_at", "updated_at"]);

function formatValue(value: unknown): string {
  if (value == null || value === "") return "vide";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "object") return "configuration modifiée";
  const text = String(value);
  if (/^https?:\/\//.test(text)) return "fichier modifié";
  return text.length > 42 ? `${text.slice(0, 39)}…` : text;
}

function changedFields(row: AdminHistoryRow) {
  const before = row.beforeData ?? {};
  const after = row.afterData ?? {};
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((key) => !IGNORED_FIELDS.has(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function changeSummary(row: AdminHistoryRow): string {
  if (row.operation === "INSERT") return "Création";
  if (row.operation === "DELETE") return "Suppression";
  const fields = changedFields(row);
  if (fields.length === 0) return "Mise à jour";
  const visible = fields.slice(0, 2).map((key) => {
    const label = FIELD_LABELS[key] ?? key.replaceAll("_", " ");
    const before = row.beforeData?.[key];
    const after = row.afterData?.[key];
    if (typeof before === "object" || typeof after === "object" || key === "flag_url") {
      return label;
    }
    return `${label} : ${formatValue(before)} → ${formatValue(after)}`;
  });
  const remainder = fields.length - visible.length;
  return `${visible.join(" · ")}${remainder > 0 ? ` · +${remainder}` : ""}`;
}

export function AdminHistoryList({ rows }: { rows: AdminHistoryRow[] }) {
  const [query, setQuery] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [selected, setSelected] = useState<AdminHistoryRow | null>(null);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const tables = useMemo(
    () => Array.from(new Map(rows.map((row) => [row.tableName, row.tableLabel])).entries()),
    [rows]
  );
  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (tableFilter === "all" || row.tableName === tableFilter) &&
          matchesSearchText(query, [
            row.actorEmail,
            row.tableLabel,
            row.entityLabel,
            changeSummary(row),
          ])
      ),
    [query, rows, tableFilter]
  );

  function restore() {
    if (!selected) return;
    setNotice(null);
    startTransition(async () => {
      const result = await restoreAdminChange(selected.id);
      if (result.error) {
        setNotice({ type: "error", text: result.error });
        return;
      }
      setSelected(null);
      setNotice({ type: "success", text: "La valeur précédente a été restaurée." });
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-y py-3 sm:flex-row" style={{ borderColor: "var(--border)" }}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Rechercher dans l’historique</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pays, réglage ou administrateur…"
            className="min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)]"
            style={{ borderColor: "var(--border)" }}
          />
        </label>
        <label className="sm:w-64">
          <span className="sr-only">Filtrer par rubrique</span>
          <select
            value={tableFilter}
            onChange={(event) => setTableFilter(event.target.value)}
            className="min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)]"
            style={{ borderColor: "var(--border)" }}
          >
            <option value="all">Toutes les rubriques</option>
            {tables.map(([name, label]) => (
              <option key={name} value={name}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {notice ? (
        <p
          role={notice.type === "error" ? "alert" : "status"}
          className={`mt-3 border-y py-3 text-sm ${
            notice.type === "error" ? "text-[var(--danger)]" : "text-[var(--accent)]"
          }`}
          style={{ borderColor: "var(--border)" }}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="mt-3 divide-y border-y" style={{ borderColor: "var(--border)" }}>
        {visibleRows.map((row) => (
          <article key={row.id} className="grid gap-2 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
            <div className="text-sm text-[var(--foreground-muted)]">
              <time dateTime={row.createdAt}>
                {new Intl.DateTimeFormat("fr-FR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(row.createdAt))}
              </time>
              <p className="mt-0.5 truncate" title={row.actorEmail}>{row.actorEmail}</p>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="font-semibold text-[var(--foreground)]">{row.entityLabel}</h2>
                <span className="text-xs text-[var(--foreground-muted)]">{row.tableLabel}</span>
                {row.revertedAt ? (
                  <span className="text-xs font-medium text-[var(--accent)]">Restaurée</span>
                ) : null}
              </div>
              <p className="mt-0.5 break-words text-sm text-[var(--foreground-muted)]">
                {changeSummary(row)}
              </p>
            </div>
            <div className="sm:text-right">
              {row.canRestore && !row.revertedAt ? (
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="min-h-11 rounded-lg border px-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background-elevated)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  Restaurer
                </button>
              ) : (
                <span className="text-xs text-[var(--foreground-muted)]">
                  {row.operation === "INSERT" ? "Création" : row.operation === "DELETE" ? "Suppression" : ""}
                </span>
              )}
            </div>
          </article>
        ))}
        {visibleRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--foreground-muted)]">
            Aucune modification ne correspond à cette recherche.
          </p>
        ) : null}
      </div>

      <AdminConfirmDialog
        open={selected !== null}
        title="Restaurer la valeur précédente ?"
        consequence={
          selected
            ? `${selected.entityLabel} retrouvera uniquement les valeurs changées lors de cette modification. Une modification plus récente ne sera jamais écrasée.`
            : ""
        }
        confirmLabel="Restaurer"
        busy={isPending}
        onConfirm={restore}
        onClose={() => {
          if (!isPending) setSelected(null);
        }}
      />
    </>
  );
}
