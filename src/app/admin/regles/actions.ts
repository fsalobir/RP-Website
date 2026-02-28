"use server";

import { revalidateTag } from "next/cache";

/**
 * Invalide le cache des règles/globals utilisé par les fiches pays.
 * À appeler après sauvegarde des rule_parameters pour que les changements
 * (effets globaux, paramètres des ministères, etc.) soient visibles immédiatement.
 */
export async function revalidateCountryPageGlobals() {
  revalidateTag("country-page-globals");
}
