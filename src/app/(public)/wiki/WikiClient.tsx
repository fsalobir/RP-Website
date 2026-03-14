"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  WIKI_SECTIONS,
  filterSectionsByQuery,
  type WikiSectionId,
  type WikiSectionMeta,
} from "@/lib/wiki/sections";
import { WikiSectionContent } from "./WikiSectionContent";

const glassPanelClass = "rounded-2xl border border-white/25 bg-white/15 shadow-xl backdrop-blur-xl";
const glassInputClass =
  "w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/30";

function getSectionIdFromHash(hash: string): WikiSectionId {
  if (!hash) return WIKI_SECTIONS[0].id;
  if (WIKI_SECTIONS.some((s) => s.id === hash)) return hash as WikiSectionId;
  const fromAnchor = WIKI_SECTIONS.find((s) => hash.startsWith(s.id + "-"));
  return fromAnchor ? fromAnchor.id : WIKI_SECTIONS[0].id;
}

export function WikiClient() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<WikiSectionId | null>(null);
  const [currentHash, setCurrentHash] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<WikiSectionId>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  const filteredSections = useMemo(
    () => filterSectionsByQuery(searchQuery),
    [searchQuery]
  );

  const displaySectionId = activeSectionId ?? WIKI_SECTIONS[0].id;

  const goToSection = useCallback(
    (id: WikiSectionId) => {
      setActiveSectionId(id);
      router.push(`/wiki#${id}`, { scroll: false });
    },
    [router]
  );

  const goToSubsection = useCallback(
    (sectionId: WikiSectionId, subsectionId: string) => {
      setActiveSectionId(sectionId);
      setCurrentHash(subsectionId);
      router.push(`/wiki#${subsectionId}`, { scroll: false });
      setMenuOpen(false);
    },
    [router]
  );

  const toggleSectionExpanded = useCallback((sectionId: WikiSectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      const sectionId = getSectionIdFromHash(hash);
      setActiveSectionId(sectionId);
      setCurrentHash(hash);
      setExpandedSections((prev) => new Set(prev).add(sectionId));
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    if (!currentHash) return;
    const t = setTimeout(() => {
      const el = document.getElementById(currentHash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, [currentHash, displaySectionId]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className={`mb-4 p-3 ${glassPanelClass}`}>
        <label htmlFor="wiki-search" className="sr-only">
          Rechercher dans le wiki
        </label>
        <input
          id="wiki-search"
          type="search"
          placeholder="Rechercher dans le wiki…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={glassInputClass}
          aria-label="Rechercher dans le wiki"
        />
      </div>

      {/* Bouton Menu mobile : affiche le drawer des sections */}
      <div className="mb-4 md:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-left text-sm font-medium text-white hover:bg-white/15"
          aria-expanded={menuOpen}
          aria-controls="wiki-nav-drawer"
        >
          {menuOpen ? "Fermer le menu" : "Sections du wiki"}
        </button>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <aside
          id="wiki-nav-drawer"
          className={`w-full shrink-0 md:w-60 ${glassPanelClass} ${menuOpen ? "block" : "hidden md:block"}`}
        >
          <nav className="p-2" aria-label="Sections du wiki">
            {filteredSections.length === 0 ? (
              <p className="p-2 text-sm text-white/85">Aucun résultat</p>
            ) : (
              <ul className="space-y-0.5">
                {filteredSections.map((section) => {
                  const hasSubsections = section.subsections && section.subsections.length > 0;
                  const isExpanded = expandedSections.has(section.id);
                  const isActiveSection = displaySectionId === section.id;
                  return (
                    <li key={section.id} className="list-none">
                      <div className="flex items-center gap-0.5">
                        {hasSubsections ? (
                          <button
                            type="button"
                            onClick={() => toggleSectionExpanded(section.id)}
                            className="shrink-0 rounded p-1 text-white/85 hover:text-white hover:bg-white/10"
                            aria-expanded={isExpanded}
                            title={isExpanded ? "Replier" : "Développer"}
                          >
                            <span
                              className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              aria-hidden
                            >
                              ▶
                            </span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            goToSection(section.id);
                            setMenuOpen(false);
                          }}
                          className={`flex-1 rounded px-3 py-2 text-left text-sm transition-colors ${
                            isActiveSection
                              ? "border-l-[3px] border-l-[var(--accent)] bg-white/20 text-white"
                              : "border-l-[3px] border-l-transparent text-white/85 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {section.shortTitle}
                        </button>
                      </div>
                      {hasSubsections && isExpanded ? (
                        <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-white/20 pl-2">
                          {section.subsections!.map((sub) => {
                            const isActiveSub = currentHash === sub.id;
                            return (
                              <li key={sub.id}>
                                <button
                                  type="button"
                                  onClick={() => goToSubsection(section.id, sub.id)}
                                  className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
                                    isActiveSub
                                      ? "text-[var(--accent)] font-medium"
                                      : "text-white/75 hover:bg-white/10 hover:text-white/95"
                                  }`}
                                >
                                  {sub.shortTitle}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
        </aside>

        <main className="min-w-0 flex-1" style={{ maxWidth: "70ch" }}>
          <div className={glassPanelClass}>
            <article
              id={displaySectionId}
              data-wiki-section={displaySectionId}
              className="p-6 md:p-8"
              style={{ paddingBottom: "2rem" }}
            >
              <WikiSectionContent sectionId={displaySectionId} searchQuery={searchQuery} />
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
