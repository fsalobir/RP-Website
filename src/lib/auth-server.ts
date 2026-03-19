import { cache } from "react";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type CachedAuth = {
  user: User | null;
  isAdmin: boolean;
  playerDisplayName: string | null;
  playerCountryId: string | null;
  /** Fantasy: slug du royaume du joueur (realms.player_user_id). */
  playerRealmSlug: string | null;
};

/**
 * Auth + rôle (Fantasy: mj_admins, realms) cached par requête.
 * Utilisé dans le layout et les pages pour éviter doublons getUser() et appels DB.
 */
export const getCachedAuth = cache(async (): Promise<CachedAuth> => {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return { user: null, isAdmin: false, playerDisplayName: null, playerCountryId: null, playerRealmSlug: null };
  }

  const supabase = createServiceRoleClient();
  const [mjRes, realmRes] = await Promise.all([
    supabase.from("mj_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("realms").select("slug, name").eq("player_user_id", user.id).maybeSingle(),
  ]);

  const isAdmin = !!mjRes.data;
  const realm = realmRes.data;
  const playerDisplayName = (realm?.name?.trim() || user.email) ?? null;
  const playerRealmSlug = realm?.slug ?? null;

  return {
    user,
    isAdmin,
    playerDisplayName,
    playerCountryId: null,
    playerRealmSlug,
  };
});
