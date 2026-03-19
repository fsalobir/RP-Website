import { createClient } from "@/lib/supabase/server";
import type { UUID } from "@/types/fantasy";

export type VisibilityLevel = "none" | "summary" | "details" | "exact";

export type ViewerContext = {
  /** Royaume du joueur connecté (viewer). Null si non connecté ou pas de royaume. */
  viewerRealmId: UUID | null;
  /** True si l'utilisateur est MJ (voit tout). */
  isMj: boolean;
};

/**
 * Retourne le contexte du "viewer" : son royaume et s'il est MJ.
 * À appeler côté serveur avec le client Supabase utilisateur.
 */
export async function getViewerContext(): Promise<ViewerContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { viewerRealmId: null, isMj: false };
  }

  const { createServiceRoleClient } = await import("@/lib/supabase/server");
  const admin = createServiceRoleClient();
  const [mjRes, realmRes] = await Promise.all([
    admin.from("mj_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    admin.from("realms").select("id").eq("player_user_id", user.id).maybeSingle(),
  ]);

  const isMj = !!mjRes.data;
  const viewerRealmId = (realmRes.data?.id as UUID) ?? null;

  return { viewerRealmId, isMj };
}

/**
 * Vérifie si le royaume du viewer a une autorisation de visibilité sur le sujet donné.
 * Retourne true si au moins un grant actif existe avec visibility_level >= "summary".
 */
export async function hasVisibilityForSubject(
  viewerRealmId: UUID | null,
  subjectType: "realm" | "province" | "character" | "race" | "item" | "poi",
  subjectId: UUID,
  minLevel: VisibilityLevel = "summary",
): Promise<boolean> {
  if (!viewerRealmId) return false;

  const supabase = await createClient();
  const levels: VisibilityLevel[] = ["none", "summary", "details", "exact"];
  const minIndex = levels.indexOf(minLevel);
  if (minIndex < 0) return false;

  const { data, error } = await supabase
    .from("visibility_grants")
    .select("visibility_level, expires_at")
    .eq("viewer_realm_id", viewerRealmId)
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (error || !data) return false;
  const level = data.visibility_level as VisibilityLevel;
  return levels.indexOf(level) >= minIndex;
}

/**
 * Détermine si le viewer peut voir les détails (chiffres, stats) du sujet.
 * True si : le viewer est propriétaire du royaume concerné, ou MJ, ou a un visibility_grant suffisant.
 */
export function canViewDetails(
  viewerContext: ViewerContext,
  ownerRealmId: UUID,
  subjectType: "realm" | "province" | "character" | "race" | "item" | "poi",
  subjectId: UUID,
  hasGrant: boolean,
): boolean {
  if (viewerContext.isMj) return true;
  if (viewerContext.viewerRealmId === ownerRealmId) return true;
  return hasGrant;
}
