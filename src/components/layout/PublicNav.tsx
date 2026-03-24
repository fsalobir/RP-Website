import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";

const navLinkClass =
  "text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors whitespace-nowrap";
const separatorClass = "h-5 w-px bg-[var(--border)]" as const;

export function PublicNav({
  isAdmin = false,
  playerDisplayName = null,
  isLoggedIn = false,
  playerCountrySlug = null,
}: {
  isAdmin?: boolean;
  playerDisplayName?: string | null;
  isLoggedIn?: boolean;
  playerCountrySlug?: string | null;
}) {
  const paysHref = playerCountrySlug ? `/pays/${playerCountrySlug}` : "/";
  const paysLabel = playerCountrySlug ? "Mon Pays" : "Pays";

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
          FoN
        </Link>
        <nav className="flex items-center gap-5">
          <Link href={paysHref} className={navLinkClass}>
            <span aria-hidden className="mr-1.5">🌍</span>{paysLabel}
          </Link>
          <Link href="/carte" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">🗺️</span>Carte
          </Link>
          <Link href="/classement" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">📊</span>Classement
          </Link>
          <Link href="/ideologie" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">△</span>Idéologie
          </Link>
          <Link href="/wiki" className={navLinkClass}>
            <span aria-hidden className="mr-1.5">📖</span>Wiki
          </Link>
          <div className={separatorClass} role="separator" />
          {isLoggedIn ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`${navLinkClass} text-[var(--accent)] hover:text-[var(--accent-hover)]`}
                >
                  <span aria-hidden className="mr-1.5">🔐</span>Admin
                </Link>
              )}
              <span className="text-sm text-[var(--foreground-muted)]">
                Connecté{playerDisplayName ? ` : ${playerDisplayName}` : isAdmin ? " (admin)" : ""}
              </span>
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
