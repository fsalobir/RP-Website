import type { JSONContent } from "@tiptap/core";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pour chaque nœud image avec `storagePath`, force `attrs.src` à l’URL exacte
 * retournée par `storage.from('wiki-images').getPublicUrl()` (même logique que l’upload).
 * Sans ça, une concaténation manuelle peut diverger du SDK (encodeURI, chemins, etc.).
 */
export function applySupabasePublicUrlsToImages(doc: JSONContent, supabase: SupabaseClient): JSONContent {
  const walk = (node: JSONContent): JSONContent => {
    if (node.type === "image" && node.attrs && typeof node.attrs === "object") {
      const attrs = { ...(node.attrs as Record<string, unknown>) };
      const sp = attrs.storagePath;
      if (typeof sp === "string" && sp.trim().length > 0) {
        const { data } = supabase.storage.from("wiki-images").getPublicUrl(sp.trim());
        if (data?.publicUrl) {
          attrs.src = data.publicUrl;
        }
      }
      return { ...node, attrs };
    }
    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map(walk) };
    }
    return node;
  };
  return walk(doc);
}
