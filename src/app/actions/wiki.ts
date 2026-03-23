"use server";

import { revalidatePath } from "next/cache";
import type { JSONContent } from "@tiptap/core";
import { getCachedAuth } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { extractPlainTextFromTipTapDoc, toPlainJsonDoc } from "@/lib/wiki/extractPlainText";
import { normalizeWikiDoc } from "@/lib/wiki/normalizeWikiDoc";
import { applySupabasePublicUrlsToImages } from "@/lib/wiki/wikiStorageImageUrls";
import { slugifyTitle } from "@/lib/wiki/slug";
import { wikiImagePublicUrl } from "@/lib/wiki/wikiImagePublicUrl";

function buildSearchText(title: string, doc: JSONContent): string {
  const plain = extractPlainTextFromTipTapDoc(doc);
  return `${title} ${plain}`.trim();
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const supabase = await createClient();
  let slug = base;
  let n = 0;
  while (n < 200) {
    const q = supabase.from("wiki_pages").select("id").eq("slug", slug).maybeSingle();
    const { data } = await q;
    if (!data || data.id === excludeId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export async function saveWikiPageAction(input: {
  id: string;
  title: string;
  content: JSONContent;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getCachedAuth();
  if (!auth.user || !auth.isAdmin) {
    return { ok: false, error: "Accès refusé." };
  }
  const supabase = await createClient();
  const contentPlain = applySupabasePublicUrlsToImages(
    normalizeWikiDoc(toPlainJsonDoc(input.content)),
    supabase
  );
  const search_text = buildSearchText(input.title, contentPlain);
  const { error } = await supabase
    .from("wiki_pages")
    .update({
      title: input.title,
      content: contentPlain as unknown as Record<string, unknown>,
      search_text,
    })
    .eq("id", input.id);

  if (error) {
    console.error("[wiki] save", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/wiki");
  revalidatePath("/admin/wiki");
  return { ok: true };
}

export async function createWikiPageAction(input: {
  parent_id: string | null;
  title: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await getCachedAuth();
  if (!auth.user || !auth.isAdmin) {
    return { ok: false, error: "Accès refusé." };
  }
  const supabase = await createClient();
  const baseSlug = slugifyTitle(input.title);
  const slug = await ensureUniqueSlug(baseSlug);

  let siblingQuery = supabase
    .from("wiki_pages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  siblingQuery =
    input.parent_id === null
      ? siblingQuery.is("parent_id", null)
      : siblingQuery.eq("parent_id", input.parent_id);
  const { data: lastSibling } = await siblingQuery;
  const sort_order = (lastSibling?.[0]?.sort_order ?? -1) + 1;

  const empty: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
  const search_text = buildSearchText(input.title, empty);

  const { data, error } = await supabase
    .from("wiki_pages")
    .insert({
      parent_id: input.parent_id,
      slug,
      title: input.title,
      sort_order,
      content: empty as unknown as Record<string, unknown>,
      search_text,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[wiki] create", error);
    return { ok: false, error: error?.message ?? "Création impossible." };
  }
  revalidatePath("/wiki");
  revalidatePath("/admin/wiki");
  return { ok: true, id: data.id };
}

export async function deleteWikiPageAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getCachedAuth();
  if (!auth.user || !auth.isAdmin) {
    return { ok: false, error: "Accès refusé." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("wiki_pages").delete().eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/wiki");
  revalidatePath("/admin/wiki");
  return { ok: true };
}

export async function moveWikiPageAction(
  id: string,
  direction: "up" | "down"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getCachedAuth();
  if (!auth.user || !auth.isAdmin) {
    return { ok: false, error: "Accès refusé." };
  }
  const supabase = await createClient();
  const { data: row, error: e1 } = await supabase.from("wiki_pages").select("*").eq("id", id).single();
  if (e1 || !row) return { ok: false, error: "Page introuvable." };

  const parentId = row.parent_id;
  let sibQ = supabase.from("wiki_pages").select("id,sort_order").order("sort_order", { ascending: true });
  sibQ = parentId === null ? sibQ.is("parent_id", null) : sibQ.eq("parent_id", parentId);
  const { data: siblings, error: e2 } = await sibQ;

  if (e2 || !siblings?.length) return { ok: false, error: "Ordre impossible." };

  const idx = siblings.findIndex((s) => s.id === id);
  if (idx < 0) return { ok: false, error: "Page introuvable." };
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return { ok: true };

  const a = siblings[idx];
  const b = siblings[swapWith];
  const { error: e3 } = await supabase.from("wiki_pages").update({ sort_order: b.sort_order }).eq("id", a.id);
  const { error: e4 } = await supabase.from("wiki_pages").update({ sort_order: a.sort_order }).eq("id", b.id);
  if (e3 || e4) return { ok: false, error: e3?.message ?? e4?.message ?? "Erreur." };

  revalidatePath("/wiki");
  revalidatePath("/admin/wiki");
  return { ok: true };
}

export async function uploadWikiImageAction(
  formData: FormData
): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> {
  try {
    const auth = await getCachedAuth();
    if (!auth.user || !auth.isAdmin) {
      return { ok: false, error: "Accès refusé." };
    }
    const file = formData.get("file");
    if (!file || !(file instanceof Blob) || file.size === 0) {
      return { ok: false, error: "Fichier manquant." };
    }
    const max = 5 * 1024 * 1024;
    if (file.size > max) {
      return { ok: false, error: "Fichier trop volumineux (max. 5 Mo)." };
    }
    const supabase = await createClient();
    const name = typeof (file as File).name === "string" ? (file as File).name : "image";
    const ext = name.split(".").pop()?.toLowerCase() || "bin";
    const safeExt = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ? ext : "bin";
    const path = `${auth.user.id}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;

    const { data, error } = await supabase.storage.from("wiki-images").upload(path, file, {
      contentType: (file as File).type || "application/octet-stream",
      upsert: false,
    });
    if (error || !data) {
      console.error("[wiki] upload", error);
      return { ok: false, error: error?.message ?? "Upload impossible." };
    }
    const storedPath = data.path ?? path;
    const { data: pub } = supabase.storage.from("wiki-images").getPublicUrl(storedPath);
    let url = (pub?.publicUrl ?? "").trim();
    if (!url) {
      const fallback = wikiImagePublicUrl(storedPath);
      if (fallback) url = fallback;
    }
    if (!url) {
      console.error("[wiki] upload: URL publique vide pour", storedPath);
      return { ok: false, error: "URL publique de l’image introuvable (configuration Storage)." };
    }
    return { ok: true, url, path: storedPath };
  } catch (e) {
    console.error("[wiki] uploadWikiImageAction", e);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Échec de l’upload : ${msg}` };
  }
}
