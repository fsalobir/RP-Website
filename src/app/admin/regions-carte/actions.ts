"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { supabase: null, error: "Réservé aux admins." };
  return { supabase, error: null };
}

/** Supprime toutes les régions (et liens). Réinitialiser la carte = relancer le script seed ensuite. */
export async function resetMapRegions(): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { error: delLinks } = await supabase.from("map_region_countries").delete().neq("region_id", "00000000-0000-0000-0000-000000000000");
  if (delLinks) return { error: delLinks.message };
  const { error: delRegions } = await supabase.from("map_regions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delRegions) return { error: delRegions.message };

  revalidatePath("/carte");
  revalidatePath("/admin/regions-carte");
  return {};
}
