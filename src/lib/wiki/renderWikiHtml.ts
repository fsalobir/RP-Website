import { generateHTML } from "@tiptap/html/server";
import type { JSONContent } from "@tiptap/core";
import { getWikiExtensions } from "@/lib/wiki/tiptap-extensions";

/**
 * Rendu HTML statique du JSON wiki (même schéma TipTap que l’éditeur).
 * Utilisé côté serveur pour la page publique : évite TipTap React + hydratation,
 * et garantit des balises &lt;img src="…"&gt; identiques au moteur de rendu du schéma.
 */
export function renderWikiHtml(doc: JSONContent): string {
  try {
    return generateHTML(doc, getWikiExtensions());
  } catch (e) {
    console.error("[wiki] renderWikiHtml", e);
    return "<p>Erreur d’affichage du contenu.</p>";
  }
}
