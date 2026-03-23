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
  "rounded-lg border border-white/25 bg-white/10 px-2 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-40";

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

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/20 bg-[var(--background-panel)] p-2">
        <button type="button" className={toolbarBtn} onClick={() => editor.chain().focus().toggleBold().run()}>
          Gras
        </button>
        <button type="button" className={toolbarBtn} onClick={() => editor.chain().focus().toggleItalic().run()}>
          Italique
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          Titre 2
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          Titre 3
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        >
          Titre 4
        </button>
        <button type="button" className={toolbarBtn} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Liste
        </button>
        <button type="button" className={toolbarBtn} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          Liste num.
        </button>
        <button type="button" className={toolbarBtn} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          Séparateur
        </button>
        <button type="button" className={toolbarBtn} onClick={setLink}>
          Lien
        </button>
        <button type="button" className={toolbarBtn} onClick={insertImage}>
          Image
        </button>
        {isWikiImageToolbarVisible(editor) ? (
          <>
            <span className="mx-1 w-full basis-full text-xs text-[var(--foreground-muted)] sm:basis-auto sm:w-auto">
              Image : cliquez pour sélectionner. Alignement (texte autour) et largeur :
            </span>
            <button
              type="button"
              className={toolbarBtn}
              title="Bloc pleine largeur"
              onClick={() => setImageAlign("none")}
            >
              Bloc
            </button>
            <button
              type="button"
              className={toolbarBtn}
              title="Image à gauche, texte à droite"
              onClick={() => setImageAlign("left")}
            >
              Gauche
            </button>
            <button
              type="button"
              className={toolbarBtn}
              title="Image à droite, texte à gauche"
              onClick={() => setImageAlign("right")}
            >
              Droite
            </button>
            <button
              type="button"
              className={toolbarBtn}
              title="Centré, pas de texte autour"
              onClick={() => setImageAlign("center")}
            >
              Centré
            </button>
            <span className="mx-1 text-xs text-[var(--foreground-muted)] self-center">Largeur</span>
            {[25, 33, 50, 66, 75, 100].map((pct) => (
              <button key={pct} type="button" className={toolbarBtn} onClick={() => setImageWidthPct(pct)}>
                {pct}%
              </button>
            ))}
          </>
        ) : null}
        <button type="button" className={toolbarBtn} onClick={() => editor.chain().focus().undo().run()}>
          Annuler
        </button>
        <button type="button" className={toolbarBtn} onClick={() => editor.chain().focus().redo().run()}>
          Rétablir
        </button>
      </div>
      <EditorContent editor={editor} className={proseClass} />
    </div>
  );
}
