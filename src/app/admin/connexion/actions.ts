"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Retourne le chemin de redirection après connexion :
 * - Admin → /admin
 * - MJ → /admin/event-ia
 * - Joueur (country_players) → /pays/[slug]
 * - Sinon → / avec message d'erreur
 */
export async function getRedirectPathAfterLogin(): Promise<{ path: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { path: "/admin/connexion" };

  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (adminRow) return { path: "/admin" };

  const { data: staffRow } = await supabase
    .from("rp_staff")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (staffRow) return { path: "/admin/event-ia" };

  const { data: countryId } = await supabase.rpc("get_country_for_player", { p_user_id: user.id });
  if (countryId) {
    const { data: country } = await supabase.from("countries").select("slug").eq("id", countryId).single();
    if (country?.slug) return { path: `/pays/${country.slug}` };
  }

  return { path: "/", error: "Compte non autorisé." };
}
