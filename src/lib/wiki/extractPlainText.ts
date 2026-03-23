/**
 * Extrait le texte brut d’un document TipTap JSON (sans ProseMirror / generateText).
 * Utilisable dans les Server Actions sans dépendre du schéma TipTap côté serveur.
 */
export function extractPlainTextFromTipTapDoc(doc: unknown): string {
  const parts: string[] = [];

  function walk(node: unknown): void {
    if (node == null) return;
    if (typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    if (n.type === "text" && typeof n.text === "string") {
      parts.push(n.text);
      return;
    }

    if (n.type === "image" && n.attrs && typeof n.attrs === "object") {
      const alt = (n.attrs as Record<string, unknown>).alt;
      if (typeof alt === "string" && alt.trim()) parts.push(alt);
    }

    if (Array.isArray(n.content)) {
      for (const c of n.content) walk(c);
    }
  }

  walk(doc);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Sérialise en objet JSON pur (évite les références client Next.js sur les Server Actions).
 * Les valeurs `undefined` deviennent `null` : sinon `JSON.stringify` les supprime et les clés
 * (ex. `attrs.src` sur les images) disparaissent en base → aucune requête réseau au rendu.
 */
export function toPlainJsonDoc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v))) as T;
}
