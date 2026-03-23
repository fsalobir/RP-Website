"use client";

import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWikiPageAction,
  deleteWikiPageAction,
  moveWikiPageAction,
  saveWikiPageAction,
} from "@/app/actions/wiki";
import { WikiEditor } from "@/components/wiki/WikiEditor";
import { buildWikiTree, getAncestorSlugs } from "@/lib/wiki/tree";
import type { WikiPageRow, WikiTreeNode } from "@/lib/wiki/types";

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
}: {
  node: WikiTreeNode;
  selectedId: string | null;
  expandedSlugs: Set<string>;
  toggleExpand: (slug: string) => void;
  onSelect: (id: string) => void;
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
            className="shrink-0 rounded p-1 text-[var(--foreground-muted)] hover:bg-[var(--background-elevated)] hover:text-[var(--foreground)]"
            aria-expanded={expanded}
            title={expanded ? "Replier" : "Développer"}
          >
            <span
              className={`inline-block text-xs transition-transform ${expanded ? "rotate-90" : ""}`}
              aria-hidden
            >
              ▶
            </span>
          </button>
        ) : (
          <span className="inline-block w-7 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
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
  const [msg, setMsg] = useState<string | null>(null);
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setPages(initialPages);
  }, [initialPages]);

  const tree = useMemo(() => buildWikiTree(pages), [pages]);

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
  }, []);

  const selectPage = useCallback(
    (id: string) => {
      setSelectedId(id);
      const p = pages.find((x) => x.id === id);
      if (p) setTitle(p.title);
      setMsg(null);
    },
    [pages]
  );

  const handleSave = useCallback(async () => {
    if (!selectedPage || !editor) return;
    setSaving(true);
    setMsg(null);
    const rawDoc = editor.getJSON() as JSONContent;
    /**
     * Les Server Actions sérialisent les arguments (structured clone / RSC). Le JSON TipTap
     * peut arriver côté serveur sans `attrs` sur les images (voir logs H1 vs H2 : input cassé).
     * Forcer un objet JSON plain garantit la même forme qu’après persistance DB.
     */
    const content = JSON.parse(JSON.stringify(rawDoc)) as JSONContent;
    const res = await saveWikiPageAction({
      id: selectedPage.id,
      title: title.trim() || selectedPage.title,
      content,
    });
    setSaving(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg("Enregistré.");
    router.refresh();
  }, [selectedPage, editor, title, router]);

  const handleNewRoot = useCallback(async () => {
    const name = window.prompt("Titre de la nouvelle section (racine)", "Nouvelle page");
    if (!name?.trim()) return;
    const res = await createWikiPageAction({ parent_id: null, title: name.trim() });
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
    setSelectedId(res.id);
  }, [router]);

  const handleNewChild = useCallback(async () => {
    if (!selectedPage) return;
    const name = window.prompt("Titre de la sous-section", "Nouvelle sous-page");
    if (!name?.trim()) return;
    const res = await createWikiPageAction({ parent_id: selectedPage.id, title: name.trim() });
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
    setSelectedId(res.id);
  }, [selectedPage, router]);

  const handleDelete = useCallback(async () => {
    if (!selectedPage) return;
    if (!window.confirm(`Supprimer « ${selectedPage.title} » et ses sous-pages éventuelles ?`)) return;
    const res = await deleteWikiPageAction(selectedPage.id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
    setSelectedId(null);
    setTitle("");
  }, [selectedPage, router]);

  const handleMove = useCallback(
    async (dir: "up" | "down") => {
      if (!selectedPage) return;
      await moveWikiPageAction(selectedPage.id, dir);
      router.refresh();
    },
    [selectedPage, router]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold text-[var(--foreground)]">Wiki</h1>
      <p className="mb-6 text-sm text-[var(--foreground-muted)]">
        Éditez les pages du wiki public. Les images sont stockées dans le bucket « wiki-images » (max. 5 Mo).
      </p>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-72">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-panel)] p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" className={btnClass} onClick={handleNewRoot}>
                + Section racine
              </button>
              <button type="button" className={btnClass} onClick={handleNewChild} disabled={!selectedPage}>
                + Sous-section
              </button>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto space-y-0.5">
              {tree.length === 0 ? (
                <li className="text-sm text-[var(--foreground-muted)]">Aucune page. Créez-en une.</li>
              ) : (
                tree.map((n) => (
                  <AdminTreeRow
                    key={n.id}
                    node={n}
                    selectedId={selectedId}
                    expandedSlugs={expandedSlugs}
                    toggleExpand={toggleExpand}
                    onSelect={selectPage}
                  />
                ))
              )}
            </ul>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          {selectedPage ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <span className="text-xs text-[var(--foreground-muted)]">Titre</span>
                  <input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setMsg(null);
                    }}
                    className="rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2 text-sm text-[var(--foreground)]"
                  />
                </label>
                <button type="button" className={btnClass} onClick={() => handleMove("up")} disabled={saving}>
                  Monter
                </button>
                <button type="button" className={btnClass} onClick={() => handleMove("down")} disabled={saving}>
                  Descendre
                </button>
                <button type="button" className={dangerBtn} onClick={handleDelete} disabled={saving}>
                  Supprimer
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50"
                  onClick={handleSave}
                  disabled={saving || !editor}
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
              {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}
              <WikiEditor
                key={selectedPage.id}
                content={selectedPage.content}
                serverRevision={selectedPage.updated_at ?? selectedPage.id}
                onEditorReady={setEditor}
                onDocumentChange={clearSaveMessage}
              />
            </>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">Sélectionnez une page dans l’arborescence.</p>
          )}
        </main>
      </div>
    </div>
  );
}
