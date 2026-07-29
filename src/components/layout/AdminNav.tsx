import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";
import { AdminAccessMenu } from "./AdminAccessMenu";

const navLinkClass =
  "inline-flex min-h-11 shrink-0 items-center rounded px-2 text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] whitespace-nowrap";

export function AdminNav() {
  return (
    <header
      className="sticky top-0 z-50 border-b bg-[var(--background-elevated)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="relative mx-auto flex min-h-14 max-w-6xl min-w-0 flex-col px-4 sm:h-[3.25rem] sm:min-h-[3.25rem] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
          <Link
            href="/admin"
            className="inline-flex min-h-12 items-center text-lg font-semibold text-[var(--foreground)] transition-colors hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:min-h-11"
          >
            Tableau de bord
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <AdminAccessMenu />
            <div className="sm:hidden">
              <AdminSignOut compact />
            </div>
          </div>
        </div>
        <nav
          aria-label="Navigation d’administration"
          className="hidden min-w-0 items-center gap-1 sm:flex"
        >
          <Link href="/" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">👁️</span>Accès Joueur
          </Link>
          <Link href="/admin/regles" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">⚙️</span>Règles
          </Link>
          <Link href="/admin/avantages" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">⭐</span>Avantages
          </Link>
          <Link href="/admin/wiki" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">📖</span>Wiki
          </Link>
          <AdminSignOut />
        </nav>
      </div>
    </header>
  );
}
