"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Retourne le chemin de redirection après connexion (Fantasy) :
 * - MJ (mj_admins) → /admin
 * - Joueur avec royaume (realms.player_user_id) → /royaume/[slug]
 * - Sinon → / avec message d'erreur
 */
export async function getRedirectPathAfterLogin(): Promise<{ path: string; error?: string }> {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { path: "/admin/connexion" };

  // IMPORTANT: on utilise le service role ici car la redirection post-login doit être fiable
  // (les RLS sur realms ont déjà provoqué des erreurs "stack depth").
  const supabase = createServiceRoleClient();

  const { data: mjRow } = await supabase.from("mj_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (mjRow) return { path: "/admin" };

  const { data: realm } = await supabase.from("realms").select("slug").eq("player_user_id", user.id).maybeSingle();
  if (realm?.slug) return { path: `/royaume/${realm.slug}` };

  return { path: "/", error: "Compte non autorisé." };
}
