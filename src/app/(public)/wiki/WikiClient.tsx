"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { WikiPageBody } from "./WikiPageBody";
import {
  buildWikiTree,
  filterTreeByQuery,
  findWikiPageBySlug,
  getAncestorSlugs,
} from "@/lib/wiki/tree";
import type { WikiPageRow, WikiTreeNode } from "@/lib/wiki/types";

const glassPanelClass = "rounded-2xl border border-white/25 bg-white/15 shadow-xl backdrop-blur-xl";
const glassInputClass =
  "w-full rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/30";

function resolveSlugFromHash(hash: string, pages: WikiPageRow[], tree: WikiTreeNode[]): string {
  if (!pages.length) return "";
  if (!hash) return tree[0]?.slug ?? pages[0].slug;
  const found = findWikiPageBySlug(pages, hash);
  if (found) return found.slug;
  return tree[0]?.slug ?? pages[0].slug;
}

function TreeNav({
  nodes,
  activeSlug,
  expandedSlugs,
  toggleExpand,
  goToSlug,
  depth,
}: {
  nodes: WikiTreeNode[];
  activeSlug: string;
  expandedSlugs: Set<string>;
  toggleExpand: (slug: string) => void;
  goToSlug: (slug: string) => void;
  depth: number;
}) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "ml-2 mt-0.5 space-y-0.5 border-l border-white/20 pl-2"}>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const expanded = expandedSlugs.has(node.slug);
        const isActive = activeSlug === node.slug;
        return (
          <li key={node.id} className="list-none">
            <div className="flex items-center gap-0.5">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(node.slug)}
                  className="shrink-0 rounded p-1 text-white/85 hover:text-white hover:bg-white/10"
                  aria-expanded={expanded}
                  title={expanded ? "Replier" : "Développer"}
                >
                  <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>
                    ▶
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  goToSlug(node.slug);
                }}
                className={`flex-1 rounded px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "border-l-[3px] border-l-[var(--accent)] bg-white/20 text-white"
                    : "border-l-[3px] border-l-transparent text-white/85 hover:bg-white/10 hover:text-white"
                }`}
                style={{ paddingLeft: hasChildren ? undefined : 28 + depth * 4 }}
              >
                {node.title}
              </button>
            </div>
            {hasChildren && expanded ? (
              <TreeNav
                nodes={node.children}
                activeSlug={activeSlug}
                expandedSlugs={expandedSlugs}
                toggleExpand={toggleExpand}
                goToSlug={goToSlug}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function WikiClient({ initialPages }: { initialPages: WikiPageRow[] }) {
  const router = useRouter();
  const pages = initialPages;
  const tree = useMemo(() => buildWikiTree(pages), [pages]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [currentHash, setCurrentHash] = useState("");
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(() => new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  const filteredTree = useMemo(
    () => filterTreeByQuery(tree, searchQuery),
    [tree, searchQuery]
  );

  const displaySlug = activeSlug ?? resolveSlugFromHash("", pages, tree);
  const displayPage = findWikiPageBySlug(pages, displaySlug);

  const goToSlug = useCallback(
    (slug: string) => {
      setActiveSlug(slug);
      router.push(`/wiki#${slug}`, { scroll: false });
      setMenuOpen(false);
    },
    [router]
  );

  const toggleExpand = useCallback((slug: string) => {
    setExpandedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      const slug = resolveSlugFromHash(hash, pages, tree);
      setActiveSlug(slug);
      setCurrentHash(hash);
      /** Par défaut tout est replié ; on déplie uniquement le chemin vers la page (ancêtres) pour les liens #sous-section. */
      setExpandedSlugs((prev) => {
        const next = new Set(prev);
        for (const anc of getAncestorSlugs(pages, slug)) {
          next.add(anc);
        }
        return next;
      });
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [pages, tree]);

  useEffect(() => {
    if (!currentHash) return;
    const t = setTimeout(() => {
      const el = document.getElementById(currentHash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, [currentHash, displaySlug]);

  if (!pages.length) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className={`p-6 ${glassPanelClass}`}>
          <p className="text-white/85">
            Le wiki n’a pas encore de contenu. Les administrateurs peuvent l’alimenter depuis le tableau de bord.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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
            {filteredTree.length === 0 ? (
              <p className="p-2 text-sm text-white/85">Aucun résultat</p>
            ) : (
              <TreeNav
                nodes={filteredTree}
                activeSlug={displaySlug}
                expandedSlugs={expandedSlugs}
                toggleExpand={toggleExpand}
                goToSlug={goToSlug}
                depth={0}
              />
            )}
          </nav>
        </aside>

        <main className="min-w-0 w-full flex-1">
          <div className={glassPanelClass}>
            <article
              id={displayPage?.slug ?? displaySlug}
              data-wiki-section={displayPage?.slug}
              className="p-6 md:p-8"
              style={{ paddingBottom: "2rem" }}
            >
              {displayPage ? (
                <>
                  <h1 className="mb-6 text-2xl font-bold text-white md:text-3xl">{displayPage.title}</h1>
                  <WikiPageBody
                    content={displayPage.content}
                    contentHtml={displayPage.contentHtml}
                    contentRevision={displayPage.updated_at ?? displayPage.id}
                  />
                </>
              ) : (
                <p className="text-white/75">Page introuvable.</p>
              )}
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
