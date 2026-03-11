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

const panelStyle = {
  background: "var(--background-panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
};

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

  useEffect(() => {
    const syncFromHash = () => {
      const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      setActiveSectionId(getSectionIdFromHash(hash));
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (!hash) return;
    const t = setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, [displaySectionId]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div
        className="mb-4 rounded-lg border p-3"
        style={{ ...panelStyle, borderColor: "var(--border)" }}
      >
        <label htmlFor="wiki-search" className="sr-only">
          Rechercher dans le wiki
        </label>
        <input
          id="wiki-search"
          type="search"
          placeholder="Rechercher dans le wiki…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded border bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]"
          style={{ borderColor: "var(--border)" }}
          aria-label="Rechercher dans le wiki"
        />
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <aside
          className="w-full shrink-0 md:w-60"
          style={{
            background: "var(--background-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            borderColor: "var(--border)",
          }}
        >
          <nav className="p-2" aria-label="Sections du wiki">
            {filteredSections.length === 0 ? (
              <p className="p-2 text-sm text-[var(--foreground-muted)]">
                Aucun résultat
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filteredSections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => goToSection(section.id)}
                      className="w-full rounded px-3 py-2 text-left text-sm transition-colors"
                      style={{
                        color:
                          displaySectionId === section.id
                            ? "var(--accent)"
                            : "var(--foreground-muted)",
                        background:
                          displaySectionId === section.id
                            ? "var(--background)"
                            : "transparent",
                        borderLeft:
                          displaySectionId === section.id
                            ? "3px solid var(--accent)"
                            : "3px solid transparent",
                      }}
                    >
                      {section.shortTitle}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </aside>

        <main className="min-w-0 flex-1" style={{ maxWidth: "70ch" }}>
          <article
            id={displaySectionId}
            data-wiki-section={displaySectionId}
            className="py-6 md:py-8"
            style={{ paddingBottom: "2rem" }}
          >
            <WikiSectionContent sectionId={displaySectionId} searchQuery={searchQuery} />
          </article>
        </main>
      </div>
    </div>
  );
}
