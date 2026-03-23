/**
 * Slug URL stable (sans accents, minuscules, tirets).
 */
export function slugifyTitle(title: string): string {
  const s = title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "page";
}
