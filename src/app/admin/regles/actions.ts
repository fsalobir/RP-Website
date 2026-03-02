"use server";

import { revalidateTag, revalidatePath } from "next/cache";

/**
 * Invalide les caches impactés par la modification des règles.
 * - Fiches pays : tag country-page-globals
 * - Classement et liste des nations : dépendent de influence_config et autres règles → revalidation immédiate pour l'équilibrage
 */
export async function revalidateCountryPageGlobals() {
  revalidateTag("country-page-globals", "max");
  revalidatePath("/classement");
  revalidatePath("/");
}
