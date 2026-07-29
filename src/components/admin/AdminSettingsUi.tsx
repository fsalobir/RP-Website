"use client";

import type { CSSProperties, ReactNode } from "react";

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
        className="hidden border-b px-3 py-2 text-xs font-medium text-[var(--foreground-muted)] lg:grid lg:gap-4 lg:[grid-template-columns:var(--admin-parameter-columns)]"
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
            className="grid gap-x-4 gap-y-2 px-3 py-3 sm:grid-cols-2 lg:items-center lg:py-2.5 lg:[grid-template-columns:var(--admin-parameter-columns)]"
          >
            <div role="rowheader" className="min-w-0 sm:col-span-2 lg:col-span-1">
              <p className="text-sm font-medium text-[var(--foreground)]">{row.title}</p>
              {row.description ? (
                <p className="mt-0.5 text-xs leading-snug text-[var(--foreground-muted)]">{row.description}</p>
              ) : null}
            </div>
            {columns.map((column, index) => (
              <div key={column} role="cell" className="min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-[var(--foreground-muted)] lg:hidden">
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
      className="group rounded-xl border"
      style={{ background: "var(--background-elevated)", borderColor: "var(--border)" }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="font-medium text-[var(--foreground)]">À savoir avant de modifier</span>
          <span className="ml-2 hidden text-xs leading-snug text-[var(--foreground-muted)] md:inline">{purpose}</span>
        </span>
        <span aria-hidden className="shrink-0 text-[var(--foreground-muted)] transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t px-3 py-3" style={{ borderColor: "var(--border-muted)" }}>
        <p className="max-w-[72ch] text-sm leading-snug text-[var(--foreground)] md:hidden">{purpose}</p>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="font-medium text-[var(--foreground)]">Impact visible</dt>
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
}: {
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  error?: string | null;
  success?: string | null;
  noun?: string;
}) {
  const plural = dirtyCount > 1 ? "s" : "";
  return (
    <div
      className="sticky bottom-2 z-40 rounded-xl border px-3 py-2 shadow-[0_12px_28px_rgba(0,0,0,0.32)]"
      style={{ background: "var(--background-elevated)", borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--foreground)]">
            {dirtyCount > 0
              ? `${dirtyCount} ${noun}${plural} modifié${plural}`
              : "Tout est enregistré"}
          </p>
          <div aria-live="polite" className="mt-0.5 min-h-4 text-xs leading-snug">
            {error ? <p role="alert" className="text-[var(--danger)]">{error}</p> : null}
            {!error && success ? <p className="text-[var(--accent)]">{success}</p> : null}
            {!error && !success && dirtyCount > 0 ? (
              <p className="text-[var(--foreground-muted)]">Vérifiez l’aperçu avant d’appliquer ces changements.</p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onReset}
            disabled={dirtyCount === 0 || saving}
            className="min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background-panel)] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            style={{ borderColor: "var(--border)" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={dirtyCount === 0 || saving}
            className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[#0f1419] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
