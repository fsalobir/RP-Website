import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";

const navLinkClass =
  "text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap";
const separatorClass = "h-5 w-px bg-[var(--border)]" as const;

export function AdminNav() {
  return (
    <header
      className="sticky top-0 z-50 border-b bg-[var(--background-elevated)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/admin"
          className="text-lg font-semibold text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
        >
          Tableau de bord
        </Link>
        <nav className="flex items-center gap-5">
          <Link href="/admin/pays" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">🌍</span>Pays
          </Link>
          <Link href="/admin/roster" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">🪖</span>Roster
          </Link>
          <Link href="/classement" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">📊</span>Classement
          </Link>
          <div className={separatorClass} role="separator" />
          <Link href="/admin/regles" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">⚙️</span>Règles
          </Link>
          <Link href="/admin" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">🏠</span>Accueil
          </Link>
          <AdminSignOut />
        </nav>
      </div>
    </header>
  );
}
