import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";

const navLinkClass =
  "inline-flex min-h-11 shrink-0 items-center rounded px-2 text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] whitespace-nowrap";
const separatorClass = "hidden h-5 w-px bg-[var(--border)] sm:block" as const;

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
      <div className="mx-auto flex max-w-6xl min-w-0 flex-col px-4 sm:h-14 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/"
          className="inline-flex min-h-12 items-center text-lg font-semibold text-[var(--foreground)] transition-colors hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:min-h-11"
        >
          FoN
        </Link>
        <nav
          aria-label="Navigation principale"
          className="-mx-4 flex w-[calc(100%+2rem)] min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain border-t border-[var(--border)] px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:w-auto sm:overflow-visible sm:border-0 sm:px-0"
        >
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
              <span className="shrink-0 whitespace-nowrap text-sm text-[var(--foreground-muted)]">
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
