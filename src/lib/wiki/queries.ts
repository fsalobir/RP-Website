import { createClient } from "@/lib/supabase/server";
import type { WikiPageRow } from "./types";
import type { JSONContent } from "@tiptap/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_WIKI_DOC } from "./tiptap-extensions";
import { normalizeWikiDoc } from "./normalizeWikiDoc";
import { applySupabasePublicUrlsToImages } from "./wikiStorageImageUrls";
import { renderWikiHtml } from "./renderWikiHtml";

function parseContent(raw: unknown, supabase: SupabaseClient): JSONContent {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return applySupabasePublicUrlsToImages(normalizeWikiDoc(null), supabase);
    }
  }
  if (parsed && typeof parsed === "object" && "type" in (parsed as object)) {
    return applySupabasePublicUrlsToImages(normalizeWikiDoc(parsed as JSONContent), supabase);
  }
  return applySupabasePublicUrlsToImages(
    normalizeWikiDoc({ ...(EMPTY_WIKI_DOC as unknown as JSONContent) }),
    supabase
  );
}

export async function fetchWikiPages(): Promise<WikiPageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wiki_pages")
    .select("id,parent_id,slug,title,sort_order,content,search_text,updated_at")
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[wiki] fetchWikiPages", error.message);
    return [];
  }

  const rows = (data ?? []).map((row) => {
    const content = parseContent(row.content, supabase);
    return {
      ...row,
      content,
      contentHtml: renderWikiHtml(content),
    };
  }) as WikiPageRow[];

  rows.sort((a, b) => {
    const pa = a.parent_id;
    const pb = b.parent_id;
    if (pa !== pb) {
      if (pa === null && pb !== null) return -1;
      if (pb === null && pa !== null) return 1;
      if (pa && pb) {
        const c = pa.localeCompare(pb);
        if (c !== 0) return c;
      }
    }
    return a.sort_order - b.sort_order;
  });

  return rows;
}
