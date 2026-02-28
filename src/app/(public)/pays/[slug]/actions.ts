"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function setMobilisationTarget(countryId: string, targetScore: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const target = Math.max(0, Math.min(500, Math.round(targetScore)));

  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  const { data: playerRow } = await supabase.from("country_players").select("country_id").eq("user_id", user.id).eq("country_id", countryId).maybeSingle();

  if (!adminRow && !playerRow) return { error: "Vous ne pouvez modifier que le pays qui vous est assigné." };

  const { data: existing } = await supabase.from("country_mobilisation").select("score").eq("country_id", countryId).maybeSingle();
  const { error } = await supabase.from("country_mobilisation").upsert(
    {
      country_id: countryId,
      score: existing?.score ?? 0,
      target_score: target,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "country_id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/pays/[slug]", "page");
  return {};
}
