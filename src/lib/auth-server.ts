import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type CachedAuth = {
  user: User | null;
  isAdmin: boolean;
  isRpStaff: boolean;
  playerDisplayName: string | null;
  playerCountryId: string | null;
};

/**
 * Auth + role (admins, country_players) cached per request.
 * Use in layout and pages to avoid duplicate getUser() and DB calls.
 */
export const getCachedAuth = cache(async (): Promise<CachedAuth> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, isAdmin: false, isRpStaff: false, playerDisplayName: null, playerCountryId: null };
  }

  const [adminRes, staffRes, playerRes] = await Promise.all([
    supabase.from("admins").select("id").eq("user_id", user.id).single(),
    supabase.from("rp_staff").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("country_players").select("country_id, name, email").eq("user_id", user.id).maybeSingle(),
  ]);

  const isAdmin = !!adminRes.data;
  const isRpStaff = isAdmin || Boolean(staffRes.data);
  const row = playerRes.data;
  const playerDisplayName = (row?.name?.trim() || row?.email) ?? null;
  const playerCountryId = row?.country_id ?? null;

  return { user, isAdmin, isRpStaff, playerDisplayName, playerCountryId };
});
