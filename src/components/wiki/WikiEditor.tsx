"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  EMPTY_WIKI_DOC,
  getWikiExtensions,
  type WikiImageAlign,
} from "@/lib/wiki/tiptap-extensions";
import { normalizeWikiDoc } from "@/lib/wiki/normalizeWikiDoc";
import { getWikiEditorProps } from "@/lib/wiki/wikiEditorProps";
import { uploadWikiImageAction } from "@/app/actions/wiki";

const toolbarBtn =
  "inline-flex shrink-0 items-center justify-center rounded-md px-2.5 text-sm font-medium text-[var(--foreground-muted)] transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35";

const toolbarSelect =
  "shrink-0 rounded-md border border-white/15 bg-[var(--background)] px-2 text-sm font-medium text-white outline-none";

const imageWidthOptions = [25, 33, 50, 66, 75, 100] as const;

const proseClass =
  "wiki-tiptap min-h-[280px] max-w-none rounded-xl border border-white/20 bg-black/20 p-4 text-white/90 outline-none ring-0 focus-within:outline-none focus-within:ring-0 [&_a]:text-[var(--accent)] [&_h2]:text-lg [&_h3]:text-base [&_p]:mb-2";

/**
 * `editor.isActive("image")` peut rester faux pour une NodeSelection sur un nœud feuille (image atomique).
 */
function isWikiImageToolbarVisible(editor: Editor): boolean {
  if (editor.isActive("image")) return true;
  const sel = editor.state.selection;
  return sel instanceof NodeSelection && sel.node.type.name === "image";
}

type Props = {
  content: JSONContent;
  /**
   * Révision serveur (ex. `updated_at` ISO). On n’applique `setContent` que lorsqu’elle change,
   * sinon chaque re-render (onglet, focus) réinjecterait le JSON « figé » des props et effacerait
   * les modifications locales (dont les images non encore enregistrées).
   */
  serverRevision: string;
  onEditorReady: (editor: Editor | null) => void;
  /** Appelé à chaque modification du document (pour réinitialiser le message « Enregistré » côté parent). */
  onDocumentChange?: () => void;
};

export function WikiEditor({ content, serverRevision, onEditorReady, onDocumentChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  /** Évite d’appeler onDocumentChange lors d’un setContent programmé (ex. après enregistrement). */
  const syncingFromProps = useRef(false);
  /** Dernière révision serveur déjà injectée dans l’éditeur (évite d’écraser les brouillons). */
  const lastAppliedServerRevision = useRef<string | null>(null);

  /**
   * Référence stable : sinon useEditor compare `extensions` par référence à chaque render et
   * appelle `setOptions` en boucle (voir @tiptap/react EditorInstanceManager.compareOptions).
   */
  const extensions = useMemo(
    () =>
      getWikiExtensions({
        placeholder: "Rédigez le contenu du wiki…",
      }),
    []
  );

  const editorOptions = useMemo(
    () => ({
      extensions,
      content: EMPTY_WIKI_DOC as unknown as JSONContent,
      immediatelyRender: false,
      /** Sans ceci, `useEditor` ne re-rend pas sur les transactions → la barre image ne s’affiche pas au clic. */
      shouldRerenderOnTransaction: true,
      editorProps: getWikiEditorProps(),
    }),
    [extensions]
  );

  /**
   * Ne pas passer `content` dans la config useEditor : quand le serveur renvoie du JSON après
   * enregistrement, TipTap recréait l’éditeur, onDestroy mettait editor à null et le bouton
   * Enregistrer restait désactivé. On initialise une fois puis on synchronise via setContent.
   */
  const editor = useEditor(editorOptions);

  useEffect(() => {
    onEditorReady(editor ?? null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    return () => onEditorReady(null);
  }, [onEditorReady]);

  useEffect(() => {
    if (!editor || !content) return;
    /** Même page, même enregistrement serveur → ne pas réécraser l’éditeur (brouillon / images locales). */
    if (lastAppliedServerRevision.current === serverRevision) {
      return;
    }
    const normalized = normalizeWikiDoc(content);
    syncingFromProps.current = true;
    editor.commands.setContent(normalized);
    lastAppliedServerRevision.current = serverRevision;
    window.setTimeout(() => {
      syncingFromProps.current = false;
    }, 0);
  }, [editor, content, serverRevision]);

  useEffect(() => {
    if (!editor || !onDocumentChange) return;
    const handler = () => {
      if (syncingFromProps.current) return;
      onDocumentChange();
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor, onDocumentChange]);

  const insertImage = useCallback(async () => {
    fileRef.current?.click();
  }, []);

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !editor) return;
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadWikiImageAction(fd);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      const url = res.url.trim();
      const storagePath = res.path.trim();
      if (!url || !storagePath) {
        alert("Réponse d’upload invalide (URL ou chemin vide).");
        return;
      }
      /** Objet attrs complet : évite tout merge ambigu avec insertContent / setImage. */
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: "image",
            attrs: {
              src: url,
              storagePath,
              alt: null,
              title: null,
              width: null,
              height: null,
              align: "none" as WikiImageAlign,
            },
          },
        ])
        .run();
    },
    [editor]
  );

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL du lien", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const setImageWidthPct = useCallback(
    (pct: number) => {
      if (!editor) return;
      /** Largeur en px : le resize TipTap attend des nombres (`${width}px`), pas des chaînes "50%". */
      const rect = editor.view.dom.getBoundingClientRect();
      const px = Math.max(64, Math.round((rect.width * pct) / 100));
      editor.chain().focus().updateAttributes("image", { width: px, height: null }).run();
    },
    [editor]
  );

  const setImageAlign = useCallback(
    (align: WikiImageAlign) => {
      if (!editor) return;
      editor.chain().focus().updateAttributes("image", { align }).run();
    },
    [editor]
  );

  if (!editor) {
    return <p className="text-sm text-[var(--foreground-muted)]">Initialisation de l’éditeur…</p>;
  }

  const selectedImage = isWikiImageToolbarVisible(editor);
  const rawImageAlign = editor.getAttributes("image").align as WikiImageAlign | undefined;
  const selectedImageAlign: WikiImageAlign =
    rawImageAlign === "left" || rawImageAlign === "right" || rawImageAlign === "center"
      ? rawImageAlign
      : "none";
  const imageWidth = Number(editor.getAttributes("image").width);
  const editorWidth = editor.view.dom.getBoundingClientRect().width;
  const imageWidthPct =
    imageWidth > 0 && editorWidth > 0
      ? imageWidthOptions.reduce((closest, pct) =>
          Math.abs(pct - (imageWidth / editorWidth) * 100) <
          Math.abs(closest - (imageWidth / editorWidth) * 100)
            ? pct
            : closest
        )
      : 100;
  const blockStyle = editor.isActive("heading", { level: 2 })
    ? "2"
    : editor.isActive("heading", { level: 3 })
      ? "3"
      : editor.isActive("heading", { level: 4 })
        ? "4"
        : "paragraph";
  const buttonClass = (active = false) =>
    `${toolbarBtn} ${active ? "bg-white/15 text-white" : ""}`;

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <div
        role="toolbar"
        aria-label="Mise en forme du contenu"
        className="flex items-center gap-1 overflow-x-auto rounded-xl border border-white/15 bg-[var(--background-panel)] px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div role="group" aria-label="Style du texte" className="flex shrink-0 items-center gap-0.5 border-r border-white/10 pr-1">
          <select
            aria-label="Niveau de titre"
            className={toolbarSelect}
            value={blockStyle}
            onChange={(event) => {
              const level = Number(event.target.value);
              if (level === 2 || level === 3 || level === 4) {
                editor.chain().focus().setHeading({ level }).run();
              } else {
                editor.chain().focus().setParagraph().run();
              }
            }}
          >
            <option value="paragraph">Texte</option>
            <option value="2">Titre 2</option>
            <option value="3">Titre 3</option>
            <option value="4">Titre 4</option>
          </select>
          <button
            type="button"
            className={buttonClass(editor.isActive("bold"))}
            aria-label="Gras"
            aria-pressed={editor.isActive("bold")}
            title="Gras"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong aria-hidden="true">G</strong>
          </button>
          <button
            type="button"
            className={buttonClass(editor.isActive("italic"))}
            aria-label="Italique"
            aria-pressed={editor.isActive("italic")}
            title="Italique"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em aria-hidden="true">I</em>
          </button>
        </div>

        <div role="group" aria-label="Listes" className="flex shrink-0 items-center gap-0.5 border-r border-white/10 pr-1">
          <button
            type="button"
            className={buttonClass(editor.isActive("bulletList"))}
            aria-pressed={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • Liste
          </button>
          <button
            type="button"
            className={buttonClass(editor.isActive("orderedList"))}
            aria-pressed={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. Liste
          </button>
        </div>

        <div role="group" aria-label="Insérer" className="flex shrink-0 items-center gap-0.5 border-r border-white/10 pr-1">
          <button
            type="button"
            className={buttonClass(editor.isActive("link"))}
            aria-pressed={editor.isActive("link")}
            onClick={setLink}
          >
            Lien
          </button>
          <button type="button" className={toolbarBtn} onClick={insertImage}>
            Image
          </button>
          <button
            type="button"
            className={toolbarBtn}
            title="Insérer un séparateur"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            Séparateur
          </button>
        </div>

        <div role="group" aria-label="Historique" className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={toolbarBtn}
            aria-label="Annuler la dernière modification"
            title="Annuler"
            disabled={!editor.can().chain().focus().undo().run()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            ↶
          </button>
          <button
            type="button"
            className={toolbarBtn}
            aria-label="Rétablir la modification"
            title="Rétablir"
            disabled={!editor.can().chain().focus().redo().run()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            ↷
          </button>
        </div>
      </div>

      {selectedImage ? (
        <div
          role="group"
          aria-label="Réglages de l’image sélectionnée"
          className="flex flex-wrap items-end gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--background-panel))] p-2"
        >
          <strong className="w-full self-center text-sm sm:mr-auto sm:w-auto">Image sélectionnée</strong>
          <label className="grid min-w-0 flex-1 gap-1 text-xs text-[var(--foreground-muted)] sm:max-w-48">
            Disposition
            <select
              className={toolbarSelect}
              value={selectedImageAlign}
              onChange={(event) => setImageAlign(event.target.value as WikiImageAlign)}
            >
              <option value="none">Bloc</option>
              <option value="left">À gauche du texte</option>
              <option value="center">Centrée</option>
              <option value="right">À droite du texte</option>
            </select>
          </label>
          <label className="grid min-w-24 gap-1 text-xs text-[var(--foreground-muted)]">
            Largeur
            <select
              className={toolbarSelect}
              value={imageWidthPct}
              onChange={(event) => setImageWidthPct(Number(event.target.value))}
            >
              {imageWidthOptions.map((pct) => (
                <option key={pct} value={pct}>
                  {pct} %
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <EditorContent editor={editor} className={proseClass} />
    </div>
  );
}
