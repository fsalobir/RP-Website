import { getRoleContext } from "@/lib/roles";

export async function canAccessRealm(realmId: string): Promise<boolean> {
  const roleCtx = await getRoleContext();
  if (roleCtx.role === "admin") return true;
  if (roleCtx.role === "player") return roleCtx.realmIds.includes(realmId);
  return false;
}

export async function ensureRealmAccess(realmId: string): Promise<{ error?: string }> {
  const ok = await canAccessRealm(realmId);
  if (!ok) return { error: "Accès refusé à ce royaume." };
  return {};
}

