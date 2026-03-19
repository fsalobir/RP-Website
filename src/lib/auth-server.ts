import { cache } from "react";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { getRoleContext } from "@/lib/roles";

export type CachedAuth = {
  user: User | null;
  isAdmin: boolean;
  role: "admin" | "player" | "visitor";
  playerDisplayName: string | null;
  playerCountryId: string | null;
  /** Fantasy: slug du royaume du joueur (realms.player_user_id). */
  playerRealmSlug: string | null;
  playerRealmIds: string[];
};

/**
 * Auth + rôle (Fantasy: mj_admins, realms) cached par requête.
 * Utilisé dans le layout et les pages pour éviter doublons getUser() et appels DB.
 */
export const getCachedAuth = cache(async (): Promise<CachedAuth> => {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return {
      user: null,
      isAdmin: false,
      role: "visitor",
      playerDisplayName: null,
      playerCountryId: null,
      playerRealmSlug: null,
      playerRealmIds: [],
    };
  }

  const supabase = createServiceRoleClient();
  const [mjRes, realmRes, roleCtx] = await Promise.all([
    supabase.from("mj_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("realms").select("slug, name").eq("player_user_id", user.id).maybeSingle(),
    getRoleContext(),
  ]);

  const isAdmin = !!mjRes.data;
  const realm = realmRes.data;
  const playerDisplayName = (realm?.name?.trim() || user.email) ?? null;
  const playerRealmSlug = realm?.slug ?? null;

  return {
    user,
    isAdmin,
    role: roleCtx.role,
    playerDisplayName,
    playerCountryId: null,
    playerRealmSlug,
    playerRealmIds: roleCtx.realmIds,
  };
});
