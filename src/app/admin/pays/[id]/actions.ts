"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateMobilisationScore(countryId: string, score: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const clamped = Math.max(0, Math.min(500, Math.round(score)));

  const { data: existing } = await supabase.from("country_mobilisation").select("target_score").eq("country_id", countryId).maybeSingle();
  const { error } = await supabase.from("country_mobilisation").upsert(
    {
      country_id: countryId,
      score: clamped,
      target_score: existing?.target_score ?? clamped,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "country_id" }
  );

  if (error) return { error: error.message };

  revalidatePath(`/admin/pays/${countryId}`);
  revalidatePath("/admin/pays");
  return {};
}
