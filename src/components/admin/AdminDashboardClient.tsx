"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminNavigationIcon } from "@/components/admin/AdminNavigationIcon";
import {
  ADMIN_NAVIGATION_GROUPS,
  ADMIN_NAVIGATION_ITEMS,
  filterAdminNavigation,
  type AdminCountKey,
} from "@/lib/adminNavigation";
import { formatNumber } from "@/lib/format";

export type AdminWorldStatus = {
  dateLabel: string;
  paused: boolean;
  advanceMonths: number;
};

export function AdminDashboardClient({
  counts,
  world,
}: {
  counts: Record<AdminCountKey, number>;
  world: AdminWorldStatus;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterAdminNavigation(query), [query]);
  const pendingTotal = counts.requests + counts.aiEvents;
  const preparationLinks = ADMIN_NAVIGATION_ITEMS.filter((item) =>
    ["/admin/regles", "/admin/actions-etat", "/admin/pays"].includes(item.href)
  );

  return (
    <div className="space-y-8">
      <section
        aria-label="État de la simulation"
        className="grid border-y sm:grid-cols-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="py-4 sm:pr-5">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--foreground-muted)]">
            Simulation
          </p>
          <p className="mt-1 flex items-center gap-2 font-semibold text-[var(--foreground)]">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${world.paused ? "bg-[var(--warning)]" : "bg-[var(--accent)]"}`}
            />
            {world.paused ? "En pause" : "Active"}
          </p>
        </div>
        <div className="border-t py-4 sm:border-l sm:border-t-0 sm:px-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--foreground-muted)]">
            Date du monde
          </p>
          <p className="mt-1 font-semibold text-[var(--foreground)]">{world.dateLabel}</p>
        </div>
        <div className="border-t py-4 sm:border-l sm:border-t-0 sm:pl-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--foreground-muted)]">
            Prochain passage
          </p>
          <p className="mt-1 font-semibold text-[var(--foreground)]">
            {world.paused
              ? "Suspendu"
              : `+${formatNumber(world.advanceMonths)} mois`}
          </p>
        </div>
      </section>

      <section aria-labelledby="admin-decisions-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="admin-decisions-title" className="text-lg font-semibold text-[var(--foreground)]">
              À traiter maintenant
            </h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Les décisions susceptibles de bloquer le rythme de la partie.
            </p>
          </div>
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            {formatNumber(pendingTotal)} en attente
          </p>
        </div>

        {pendingTotal > 0 ? (
          <div className="mt-3 divide-y border-y" style={{ borderColor: "var(--border)" }}>
            <DecisionRow
              href="/admin/demandes"
              icon="requests"
              title="Demandes des joueurs"
              detail={
                counts.requests > 0
                  ? `${formatNumber(counts.requests)} décision${counts.requests > 1 ? "s" : ""} à prendre`
                  : "Aucune décision en attente"
              }
              count={counts.requests}
            />
            <DecisionRow
              href="/admin/event-ia"
              icon="ai"
              title="Événements IA"
              detail={
                counts.aiEvents > 0
                  ? `${formatNumber(counts.aiEvents)} événement${counts.aiEvents > 1 ? "s" : ""} à examiner`
                  : "Aucun événement en attente"
              }
              count={counts.aiEvents}
            />
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3 border-y py-4" style={{ borderColor: "var(--border)" }}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]">
              ✓
            </span>
            <div>
              <p className="font-medium text-[var(--foreground)]">Aucune décision en attente</p>
              <p className="text-sm text-[var(--foreground-muted)]">Vous pouvez préparer la prochaine session.</p>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="admin-prepare-title">
        <h2 id="admin-prepare-title" className="text-lg font-semibold text-[var(--foreground)]">
          Préparer la session
        </h2>
        <div className="mt-3 grid border-y sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
          {preparationLinks.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex min-h-20 items-center gap-3 py-3 transition-colors hover:bg-[var(--background-elevated)] focus-visible:bg-[var(--background-elevated)] sm:px-4 ${
                index > 0 ? "border-t sm:border-l sm:border-t-0" : ""
              }`}
              style={{ borderColor: "var(--border)" }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--background-elevated)] text-[var(--foreground-muted)] group-hover:text-[var(--accent)]">
                <AdminNavigationIcon name={item.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--foreground)]">{item.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-[var(--foreground-muted)]">
                  {item.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="admin-tools-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="admin-tools-title" className="text-lg font-semibold text-[var(--foreground)]">
              Toutes les pages
            </h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Accédez directement à un réglage ou un outil.
            </p>
          </div>
          <label className="w-full sm:max-w-sm">
            <span className="sr-only">Rechercher dans l’administration</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pays, règles, Discord…"
              className="min-h-11 w-full rounded-lg border bg-[var(--background-panel)] px-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-x-8 gap-y-5 lg:grid-cols-2">
          {ADMIN_NAVIGATION_GROUPS.map((group) => {
            const groupItems = results.filter((item) => item.group === group.id);
            if (groupItems.length === 0) return null;

            return (
              <section key={group.id} aria-labelledby={`admin-group-${group.id}`}>
                <h3
                  id={`admin-group-${group.id}`}
                  className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--foreground-muted)]"
                >
                  {group.label}
                </h3>
                <div className="divide-y" style={{ borderColor: "var(--border-muted)" }}>
                  {groupItems.map((item) => {
                    const count = item.countKey ? counts[item.countKey] : null;
                    const countLabel =
                      count === null
                        ? null
                        : `${formatNumber(count)} ${count === 1 ? item.countSingular : item.countPlural}`;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="group flex min-h-14 items-center gap-3 py-2 transition-colors hover:bg-[var(--background-elevated)] focus-visible:bg-[var(--background-elevated)]"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--foreground-muted)] group-hover:text-[var(--accent)]">
                          <AdminNavigationIcon name={item.icon} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span className="text-sm font-medium text-[var(--foreground)]">{item.label}</span>
                            {countLabel ? (
                              <span className="text-xs tabular-nums text-[var(--foreground-muted)]">{countLabel}</span>
                            ) : null}
                          </span>
                          <span className="block text-xs leading-snug text-[var(--foreground-muted)]">
                            {item.description}
                          </span>
                        </span>
                        <span aria-hidden className="shrink-0 text-[var(--foreground-muted)]">→</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {results.length === 0 ? (
          <p className="mt-4 border-y py-6 text-center text-sm text-[var(--foreground-muted)]" style={{ borderColor: "var(--border)" }}>
            Aucun outil ne correspond à « {query} ».
          </p>
        ) : null}
      </section>
    </div>
  );
}

function DecisionRow({
  href,
  icon,
  title,
  detail,
  count,
}: {
  href: string;
  icon: "requests" | "ai";
  title: string;
  detail: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-16 items-center gap-3 py-3 transition-colors hover:bg-[var(--background-elevated)] focus-visible:bg-[var(--background-elevated)]"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          count > 0
            ? "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]"
            : "bg-[var(--background-elevated)] text-[var(--foreground-muted)]"
        }`}
      >
        <AdminNavigationIcon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[var(--foreground)]">{title}</span>
        <span className="block text-sm text-[var(--foreground-muted)]">{detail}</span>
      </span>
      <span aria-hidden className="text-[var(--foreground-muted)] transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}
