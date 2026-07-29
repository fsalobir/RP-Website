"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ADMIN_NAVIGATION_GROUPS,
  filterAdminNavigation,
} from "@/lib/adminNavigation";

export function AdminAccessMenu() {
  const [query, setQuery] = useState("");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const results = useMemo(() => filterAdminNavigation(query), [query]);

  function closeMenu() {
    detailsRef.current?.removeAttribute("open");
    setQuery("");
  }

  return (
    <details
      ref={detailsRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") closeMenu();
      }}
      className="shrink-0"
    >
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden>⌕</span>
        <span>Accès rapide</span>
        <span aria-hidden className="text-xs text-[var(--foreground-muted)]">▾</span>
      </summary>
      <div
        className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[70] mx-2 max-h-[min(70vh,36rem)] overflow-y-auto rounded-xl border p-2 shadow-[0_18px_48px_rgba(0,0,0,0.35)] sm:left-auto sm:right-4 sm:mx-0 sm:w-[30rem]"
        style={{ background: "var(--background-elevated)", borderColor: "var(--border)" }}
      >
        <label htmlFor="admin-quick-search" className="sr-only">Rechercher une page d’administration</label>
        <input
          id="admin-quick-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher une page…"
          className="mb-2 min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
          style={{ borderColor: "var(--border)" }}
        />

        <div className="space-y-3">
          {ADMIN_NAVIGATION_GROUPS.map((group) => {
            const groupItems = results.filter((item) => item.group === group.id);
            if (groupItems.length === 0) return null;

            return (
              <section key={group.id} aria-labelledby={`quick-group-${group.id}`}>
                <h2 id={`quick-group-${group.id}`} className="mb-1 px-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--foreground-muted)]">
                  {group.label}
                </h2>
                <div className="space-y-1">
                  {groupItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMenu}
                      className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--background-panel)] focus-visible:bg-[var(--background-panel)]"
                    >
                      <span aria-hidden className="w-7 shrink-0 text-center">{item.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--foreground)]">{item.label}</span>
                        <span className="block text-xs leading-snug text-[var(--foreground-muted)]">{item.description}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {results.length === 0 && (
          <p className="px-2 py-5 text-center text-sm text-[var(--foreground-muted)]">
            Aucun accès trouvé.
          </p>
        )}
      </div>
    </details>
  );
}
