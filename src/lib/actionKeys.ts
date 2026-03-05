/**
 * Constantes partagées côté client et serveur pour les types d'actions d'État.
 * Ce fichier ne doit pas importer next/headers ni supabase/server.
 */

/** Clés des types d'action qui requièrent un jet d'impact avant acceptation. */
export const ACTION_KEYS_REQUIRING_IMPACT_ROLL = new Set([
  "insulte_diplomatique",
  "ouverture_diplomatique",
  "prise_influence",
  "escarmouche_militaire",
  "conflit_arme",
  "guerre_ouverte",
]);
