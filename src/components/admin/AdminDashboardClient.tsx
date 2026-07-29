"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ADMIN_NAVIGATION_GROUPS,
  filterAdminNavigation,
  type AdminCountKey,
} from "@/lib/adminNavigation";

export function AdminDashboardClient({
  counts,
}: {
  counts: Record<AdminCountKey, number>;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterAdminNavigation(query), [query]);

  return (
    <div className="space-y-7">
      <div className="max-w-2xl">
        <label htmlFor="admin-dashboard-search" className="mb-2 block text-sm font-medium text-[var(--foreground)]">
          Rechercher dans l’administration
        </label>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]">
            ⌕
          </span>
          <input
            id="admin-dashboard-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pays, règles, joueurs, Discord…"
            className="min-h-12 w-full rounded-lg border bg-[var(--background-panel)] py-3 pl-10 pr-12 text-base text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
            style={{ borderColor: "var(--border)" }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Effacer la recherche"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            >
              ×
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]" aria-live="polite">
          {results.length} accès {results.length > 1 ? "trouvés" : "trouvé"}
        </p>
      </div>

      {ADMIN_NAVIGATION_GROUPS.map((group) => {
        const groupItems = results.filter((item) => item.group === group.id);
        if (groupItems.length === 0) return null;

        return (
          <section key={group.id} aria-labelledby={`admin-group-${group.id}`}>
            <h2 id={`admin-group-${group.id}`} className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--foreground-muted)]">
              {group.label}
            </h2>
            <div
              className="divide-y overflow-hidden rounded-xl border"
              style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}
            >
              {groupItems.map((item) => {
                const count = item.countKey ? counts[item.countKey] : null;
                const countLabel =
                  count === null
                    ? null
                    : `${count} ${count === 1 ? item.countSingular : item.countPlural}`;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex min-h-20 items-start gap-3 px-4 py-4 transition-colors hover:bg-[var(--background-elevated)] focus-visible:bg-[var(--background-elevated)] sm:items-center"
                    style={{ borderColor: "var(--border-muted)" }}
                  >
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--background-elevated)] text-lg"
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-[var(--foreground)]">{item.label}</span>
                        {countLabel && (
                          <span className="text-sm font-medium tabular-nums text-[var(--accent)]">
                            {countLabel}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-[var(--foreground-muted)]">
                        {item.description}
                      </span>
                    </span>
                    <span aria-hidden className="mt-2 shrink-0 text-[var(--foreground-muted)] transition-transform group-hover:translate-x-0.5 sm:mt-0">
                      →
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {results.length === 0 && (
        <div className="rounded-xl border px-5 py-8 text-center" style={{ borderColor: "var(--border)" }}>
          <p className="font-medium text-[var(--foreground)]">Aucun accès ne correspond à « {query} ».</p>
          <button type="button" onClick={() => setQuery("")} className="mt-3 text-sm font-medium text-[var(--accent)] hover:underline">
            Afficher toute l’administration
          </button>
        </div>
      )}
    </div>
  );
}
