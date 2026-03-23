"use client";

import { WikiContentRenderer } from "@/components/wiki/WikiContentRenderer";
import type { JSONContent } from "@tiptap/core";

/** Même base typographique que WikiContentRenderer + styles globaux `.wiki-tiptap img.wiki-img`. */
const proseClass =
  "wiki-tiptap max-w-none text-white/90 outline-none ring-0 [&_a]:text-white [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white/95 [&_h3]:mt-6 [&_h3]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-white/95 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_hr]:border-white/20 [&_hr]:my-6 [&_p]:mb-4 [&_strong]:text-white";

export function WikiPageBody({
  content,
  contentHtml,
  contentRevision,
}: {
  content: JSONContent;
  /** HTML pré-rendu serveur (TipTap `generateHTML`) — affiche les images sans éditeur React. */
  contentHtml: string;
  contentRevision: string;
}) {
  if (contentHtml.trim().length > 0) {
    return <div className={proseClass} dangerouslySetInnerHTML={{ __html: contentHtml }} />;
  }
  return <WikiContentRenderer content={content} contentRevision={contentRevision} />;
}
