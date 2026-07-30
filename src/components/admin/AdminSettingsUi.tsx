"use client";

import type { CSSProperties, ReactNode } from "react";

export type AdminSectionNavItem = {
  id: string;
  label: string;
  description?: string;
  count?: number;
};

export function AdminAnchorNav({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: `#${string}`; label: string }>;
}) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-y py-1" style={{ borderColor: "var(--border)" }}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="inline-flex min-h-10 min-w-max items-center rounded-lg px-3 text-sm font-medium text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)]"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function AdminSectionNav({
  label,
  items,
  activeId,
  onSelect,
}: {
  label: string;
  items: AdminSectionNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label={label} className="lg:sticky lg:top-4 lg:self-start">
      <label className="block lg:hidden">
        <span className="sr-only">{label}</span>
        <select
          value={activeId}
          onChange={(event) => onSelect(event.target.value)}
          className="min-h-11 w-full rounded-lg border bg-[var(--background-panel)] px-3 text-sm font-semibold text-[var(--foreground)]"
          style={{ borderColor: "var(--border)" }}
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}{typeof item.count === "number" ? ` (${item.count})` : ""}
            </option>
          ))}
        </select>
      </label>
      <div
        className="hidden lg:block lg:space-y-0.5"
        style={{ borderColor: "var(--border)" }}
      >
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? "true" : undefined}
              className={`min-h-11 min-w-max rounded-lg px-3 py-2 text-left transition-colors lg:block lg:w-full lg:min-w-0 ${
                active
                  ? "bg-[var(--accent)] text-[#08110c]"
                  : "text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)]"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{item.label}</span>
                {typeof item.count === "number" ? (
                  <span className={`hidden text-xs tabular-nums lg:inline ${active ? "text-[#08110c]/70" : "text-[var(--foreground-muted)]"}`}>{item.count}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function AdminParameterTable({
  label,
  columns,
  rows,
}: {
  label: string;
  columns: string[];
  rows: Array<{
    key: string;
    title: ReactNode;
    description?: ReactNode;
    cells: ReactNode[];
  }>;
}) {
  const style = {
    "--admin-parameter-columns": `minmax(12rem, 1.6fr) repeat(${columns.length}, minmax(7rem, 0.8fr))`,
    borderColor: "var(--border)",
    background: "var(--background-elevated)",
  } as CSSProperties;

  return (
    <div role="table" aria-label={label} className="overflow-hidden rounded-xl border" style={style}>
      <div
        role="row"
        className="hidden border-b px-3 py-2 text-xs font-medium text-[var(--foreground-muted)] xl:grid xl:gap-4 xl:[grid-template-columns:var(--admin-parameter-columns)]"
        style={{ borderColor: "var(--border-muted)", background: "var(--background)" }}
      >
        <span role="columnheader">Réglage</span>
        {columns.map((column) => (
          <span key={column} role="columnheader">{column}</span>
        ))}
      </div>
      <div role="rowgroup" className="divide-y divide-[var(--border-muted)]">
        {rows.map((row) => (
          <div
            key={row.key}
            role="row"
            className="grid gap-x-4 gap-y-2 px-3 py-3 sm:grid-cols-2 xl:items-center xl:py-2.5 xl:[grid-template-columns:var(--admin-parameter-columns)]"
          >
            <div role="rowheader" className="min-w-0 sm:col-span-2 xl:col-span-1">
              <p className="text-sm font-medium text-[var(--foreground)]">{row.title}</p>
              {row.description ? (
                <p className="mt-0.5 text-xs leading-snug text-[var(--foreground-muted)]">{row.description}</p>
              ) : null}
            </div>
            {columns.map((column, index) => (
              <div key={column} role="cell" className="min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-[var(--foreground-muted)] xl:hidden">
                  {column}
                </span>
                {row.cells[index] ?? <span className="text-sm text-[var(--foreground-muted)]">—</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminSettingsGuide({
  purpose,
  impact,
  check,
  warning,
}: {
  purpose: string;
  impact: string;
  check: string;
  warning?: string;
}) {
  return (
    <details
      className="group w-fit max-w-full"
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
        <svg aria-hidden className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        Aide et précautions
        <span aria-hidden className="text-xs transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div
        className="mt-1 max-w-3xl rounded-xl border p-3"
        style={{ background: "var(--background-elevated)", borderColor: "var(--border)" }}
      >
        <p className="mb-3 max-w-[72ch] text-sm leading-snug text-[var(--foreground)]">{purpose}</p>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="font-medium text-[var(--foreground)]">Ce que cela change</dt>
          <dd className="mt-0.5 leading-snug text-[var(--foreground-muted)]">{impact}</dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--foreground)]">Avant d’enregistrer</dt>
          <dd className="mt-0.5 leading-snug text-[var(--foreground-muted)]">{check}</dd>
        </div>
        </dl>
        {warning ? (
          <p className="mt-3 rounded-lg bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-3 py-2 text-sm leading-snug text-[var(--foreground)]">
            <span aria-hidden>⚠️ </span>{warning}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function AdminImpactPreview({
  title = "Aperçu",
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <aside
      className="rounded-xl border p-3"
      style={{ background: "var(--background-elevated)", borderColor: "var(--border)" }}
    >
      <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      {description ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">{description}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </aside>
  );
}

export function AdminSaveBar({
  dirtyCount,
  saving,
  onSave,
  onReset,
  error,
  success,
  noun = "réglage",
  reviewItems = [],
  saveLabel = "Enregistrer",
  placement = "bar",
}: {
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  error?: string | null;
  success?: string | null;
  noun?: string;
  reviewItems?: Array<{ key: string; label: string; detail?: string }>;
  saveLabel?: string;
  placement?: "bar" | "rail";
}) {
  const plural = dirtyCount > 1 ? "s" : "";
  const rail = placement === "rail";
  if (dirtyCount === 0 && !saving && !error && !success) return null;
  return (
    <div
      className={
        rail
          ? "rounded-xl border p-3"
          : "sticky bottom-2 z-40 rounded-xl border px-3 py-2 shadow-[0_12px_28px_rgba(0,0,0,0.32)]"
      }
      style={{ background: "var(--background-elevated)", borderColor: "var(--border)" }}
    >
      {dirtyCount > 0 && reviewItems.length > 0 ? (
        <details className="group mb-2 border-b pb-2" style={{ borderColor: "var(--border-muted)" }}>
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
            <span>Vérifier les changements</span>
            <svg
              aria-hidden
              className="h-4 w-4 text-[var(--foreground-muted)] transition-transform group-open:rotate-180"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <ul className={`${rail ? "max-h-[45vh]" : "max-h-44"} space-y-1 overflow-y-auto pb-1 pr-1`}>
            {reviewItems.map((item) => (
              <li key={item.key} className={`flex flex-col rounded-lg bg-[var(--background-panel)] px-3 py-2 ${rail ? "" : "sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"}`}>
                <span className="text-sm font-medium text-[var(--foreground)]">{item.label}</span>
                {item.detail ? (
                  <span className={`text-xs leading-snug text-[var(--foreground-muted)] ${rail ? "mt-0.5" : "sm:text-right"}`}>{item.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className={`flex flex-wrap gap-3 ${rail ? "flex-col" : "items-center justify-between"}`}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--foreground)]">
            {dirtyCount > 0
              ? `${dirtyCount} ${noun}${plural} modifié${plural}`
              : "Tout est enregistré"}
          </p>
          <div aria-live="polite" className="mt-0.5 min-h-4 text-xs leading-snug">
            {error ? <p role="alert" className="text-[var(--danger)]">{error}</p> : null}
            {!error && success ? <p className="text-[var(--accent)]">{success}</p> : null}
          </div>
        </div>
        <div className={`flex w-full gap-2 ${rail ? "flex-col" : "sm:w-auto"}`}>
          <button
            type="button"
            onClick={onReset}
            disabled={dirtyCount === 0 || saving}
            className={`min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background-panel)] disabled:cursor-not-allowed disabled:opacity-50 ${rail ? "" : "sm:flex-none"}`}
            style={{ borderColor: "var(--border)" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={dirtyCount === 0 || saving}
            className={`min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[#0f1419] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${rail ? "" : "sm:flex-none"}`}
          >
            {saving ? "Enregistrement…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
