/**
 * URL publique Supabase Storage pour le bucket wiki-images.
 * Centralisé pour normalisation JSON + rendu TipTap (même logique partout).
 */

/** Base URL Supabase (sans slash final). Chaîne vide si NEXT_PUBLIC_SUPABASE_URL est absent. */
export function getSupabasePublicUrlBase(): string {
  if (typeof process === "undefined") return "";
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return typeof u === "string" && u.trim() ? u.replace(/\/$/, "") : "";
}

/**
 * Reconstruit l’URL publique d’un objet dans `wiki-images` (côté client / sans client Supabase).
 * Aligné sur `@supabase/storage-js` getPublicUrl : `encodeURI(\`\${storageUrl}/object/public/\${bucket}/\${path}\`)`.
 */
export function wikiImagePublicUrl(storagePath: string | null | undefined): string | null {
  const base = getSupabasePublicUrlBase();
  if (!base || storagePath == null || typeof storagePath !== "string") return null;
  const clean = storagePath.replace(/^\/+/, "").trim();
  if (!clean) return null;
  const storageApiBase = `${base}/storage/v1`;
  const objectPath = `wiki-images/${clean}`;
  const raw = `${storageApiBase}/object/public/${objectPath}`;
  return encodeURI(raw);
}
