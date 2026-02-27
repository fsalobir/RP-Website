import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";

const navLinkClass =
  "text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap";
const separatorClass = "h-5 w-px bg-[var(--border)]" as const;

export function PublicNav({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background-elevated)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-lg font-semibold text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
        >
          Simulateur de nations
        </Link>
        <nav className="flex items-center gap-5">
          <Link href="/" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">🌍</span>Pays
          </Link>
          <Link href="/classement" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">📊</span>Classement
          </Link>
          <div className={separatorClass} role="separator" />
          {isAdmin ? (
            <>
              <Link
                href="/admin"
                className={`${navLinkClass} text-[var(--accent)] hover:text-[var(--accent-hover)]`}
              >
                <span aria-hidden className="mr-1.5">🔐</span>Admin
              </Link>
              <AdminSignOut />
            </>
          ) : (
            <Link
              href="/admin/connexion"
              className={`${navLinkClass} text-[var(--accent)] hover:text-[var(--accent-hover)]`}
            >
              <span aria-hidden className="mr-1.5">🔐</span>Connexion
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
