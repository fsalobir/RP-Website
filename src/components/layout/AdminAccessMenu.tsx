"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ADMIN_NAVIGATION_GROUPS,
  filterAdminNavigation,
} from "@/lib/adminNavigation";
import { AdminNavigationIcon } from "@/components/admin/AdminNavigationIcon";

function isActivePath(pathname: string, searchParams: URLSearchParams, href: string) {
  const [route, query = ""] = href.split("?");
  if (pathname !== route && !pathname.startsWith(`${route}/`)) return false;
  if (query) {
    return [...new URLSearchParams(query)].every(
      ([key, value]) => searchParams.get(key) === value
    );
  }
  if (route === "/admin/regles" && searchParams.has("domaine")) return false;
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function AdminAccessMenu() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const results = useMemo(() => filterAdminNavigation(query), [query]);

  function closeMenu(restoreFocus = false) {
    detailsRef.current?.removeAttribute("open");
    setQuery("");
    if (restoreFocus) requestAnimationFrame(() => summaryRef.current?.focus());
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) {
        details.removeAttribute("open");
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <details
      ref={detailsRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeMenu(true);
        }
      }}
      className="relative shrink-0"
    >
      <summary
        ref={summaryRef}
        className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <span>Pages</span>
        <span aria-hidden className="text-xs text-[var(--foreground-muted)]">▾</span>
      </summary>
      <div
        className="fixed left-3 right-3 top-[4.25rem] z-[70] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border p-2 shadow-[0_18px_48px_rgba(0,0,0,0.45)] sm:left-auto sm:right-4 sm:w-[24rem]"
        style={{ background: "var(--background-elevated)", borderColor: "var(--border)" }}
      >
        <label htmlFor="admin-quick-search" className="sr-only">
          Rechercher une page d’administration
        </label>
        <input
          id="admin-quick-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Accéder à…"
          className="mb-2 min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
          style={{ borderColor: "var(--border)" }}
        />

        {!query.trim() && (
          <Link
            href="/admin"
            onClick={() => closeMenu()}
            aria-current={pathname === "/admin" ? "page" : undefined}
            className={`mb-2 flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium transition-colors ${
              pathname === "/admin"
                ? "bg-[var(--background-panel)] text-[var(--accent)]"
                : "text-[var(--foreground)] hover:bg-[var(--background-panel)]"
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--background)]">
              <AdminNavigationIcon name="actions" className="h-4 w-4" />
            </span>
            Aujourd’hui
          </Link>
        )}

        <div className="space-y-3">
          {ADMIN_NAVIGATION_GROUPS.map((group) => {
            const groupItems = results.filter((item) => item.group === group.id);
            if (groupItems.length === 0) return null;

            return (
              <section key={group.id} aria-labelledby={`quick-group-${group.id}`}>
                <h2
                  id={`quick-group-${group.id}`}
                  className="mb-1 px-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--foreground-muted)]"
                >
                  {group.label}
                </h2>
                <div className="space-y-0.5">
                  {groupItems.map((item) => {
                    const active = isActivePath(pathname, searchParams, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => closeMenu()}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium transition-colors ${
                          active
                            ? "bg-[var(--background-panel)] text-[var(--accent)]"
                            : "text-[var(--foreground)] hover:bg-[var(--background-panel)]"
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--background)] text-[var(--foreground-muted)]">
                          <AdminNavigationIcon name={item.icon} className="h-4 w-4" />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {results.length === 0 && (
          <p className="px-2 py-5 text-center text-sm text-[var(--foreground-muted)]">
            Aucun accès trouvé
          </p>
        )}
      </div>
    </details>
  );
}
