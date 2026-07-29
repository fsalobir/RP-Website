"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminSignOut } from "./AdminSignOut";

const navLinkClass =
  "inline-flex min-h-11 w-full items-center rounded px-2 text-sm text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] whitespace-nowrap sm:w-auto";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background-elevated)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="mx-auto max-w-6xl min-w-0 px-4 sm:flex sm:h-14 sm:items-center sm:justify-between">
        <div className="flex h-14 items-center justify-between sm:h-auto">
          <Link
            href="/"
            onClick={closeMenu}
            className="inline-flex min-h-11 items-center text-lg font-semibold text-[var(--foreground)] transition-colors hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            FoN
          </Link>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--foreground)] hover:bg-[var(--background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:hidden"
            aria-expanded={menuOpen}
            aria-controls="public-navigation"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
        <nav
          id="public-navigation"
          aria-label="Navigation principale"
          className={`${menuOpen ? "grid" : "hidden"} grid-cols-2 gap-1 border-t border-[var(--border)] py-2 sm:flex sm:w-auto sm:items-center sm:border-0 sm:py-0`}
        >
          <Link href={paysHref} onClick={closeMenu} className={navLinkClass}>
            <span aria-hidden className="mr-1.5">🌍</span>{paysLabel}
          </Link>
          <Link href="/carte" onClick={closeMenu} className={navLinkClass}>
            <span aria-hidden className="mr-1.5">🗺️</span>Carte
          </Link>
          <Link href="/classement" onClick={closeMenu} className={navLinkClass}>
            <span aria-hidden className="mr-1.5">📊</span>Classement
          </Link>
          <Link href="/ideologie" onClick={closeMenu} className={navLinkClass}>
            <span aria-hidden className="mr-1.5">△</span>Idéologie
          </Link>
          <Link href="/wiki" onClick={closeMenu} className={navLinkClass}>
            <span aria-hidden className="mr-1.5">📖</span>Wiki
          </Link>
          <Link href="/regles" onClick={closeMenu} className={navLinkClass}>
            <span aria-hidden className="mr-1.5">📜</span>Règles
          </Link>
          <div className={separatorClass} role="separator" />
          {isLoggedIn ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={closeMenu}
                  className={`${navLinkClass} text-[var(--accent)] hover:text-[var(--accent-hover)]`}
                >
                  <span aria-hidden className="mr-1.5">🔐</span>Admin
                </Link>
              )}
              <span className="col-span-2 px-2 py-2 text-sm text-[var(--foreground-muted)] sm:px-0 sm:py-0">
                Connecté{playerDisplayName ? ` : ${playerDisplayName}` : isAdmin ? " (admin)" : ""}
              </span>
              <AdminSignOut />
            </>
          ) : (
            <Link
              href="/admin/connexion"
              onClick={closeMenu}
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
