import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { inputRegex } from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { wikiImagePublicUrl } from "@/lib/wiki/wikiImagePublicUrl";

/** Alignement image : gauche / droite = texte autour ; centré / bloc = pas de flottement. */
export type WikiImageAlign = "none" | "left" | "right" | "center";

/** TipTap attend `SetImageOptions` sur la chaîne ; on étend pour `storagePath` / `align`. */
declare module "@tiptap/extension-image" {
  interface SetImageOptions {
    storagePath?: string | null;
    align?: WikiImageAlign;
  }
}

function sanitizeImgDimension(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/**
 * Nœud image wiki : **pas** `Image.extend` depuis @tiptap/extension-image.
 * L’extension officielle attache un `addNodeView` (ResizableNodeView) qui fabrique un &lt;img&gt;
 * avec `el.src = HTMLAttributes.src` sans repasser par notre logique d’URL — d’où un DOM sans `src`.
 * Ici : `Node.create` seul, aucun NodeView, rendu uniquement via `renderHTML`.
 */
export const WikiImage = Node.create({
  name: "image",
  addOptions() {
    return {
      inline: false as const,
      allowBase64: false,
      HTMLAttributes: {},
    };
  },
  inline() {
    return this.options.inline;
  },
  group() {
    return this.options.inline ? "inline" : "block";
  },
  /** Requis pour le déplacement du bloc dans l’éditeur (ProseMirror). Le drag natif reste bloqué en CSS (`user-drag: none`). */
  draggable: true,
  atom: true,
  addAttributes() {
    return {
      src: {
        default: null as string | null,
      },
      alt: {
        default: null as string | null,
      },
      title: {
        default: null as string | null,
      },
      width: {
        default: null as number | null,
      },
      height: {
        default: null as number | null,
      },
      storagePath: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-storage-path"),
        renderHTML: (attributes) => {
          const p = attributes.storagePath as string | null | undefined;
          if (!p) return {};
          return { "data-storage-path": p };
        },
      },
      align: {
        default: "none" as WikiImageAlign,
        parseHTML: (element) =>
          (element.getAttribute("data-align") as WikiImageAlign) || "none",
        renderHTML: (attributes) => {
          const a = attributes.align as WikiImageAlign;
          if (!a || a === "none") return {};
          return { "data-align": a };
        },
      },
    };
  },
  parseHTML() {
    const baseTag = this.options.allowBase64 ? "img[src]" : 'img[src]:not([src^="data:"])';
    const readImgAttrs = (el: HTMLElement) => {
      const rawSrc = el.getAttribute("src")?.trim() ?? "";
      const storagePath = el.getAttribute("data-storage-path")?.trim() || null;
      const src =
        rawSrc && !rawSrc.startsWith("data:")
          ? rawSrc
          : storagePath
            ? wikiImagePublicUrl(storagePath) ?? ""
            : "";
      const alt = el.getAttribute("alt");
      const title = el.getAttribute("title");
      const w = el.getAttribute("width");
      const h = el.getAttribute("height");
      const alignRaw = el.getAttribute("data-align") as WikiImageAlign | null;
      const align: WikiImageAlign =
        alignRaw === "left" || alignRaw === "right" || alignRaw === "center" ? alignRaw : "none";
      return {
        src: src || null,
        storagePath,
        alt: alt?.trim() ? alt : null,
        title: title?.trim() ? title : null,
        width: sanitizeImgDimension(w),
        height: sanitizeImgDimension(h),
        align,
      };
    };
    return [
      {
        tag: baseTag,
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return readImgAttrs(el);
        },
      },
      /** Image référencée seulement par le chemin Storage (sans src dans le HTML). */
      {
        tag: "img[data-storage-path]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          if (el.getAttribute("src")?.trim()) return false;
          return readImgAttrs(el);
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const align = (node.attrs.align as WikiImageAlign) || "none";
    const base =
      "wiki-img h-auto max-h-[min(90vh,1200px)] rounded-xl max-w-full object-contain";
    const alignClass =
      align === "left"
        ? "wiki-img--left"
        : align === "right"
          ? "wiki-img--right"
          : align === "center"
            ? "wiki-img--center"
            : "wiki-img--block";
    const rest = { ...(HTMLAttributes as Record<string, unknown>) };
    delete rest.width;
    delete rest.height;
    delete rest.src;
    delete rest.draggable;

    const rawSrc = node.attrs.src;
    const srcFromNode =
      typeof rawSrc === "string" ? rawSrc.trim() : rawSrc != null ? String(rawSrc).trim() : "";
    const srcFromPath =
      typeof node.attrs.storagePath === "string"
        ? wikiImagePublicUrl(node.attrs.storagePath.trim())
        : null;
    const resolvedSrc = (srcFromNode || srcFromPath || "").trim() || undefined;

    const w = sanitizeImgDimension(node.attrs.width);
    const h = sanitizeImgDimension(node.attrs.height);
    const dim: Record<string, string> = {};
    if (w != null) dim.width = String(Math.round(w));
    if (h != null) dim.height = String(Math.round(h));

    const withoutSrc = mergeAttributes(this.options.HTMLAttributes, rest, dim, {
      class: `${base} ${alignClass}`.trim(),
      "data-align": align === "none" ? undefined : align,
    }) as Record<string, string | undefined>;
    delete withoutSrc.src;

    return ["img", mergeAttributes(withoutSrc, resolvedSrc ? { src: resolvedSrc } : {})];
  },
  addCommands() {
    return {
      setImage:
        (options: {
          src: string;
          alt?: string;
          title?: string;
          width?: number | null;
          height?: number | null;
          storagePath?: string | null;
          align?: WikiImageAlign;
        }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: inputRegex,
        type: this.type,
        getAttributes: (match) => {
          const [, , alt, src, title] = match;
          return { src, alt, title };
        },
      }),
    ];
  },
});

const linkClass = "text-white underline hover:text-white/95";

export function getWikiExtensions(options?: { placeholder?: string }): Extensions {
  const exts: Extensions = [
    StarterKit.configure({
      gapcursor: false,
      heading: { levels: [2, 3, 4] },
      link: {
        openOnClick: false,
        HTMLAttributes: {
          class: linkClass,
          rel: "noopener noreferrer",
        },
      },
    }),
    WikiImage.configure({
      allowBase64: false,
      HTMLAttributes: {},
    }),
  ];
  if (options?.placeholder != null) {
    exts.push(
      Placeholder.configure({
        placeholder: options.placeholder,
      })
    );
  }
  return exts;
}

export const EMPTY_WIKI_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }],
} as const;
