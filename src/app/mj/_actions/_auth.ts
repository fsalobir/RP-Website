"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

type EnsureMjResult =
  | { user: null; error: "Non connecté." | "Réservé au Maître du Jeu." }
  | { user: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"]>; error: null };

export async function ensureMj() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return { user: null, error: "Non connecté." } satisfies EnsureMjResult;

  const admin = createServiceRoleClient();
  const { data: mjRow, error } = await admin
    .from("mj_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !mjRow) return { user: null, error: "Réservé au Maître du Jeu." } satisfies EnsureMjResult;
  return { user, error: null } satisfies EnsureMjResult;
}

