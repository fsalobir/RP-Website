"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { useEffect, useMemo, useRef } from "react";
import { EMPTY_WIKI_DOC, getWikiExtensions } from "@/lib/wiki/tiptap-extensions";
import { normalizeWikiDoc } from "@/lib/wiki/normalizeWikiDoc";

const proseClass =
  "wiki-tiptap max-w-none text-white/90 outline-none ring-0 focus-within:outline-none focus-within:ring-0 [&_a]:text-white [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white/95 [&_h3]:mt-6 [&_h3]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-white/95 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_hr]:border-white/20 [&_hr]:my-6 [&_p]:mb-4 [&_strong]:text-white";

type Props = {
  content: JSONContent;
  /** Aligné sur `updated_at` de la page : n’écrase le doc que si le serveur a une nouvelle révision. */
  contentRevision: string;
};

export function WikiContentRenderer({ content, contentRevision }: Props) {
  const lastAppliedRevision = useRef<string | null>(null);

  const extensions = useMemo(() => getWikiExtensions(), []);

  const editorOptions = useMemo(
    () => ({
      extensions,
      content: EMPTY_WIKI_DOC as unknown as JSONContent,
      editable: false,
      immediatelyRender: false,
    }),
    [extensions]
  );

  const editor = useEditor(editorOptions);

  useEffect(() => {
    if (!editor || !content) return;
    if (lastAppliedRevision.current === contentRevision) {
      return;
    }
    const normalized = normalizeWikiDoc(content);
    editor.commands.setContent(normalized);
    lastAppliedRevision.current = contentRevision;
  }, [editor, content, contentRevision]);

  if (!editor) {
    return <p className="text-white/60 text-sm">Chargement du contenu…</p>;
  }

  return <EditorContent editor={editor} className={proseClass} />;
}
