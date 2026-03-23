import type { JSONContent } from "@tiptap/core";

export type WikiPageRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  title: string;
  sort_order: number;
  content: JSONContent;
  /** HTML généré côté serveur (@tiptap/html/server) pour la lecture publique — préféré à TipTap React. */
  contentHtml: string;
  search_text: string;
  updated_at?: string;
};

export type WikiTreeNode = WikiPageRow & { children: WikiTreeNode[] };
