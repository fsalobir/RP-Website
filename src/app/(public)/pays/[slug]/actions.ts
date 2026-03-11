"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ALL_LAW_KEYS } from "@/lib/laws";

export async function setLawTarget(countryId: string, lawKey: string, targetScore: number) {
  if (!ALL_LAW_KEYS.includes(lawKey)) return { error: "Loi inconnue." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const target = Math.max(0, Math.min(500, Math.round(targetScore)));

  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  const { data: playerRow } = await supabase.from("country_players").select("country_id").eq("user_id", user.id).eq("country_id", countryId).maybeSingle();

  if (!adminRow && !playerRow) return { error: "Vous ne pouvez modifier que le pays qui vous est assigné." };

  const { data: existing } = await supabase.from("country_laws").select("score").eq("country_id", countryId).eq("law_key", lawKey).maybeSingle();
  const { error } = await supabase.from("country_laws").upsert(
    {
      country_id: countryId,
      law_key: lawKey,
      score: existing?.score ?? 0,
      target_score: target,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "country_id,law_key" }
  );

  if (error) return { error: error.message };

  revalidatePath("/pays/[slug]", "page");
  return {};
}

/** @deprecated Use setLawTarget with lawKey = 'mobilisation' */
export async function setMobilisationTarget(countryId: string, targetScore: number) {
  return setLawTarget(countryId, "mobilisation", targetScore);
}

export async function saveMilitaryUnit(
  countryId: string,
  slug: string,
  rosterUnitId: string,
  currentLevel: number,
  extraCount: number
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  const { data: playerRow } = await supabase.from("country_players").select("country_id").eq("user_id", user.id).eq("country_id", countryId).maybeSingle();
  if (!adminRow && !playerRow) return { error: "Vous ne pouvez modifier que le pays qui vous est assigné." };

  const { error } = await supabase
    .from("country_military_units")
    .upsert(
      {
        country_id: countryId,
        roster_unit_id: rosterUnitId,
        current_level: currentLevel,
        extra_count: extraCount,
      },
      { onConflict: "country_id,roster_unit_id" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/pays/${slug}`, "page");
  return {};
}

export async function getCountryMilitaryUnits(countryId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("country_military_units")
    .select("roster_unit_id, current_level, extra_count")
    .eq("country_id", countryId);
  if (error) return { error: error.message, units: [] as { roster_unit_id: string; current_level: number; extra_count: number }[] };
  return { units: (data ?? []) as { roster_unit_id: string; current_level: number; extra_count: number }[] };
}
