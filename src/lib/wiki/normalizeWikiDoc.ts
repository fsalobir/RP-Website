import type { JSONContent } from "@tiptap/core";
import { getSupabasePublicUrlBase, wikiImagePublicUrl } from "@/lib/wiki/wikiImagePublicUrl";

const FALLBACK_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * Reconstruit une URL publique stable pour le bucket wiki-images (évite src
 * tronqué, http vs https, ou anciennes URLs après changement de projet).
 */
export function normalizeWikiImageAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const base = getSupabasePublicUrlBase();
  const path = attrs.storagePath;
  if (typeof path === "string" && path.trim().length > 0) {
    const rebuilt = wikiImagePublicUrl(path.trim());
    if (rebuilt) attrs.src = rebuilt;
  }

  if (typeof attrs.src === "string") {
    let s = attrs.src.trim();
    if (s.length === 0) {
      attrs.src = null;
    } else {
      try {
        if (base && s.startsWith("http://")) {
          const parsed = new URL(s);
          const b = new URL(base);
          if (parsed.hostname === b.hostname) {
            s = s.replace(/^http:/, "https:");
          }
        }
      } catch {
        /* ignore */
      }
      attrs.src = s;
    }
  }

  const w = attrs.width;
  const h = attrs.height;

  if (typeof w === "string" && w.includes("%")) {
    attrs.width = null;
    attrs.height = null;
  } else if (typeof w === "string" && /^[\d.]+$/.test(w.trim())) {
    const n = Number.parseFloat(w);
    attrs.width = n > 0 && Number.isFinite(n) ? n : null;
  }
  if (typeof h === "string" && h.includes("%")) {
    attrs.height = null;
  }

  /** width/height à 0 ou négatif → <img width="0"> = point quasi invisible + object-fit cassé */
  if (typeof attrs.width === "number" && (!Number.isFinite(attrs.width) || attrs.width <= 0)) {
    attrs.width = null;
  }
  if (typeof attrs.height === "number" && (!Number.isFinite(attrs.height) || attrs.height <= 0)) {
    attrs.height = null;
  }

  return attrs;
}

/**
 * Dans une liste, le texte du &lt;li&gt; peut encore commencer par « - » ou « 1. »
 * (saisie Markdown / conversion) alors que le navigateur affiche déjà une puce ou un numéro → doublon visuel.
 */
function stripListItemParagraphPrefix(
  paragraph: JSONContent,
  parentListType: string | undefined
): JSONContent {
  if (
    parentListType !== "bulletList" &&
    parentListType !== "orderedList"
  ) {
    return paragraph;
  }
  if (paragraph.type !== "paragraph" || !Array.isArray(paragraph.content) || paragraph.content.length === 0) {
    return paragraph;
  }
  const first = paragraph.content[0];
  if (first.type !== "text" || typeof first.text !== "string") {
    return paragraph;
  }
  /** Tiret / puce déjà rendus par &lt;ul&gt;/&lt;ol&gt; : on retire le préfixe même si seul « - » en fin de segment. */
  const pattern =
    parentListType === "bulletList"
      ? /^\s*[-*•](?:\s+|$)/
      : /^\s*\d+[.)](?:\s+|$)/;
  const newText = first.text.replace(pattern, "");
  if (newText === first.text) {
    return paragraph;
  }
  return {
    ...paragraph,
    content: [{ ...first, text: newText }, ...paragraph.content.slice(1)],
  };
}

/**
 * Corrige les attributs image invalides (ex. width "50%" → le NodeView TipTap
 * fait `${width}px` → "50%px", ce qui casse le resize et peut corrompre le doc).
 */
export function normalizeWikiDoc(doc: JSONContent | null | undefined): JSONContent {
  if (!doc || typeof doc !== "object") {
    return { ...FALLBACK_DOC };
  }

  const walk = (node: JSONContent, parentType?: string): JSONContent => {
    /**
     * Si `attrs` est absent (JSON DB / vieux exports), `Node.fromJSON` reçoit
     * `create(undefined)` et ProseMirror remplit uniquement avec `defaultAttrs` → src/storagePath perdus.
     * On normalise toujours un objet attrs pour les images.
     */
    if (node.type === "image") {
      const rawAttrs =
        node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs)
          ? { ...(node.attrs as Record<string, unknown>) }
          : {};
      const attrs = normalizeWikiImageAttrs(rawAttrs);
      return { ...node, attrs };
    }

    if (node.type === "listItem" && Array.isArray(node.content)) {
      return {
        ...node,
        content: node.content.map((child, idx) => {
          if (idx === 0 && child.type === "paragraph") {
            return stripListItemParagraphPrefix(child, parentType);
          }
          return walk(child, "listItem");
        }),
      };
    }

    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map((child) => walk(child, node.type)) };
    }
    return node;
  };

  return walk(doc);
}
