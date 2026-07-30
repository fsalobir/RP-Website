"use client";

import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DisclosureChevron } from "@/components/ui/DisclosureChevron";
import {
  createWikiPageAction,
  deleteWikiPageAction,
  moveWikiPageAction,
  saveWikiPageAction,
} from "@/app/actions/wiki";
import { WikiEditor } from "@/components/wiki/WikiEditor";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { buildWikiTree, getAncestorSlugs } from "@/lib/wiki/tree";
import { matchesSearchText } from "@/lib/searchText";
import type { WikiPageRow, WikiTreeNode } from "@/lib/wiki/types";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

const btnClass =
  "rounded-lg border border-[var(--border)] bg-[var(--background-panel)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--background-elevated)] disabled:opacity-40";
const dangerBtn =
  "rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20";

function AdminTreeRow({
  node,
  selectedId,
  expandedSlugs,
  toggleExpand,
  onSelect,
  disabled,
}: {
  node: WikiTreeNode;
  selectedId: string | null;
  expandedSlugs: Set<string>;
  toggleExpand: (slug: string) => void;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedSlugs.has(node.slug);
  const isSelected = selectedId === node.id;
  return (
    <li className="list-none">
      <div className="flex items-center gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggleExpand(node.slug)}
            disabled={disabled}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Replier" : "Développer"} ${node.title}`}
            title={expanded ? "Replier" : "Développer"}
          >
            <DisclosureChevron open={expanded} direction="right" />
          </button>
        ) : (
          <span className="inline-block w-11 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          disabled={disabled}
          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm ${
            isSelected
              ? "bg-[var(--accent)]/25 text-[var(--foreground)] font-medium"
              : "text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)]"
          }`}
          style={{ paddingLeft: hasChildren ? undefined : 0 }}
        >
          {node.title}
        </button>
      </div>
      {hasChildren && expanded ? (
        <ul className="ml-1 mt-0.5 space-y-0.5 border-l border-[var(--border)] pl-2">
          {node.children.map((c) => (
            <AdminTreeRow
              key={c.id}
              node={c}
              selectedId={selectedId}
              expandedSlugs={expandedSlugs}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
              disabled={disabled}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function WikiAdminClient({ initialPages }: { initialPages: WikiPageRow[] }) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [selectedId, setSelectedId] = useState<string | null>(initialPages[0]?.id ?? null);
  const [title, setTitle] = useState(initialPages[0]?.title ?? "");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState<"up" | "down" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(() => new Set());
  const [newPageMode, setNewPageMode] = useState<"root" | "child" | null>(null);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const dirtyRef = useRef(false);
  const pageNavigationRef = useRef<HTMLDetailsElement>(null);
  const busy = saving || creating || deleting || moving !== null;
  useUnsavedChangesGuard(dirty, "Quitter le wiki sans enregistrer les modifications ?");

  const setDirtyState = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setDirty(next);
  }, []);

  const confirmDiscard = useCallback(() => {
    return (
      !dirtyRef.current ||
      window.confirm("Abandonner les modifications non enregistrées de cette page ?")
    );
  }, []);

  useEffect(() => {
    setPages(initialPages);
  }, [initialPages]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const syncNavigation = () => {
      if (media.matches) pageNavigationRef.current?.setAttribute("open", "");
      else pageNavigationRef.current?.removeAttribute("open");
    };
    syncNavigation();
    media.addEventListener("change", syncNavigation);
    return () => media.removeEventListener("change", syncNavigation);
  }, []);

  const tree = useMemo(() => buildWikiTree(pages), [pages]);
  const searchResults = useMemo(
    () => pages.filter((page) => matchesSearchText(query, [page.title, page.search_text])),
    [pages, query]
  );

  const toggleExpand = useCallback((slug: string) => {
    setExpandedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  /** Déplier le chemin vers la page sélectionnée (surtout les sous-pages). */
  useEffect(() => {
    if (!selectedId) return;
    const p = pages.find((x) => x.id === selectedId);
    if (!p) return;
    setExpandedSlugs((prev) => {
      const next = new Set(prev);
      for (const anc of getAncestorSlugs(pages, p.slug)) {
        next.add(anc);
      }
      return next;
    });
  }, [selectedId, pages]);

  const selectedPage = useMemo(
    () => (selectedId ? pages.find((p) => p.id === selectedId) : undefined),
    [pages, selectedId]
  );

  const clearSaveMessage = useCallback(() => {
    setMsg(null);
    setError(null);
    setDirtyState(true);
  }, [setDirtyState]);

  const selectPage = useCallback(
    (id: string) => {
      if (id === selectedId || busy || !confirmDiscard()) return;
      setDirtyState(false);
      setSelectedId(id);
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        pageNavigationRef.current?.removeAttribute("open");
      }
      const p = pages.find((x) => x.id === id);
      if (p) setTitle(p.title);
      setMsg(null);
      setError(null);
    },
    [busy, confirmDiscard, pages, selectedId, setDirtyState]
  );

  const handleSave = useCallback(async () => {
    if (!selectedPage || !editor) return;
    if (!title.trim()) {
      setError("Le titre de la page ne peut pas être vide.");
      return;
    }
    setSaving(true);
    setMsg(null);
    setError(null);
    const rawDoc = editor.getJSON() as JSONContent;
    /**
     * Les Server Actions sérialisent les arguments (structured clone / RSC). Le JSON TipTap
     * peut arriver côté serveur sans `attrs` sur les images (voir logs H1 vs H2 : input cassé).
     * Forcer un objet JSON plain garantit la même forme qu’après persistance DB.
     */
    const content = JSON.parse(JSON.stringify(rawDoc)) as JSONContent;
    const savedTitle = title.trim();
    try {
      const res = await saveWikiPageAction({
        id: selectedPage.id,
        title: savedTitle,
        content,
        expected_updated_at: selectedPage.updated_at ?? "",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const changedDuringSave =
        title.trim() !== savedTitle ||
        JSON.stringify(editor.getJSON()) !== JSON.stringify(content);
      setDirtyState(changedDuringSave);
      setPages((current) =>
        current.map((page) =>
          page.id === selectedPage.id
            ? { ...page, title: savedTitle, content, updated_at: res.updated_at }
            : page
        )
      );
      setMsg(
        changedDuringSave
          ? "Version précédente publiée. De nouvelles modifications restent à enregistrer."
          : "Modifications publiées."
      );
      router.refresh();
    } catch {
      setError("Impossible d’enregistrer la page. Réessayez.");
    } finally {
      setSaving(false);
    }
  }, [selectedPage, editor, title, router, setDirtyState]);

  const handleCreatePage = useCallback(async () => {
    const name = newPageTitle.trim();
    if (
      !name ||
      !newPageMode ||
      (newPageMode === "child" && !selectedPage) ||
      !confirmDiscard()
    ) {
      return;
    }
    setCreating(true);
    setMsg(null);
    setError(null);
    try {
      const res = await createWikiPageAction({
        parent_id: newPageMode === "child" ? selectedPage?.id ?? null : null,
        title: name,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDirtyState(false);
      setNewPageMode(null);
      setNewPageTitle("");
      setSelectedId(res.id);
      setTitle(name);
      setMsg("Page créée.");
      router.refresh();
    } catch {
      setError("Impossible de créer la page. Réessayez.");
    } finally {
      setCreating(false);
    }
  }, [confirmDiscard, newPageMode, newPageTitle, selectedPage, router, setDirtyState]);

  const handleDelete = useCallback(async () => {
    if (!selectedPage || deleting) return;
    setDeleting(true);
    setMsg(null);
    setError(null);
    try {
      const res = await deleteWikiPageAction(
        selectedPage.id,
        selectedPage.updated_at ?? ""
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDirtyState(false);
      setSelectedId(null);
      setTitle("");
      setDeleteConfirmOpen(false);
      setMsg("Page supprimée.");
      router.refresh();
    } catch {
      setError("Impossible de supprimer la page. Réessayez.");
    } finally {
      setDeleting(false);
    }
  }, [deleting, selectedPage, router, setDirtyState]);

  const handleMove = useCallback(
    async (dir: "up" | "down") => {
      if (!selectedPage || moving || dirty) return;
      setMoving(dir);
      setMsg(null);
      setError(null);
      try {
        const result = await moveWikiPageAction(
          selectedPage.id,
          dir,
          selectedPage.updated_at ?? ""
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMsg(dir === "up" ? "Page remontée." : "Page descendue.");
        router.refresh();
      } catch {
        setError("Impossible de déplacer la page. Réessayez.");
      } finally {
        setMoving(null);
      }
    },
    [dirty, moving, selectedPage, router]
  );

  return (
    <div className="admin-settings-form mx-auto max-w-[100rem] px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Wiki</h1>
          <span className="rounded bg-[var(--background-elevated)] px-2 py-1 text-xs text-[var(--foreground-muted)]">
            {pages.length} page{pages.length > 1 ? "s" : ""}
          </span>
        </div>
        <span
          className={`rounded px-2 py-1 text-sm font-medium ${
            dirty ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"
          }`}
        >
          {dirty ? "À enregistrer" : "Publié"}
        </span>
      </header>

      {(error || msg) ? (
        <div className="mt-3" aria-live="polite">
          {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
          {!error && msg ? <p role="status" className="text-sm text-[var(--accent)]">{msg}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 grid min-w-0 overflow-hidden rounded-xl border bg-[var(--background-panel)] lg:grid-cols-[19rem_minmax(0,1fr)]" style={{ borderColor: "var(--border)" }}>
        <details ref={pageNavigationRef} className="wiki-admin-pages min-w-0 border-b lg:border-r lg:border-b-0" style={{ borderColor: "var(--border)" }}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-[var(--foreground)] lg:hidden [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 truncate">
              Pages <span className="font-normal text-[var(--foreground-muted)]">· {selectedPage?.title ?? "Aucune sélection"}</span>
            </span>
            <span aria-hidden className="text-[var(--foreground-muted)]">⌄</span>
          </summary>
          <div className="wiki-admin-pages-content">
          <div className="flex items-center justify-between gap-2 border-b p-3" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Pages</h2>
            <div className="flex gap-1">
              <button
                type="button"
                className="min-h-9 rounded-lg border px-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--background-elevated)] disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
                onClick={() => {
                  setNewPageMode("root");
                  setNewPageTitle("");
                }}
                disabled={busy}
              >
                + Page
              </button>
              <button
                type="button"
                className="min-h-9 rounded-lg border px-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--background-elevated)] disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
                onClick={() => {
                  setNewPageMode("child");
                  setNewPageTitle("");
                }}
                disabled={busy || !selectedPage}
              >
                + Enfant
              </button>
            </div>
          </div>

          {newPageMode ? (
            <form
              className="border-b bg-[var(--background)] p-3"
              style={{ borderColor: "var(--border)" }}
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreatePage();
              }}
            >
              <label htmlFor="new-wiki-page-title" className="text-xs font-medium text-[var(--foreground)]">
                {newPageMode === "root" ? "Nouvelle page" : `Sous-page de « ${selectedPage?.title ?? ""} »`}
              </label>
              <input
                id="new-wiki-page-title"
                autoFocus
                value={newPageTitle}
                onChange={(event) => setNewPageTitle(event.target.value.slice(0, 120))}
                maxLength={120}
                disabled={creating}
                className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background-panel)] px-3 text-sm text-[var(--foreground)]"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setNewPageMode(null)} disabled={creating} className={btnClass}>Annuler</button>
                <button
                  type="submit"
                  disabled={creating || !newPageTitle.trim()}
                  className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[#0f1419] disabled:opacity-40"
                >
                  {creating ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="border-b p-3" style={{ borderColor: "var(--border)" }}>
            <label htmlFor="wiki-admin-search" className="sr-only">Rechercher une page du wiki</label>
            <input
              id="wiki-admin-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher…"
              className="min-h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]"
            />
          </div>

          <ul className="max-h-[42dvh] space-y-0.5 overflow-y-auto p-2 lg:max-h-[calc(100dvh-14rem)]">
            {query ? (
              searchResults.length > 0 ? (
                searchResults.map((page) => (
                  <li key={page.id}>
                    <button
                      type="button"
                      onClick={() => selectPage(page.id)}
                      disabled={busy}
                      className={`min-h-11 w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                        selectedId === page.id
                          ? "bg-[var(--accent)]/20 font-medium text-[var(--foreground)]"
                          : "text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)]"
                      }`}
                    >
                      <span className="block truncate">{page.title}</span>
                      <span className="block truncate text-xs text-[var(--foreground-muted)]">/{page.slug}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-2 py-6 text-center text-sm text-[var(--foreground-muted)]">Aucun résultat.</li>
              )
            ) : tree.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-[var(--foreground-muted)]">Aucune page.</li>
            ) : (
              tree.map((n) => (
                <AdminTreeRow
                  key={n.id}
                  node={n}
                  selectedId={selectedId}
                  expandedSlugs={expandedSlugs}
                  toggleExpand={toggleExpand}
                  onSelect={selectPage}
                  disabled={busy}
                />
              ))
            )}
          </ul>
          </div>
        </details>

        <section className="min-w-0" aria-label="Édition de la page">
          {selectedPage ? (
            <>
              <header className="sticky top-0 z-10 border-b bg-[var(--background-panel)] p-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
                  <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                    <span className="text-xs text-[var(--foreground-muted)]">Titre</span>
                    <input
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        clearSaveMessage();
                      }}
                      maxLength={120}
                      aria-invalid={!title.trim()}
                      disabled={deleting}
                      className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium text-[var(--foreground)]"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }}>
                      <button type="button" className="min-h-9 px-3 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] disabled:opacity-40" onClick={() => handleMove("up")} disabled={busy || dirty}>
                        {moving === "up" ? "Déplacement…" : "↑ Monter"}
                      </button>
                      <button type="button" className="min-h-9 border-l px-3 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] disabled:opacity-40" style={{ borderColor: "var(--border)" }} onClick={() => handleMove("down")} disabled={busy || dirty}>
                        {moving === "down" ? "Déplacement…" : "↓ Descendre"}
                      </button>
                    </div>
                    <button type="button" className={dangerBtn} onClick={() => setDeleteConfirmOpen(true)} disabled={busy}>
                      {deleting ? "Suppression…" : "Supprimer"}
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[#0f1419] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                      onClick={handleSave}
                      disabled={busy || !editor || !dirty}
                    >
                      {saving ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  </div>
                </div>
              </header>
              <div className="min-w-0 p-3 sm:p-4">
                <WikiEditor
                  key={selectedPage.id}
                  content={selectedPage.content}
                  serverRevision={selectedPage.updated_at ?? selectedPage.id}
                  onEditorReady={setEditor}
                  onDocumentChange={clearSaveMessage}
                />
              </div>
            </>
          ) : (
            <div className="grid min-h-72 place-items-center p-6 text-sm text-[var(--foreground-muted)]">
              Sélectionnez une page.
            </div>
          )}
        </section>
      </div>

      <AdminConfirmDialog
        open={deleteConfirmOpen && Boolean(selectedPage)}
        onClose={() => setDeleteConfirmOpen(false)}
        title={`Supprimer « ${selectedPage?.title ?? ""} » ?`}
        consequence={
          dirty
            ? "Cette page, ses sous-pages et vos modifications non enregistrées seront supprimées. Cette opération est irréversible."
            : "Cette page et ses sous-pages éventuelles seront supprimées. Cette opération est irréversible."
        }
        confirmLabel="Supprimer la page"
        danger
        busy={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
