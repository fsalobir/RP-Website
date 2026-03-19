import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "player" | "visitor";

export type RoleContext = {
  userId: string | null;
  role: AppRole;
  realmIds: string[];
};

export async function getRoleContext(): Promise<RoleContext> {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return { userId: null, role: "visitor", realmIds: [] };

  const admin = createServiceRoleClient();
  const [{ data: mjRow }, { data: assignmentRows }] = await Promise.all([
    admin.from("mj_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    admin.from("realm_player_assignments").select("realm_id").eq("user_id", user.id),
  ]);

  const realmIds = (assignmentRows ?? []).map((r: any) => String(r.realm_id));
  if (mjRow) return { userId: user.id, role: "admin", realmIds };
  if (realmIds.length > 0) return { userId: user.id, role: "player", realmIds };
  return { userId: user.id, role: "visitor", realmIds: [] };
}

