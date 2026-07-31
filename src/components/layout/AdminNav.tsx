"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminSignOut } from "./AdminSignOut";
import { AdminAccessMenu } from "./AdminAccessMenu";
import { AdminNavigationIcon } from "@/components/admin/AdminNavigationIcon";
import {
  ADMIN_NAVIGATION_GROUPS,
  ADMIN_NAVIGATION_ITEMS,
  filterAdminNavigation,
} from "@/lib/adminNavigation";

function isActivePath(pathname: string, searchParams: URLSearchParams, href: string) {
  const [route, query = ""] = href.split("?");
  if (route === "/admin") return pathname === route;
  if (pathname !== route && !pathname.startsWith(`${route}/`)) return false;
  if (query) {
    return [...new URLSearchParams(query)].every(
      ([key, value]) => searchParams.get(key) === value
    );
  }
  if (route === "/admin/regles" && searchParams.has("domaine")) return false;
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function AdminNav({ aiReportCount = 0 }: { aiReportCount?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => (query.trim() ? filterAdminNavigation(query) : [...ADMIN_NAVIGATION_ITEMS]),
    [query]
  );
  const playerAccess = ADMIN_NAVIGATION_ITEMS.find((item) => item.group === "access");

  return (
    <>
      <header
        className="admin-mobile-header sticky top-0 z-50 flex min-h-14 items-center gap-3 border-b px-4 lg:hidden"
        style={{ background: "var(--background-elevated)", borderColor: "var(--border)" }}
      >
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[#08110c]">
            <AdminNavigationIcon name="actions" className="h-4 w-4" />
          </span>
          <span>QG</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <AdminAccessMenu />
          <AdminSignOut compact />
        </div>
      </header>

      <aside className="admin-rail" aria-label="Navigation d’administration">
        <Link href="/admin" className="admin-rail-brand">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[#08110c]">
            <AdminNavigationIcon name="actions" className="h-[1.125rem] w-[1.125rem]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--foreground)]">Fates of Nations</span>
            <span className="block text-xs text-[var(--foreground-muted)]">Administration</span>
          </span>
        </Link>

        <div className="relative mx-3 mb-2">
          <label htmlFor="admin-nav-search" className="sr-only">
            Rechercher une page d’administration
          </label>
          <svg
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-muted)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            id="admin-nav-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Accéder à…"
            className="h-10 w-full rounded-lg border bg-[var(--background)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
            style={{ borderColor: "var(--border)" }}
          />
        </div>

        <nav className="admin-rail-scroll" aria-label="Pages d’administration">
          {!query.trim() && (
            <Link
              href="/admin"
              aria-current={pathname === "/admin" ? "page" : undefined}
              className="admin-rail-link"
            >
              <span className="admin-rail-link-icon">
                <AdminNavigationIcon name="actions" className="h-4 w-4" />
              </span>
              Aujourd’hui
            </Link>
          )}

          {ADMIN_NAVIGATION_GROUPS.filter((group) => group.id !== "access").map((group) => {
            const items = results.filter((item) => item.group === group.id);
            if (items.length === 0) return null;

            return (
              <section key={group.id} className="admin-rail-group" aria-labelledby={`admin-nav-${group.id}`}>
                <h2 id={`admin-nav-${group.id}`} className="admin-rail-group-title">
                  {group.label}
                </h2>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = isActivePath(pathname, searchParams, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className="admin-rail-link"
                      >
                        <span className="admin-rail-link-icon">
                          <AdminNavigationIcon name={item.icon} className="h-4 w-4" />
                        </span>
                        <span className="truncate">{item.label}</span>
                        {item.href === "/admin/assistants-ia" && aiReportCount > 0 && (
                          <span className="ml-auto min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[0.65rem] font-bold text-white" aria-label={`${aiReportCount} signalement${aiReportCount > 1 ? "s" : ""}`}>
                            {aiReportCount > 99 ? "99+" : aiReportCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {results.filter((item) => item.group !== "access").length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--foreground-muted)]">
              Aucun accès trouvé
            </p>
          )}
        </nav>

        <div className="admin-rail-footer">
          {playerAccess && (
            <Link href={playerAccess.href} className="admin-rail-player-link">
              <AdminNavigationIcon name={playerAccess.icon} className="h-4 w-4" />
              <span className="truncate">Vue joueur</span>
              <svg
                aria-hidden
                className="ml-auto h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
              </svg>
            </Link>
          )}
          <AdminSignOut compact />
        </div>
      </aside>
    </>
  );
}
