"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminSignOut } from "./AdminSignOut";
import { AdminAccessMenu } from "./AdminAccessMenu";
import { AdminNavigationIcon } from "@/components/admin/AdminNavigationIcon";

const navLinkBase =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] whitespace-nowrap";

export function AdminNav() {
  const pathname = usePathname();
  const links = [
    { href: "/admin", label: "Aujourd’hui", active: pathname === "/admin" },
    { href: "/admin/demandes", label: "Demandes", active: pathname.startsWith("/admin/demandes") },
    { href: "/admin/event-ia", label: "Événements IA", active: pathname.startsWith("/admin/event-ia") },
    { href: "/admin/regles", label: "Règles", active: pathname.startsWith("/admin/regles") },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b bg-[var(--background-elevated)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="relative mx-auto flex min-h-14 max-w-7xl min-w-0 flex-col px-4 sm:h-[3.5rem] sm:min-h-[3.5rem] sm:flex-row sm:items-center">
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
          <Link
            href="/admin"
            className="inline-flex min-h-12 items-center gap-2 text-base font-semibold text-[var(--foreground)] transition-colors hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:min-h-11"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-[#08110c]">
              <AdminNavigationIcon name="actions" className="h-4 w-4" />
            </span>
            <span className="sm:hidden">QG</span>
            <span className="hidden sm:inline">QG Administration</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <AdminAccessMenu />
            <div className="lg:hidden">
              <AdminSignOut compact />
            </div>
          </div>
        </div>
        <nav
          aria-label="Navigation d’administration"
          className="ml-5 hidden min-w-0 items-center gap-1 border-l pl-5 lg:flex"
          style={{ borderColor: "var(--border)" }}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={`${navLinkBase} ${
                link.active
                  ? "bg-[var(--background-panel)] text-[var(--foreground)]"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-1 lg:flex">
          <Link
            href="/"
            className={`${navLinkBase} text-[var(--foreground-muted)] hover:text-[var(--foreground)]`}
          >
            Vue joueur
            <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
            </svg>
          </Link>
          <AdminSignOut />
        </div>
      </div>
    </header>
  );
}
