"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminSignOut } from "./AdminSignOut";
import { PublicPageIconGlyph, type PublicPageIcon } from "@/components/ui/PublicPageHeader";

const navLinkClass = (active: boolean) =>
  `inline-flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:w-auto ${
    active
      ? "bg-[var(--accent)] font-semibold text-[#071016] shadow-[0_8px_24px_rgba(103,211,122,0.16)]"
      : "text-white/70 hover:bg-white/[0.07] hover:text-white"
  }`;
const separatorClass = "hidden h-5 w-px bg-white/15 lg:block" as const;
const links: Array<{ href: string; label: string; icon: PublicPageIcon }> = [
  { href: "/carte", label: "Carte", icon: "map" },
  { href: "/classement", label: "Classement", icon: "ranking" },
  { href: "/ideologie", label: "Idéologie", icon: "ideology" },
  { href: "/wiki", label: "Wiki", icon: "wiki" },
];

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
  const pathname = usePathname();
  const closeMenu = () => setMenuOpen(false);
  const isCurrent = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  const countryIsCurrent = pathname === "/" || pathname.startsWith("/pays/");

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/10 bg-[#071016]/95 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md"
    >
      <div className="mx-auto max-w-7xl min-w-0 px-4 lg:flex lg:h-16 lg:items-center lg:justify-between">
        <div className="flex h-16 items-center justify-between lg:h-auto">
          <Link
            href="/"
            onClick={closeMenu}
            className="inline-flex min-h-11 items-center gap-3 text-white transition-colors hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]">
              <PublicPageIconGlyph icon="world" className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-[-0.03em]">
              <span className="sm:hidden">FoN</span>
              <span className="hidden sm:inline">Fates of Nations</span>
            </span>
          </Link>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--foreground)] hover:bg-[var(--background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:hidden"
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
          className={`${menuOpen ? "grid" : "hidden"} grid-cols-2 gap-1 border-t border-[var(--border)] py-2 lg:flex lg:w-auto lg:items-center lg:border-0 lg:py-0`}
        >
          <Link href={paysHref} onClick={closeMenu} className={navLinkClass(countryIsCurrent)} aria-current={countryIsCurrent ? "page" : undefined}>
            <PublicPageIconGlyph icon="world" className="h-[18px] w-[18px]" />{paysLabel}
          </Link>
          {links.map(({ href, label, icon }) => (
            <Link key={href} href={href} onClick={closeMenu} className={navLinkClass(isCurrent(href))} aria-current={isCurrent(href) ? "page" : undefined}>
              <PublicPageIconGlyph icon={icon} className="h-[18px] w-[18px]" />{label}
            </Link>
          ))}
          <div className={separatorClass} role="separator" />
          {isLoggedIn ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={closeMenu}
                  className={navLinkClass(isCurrent("/admin"))}
                >
                  <LockIcon />Admin
                </Link>
              )}
              <span className="col-span-2 px-2 py-2 text-sm text-[var(--foreground-muted)] lg:px-0 lg:py-0">
                Connecté{playerDisplayName ? ` : ${playerDisplayName}` : isAdmin ? " (admin)" : ""}
              </span>
              <AdminSignOut />
            </>
          ) : (
            <Link
              href="/admin/connexion"
              onClick={closeMenu}
              className={navLinkClass(isCurrent("/admin/connexion"))}
            >
              <LockIcon />Connexion
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
