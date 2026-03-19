"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertCountryControl(
  countryId: string,
  controllerCountryId: string,
  sharePct: number,
  isAnnexed: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("mj_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Réservé aux admins." };

  const pct = Math.max(0, Math.min(100, Number(sharePct)));
  if (countryId === controllerCountryId) return { error: "Un pays ne peut pas se contrôler lui-même." };

  const { error } = await supabase.from("country_control").upsert(
    {
      country_id: countryId,
      controller_country_id: controllerCountryId,
      share_pct: pct,
      is_annexed: !!isAnnexed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "country_id,controller_country_id" }
  );
  if (error) return { error: error.message };
  revalidatePath(`/admin/pays/${countryId}`);
  revalidatePath("/admin/pays");
  revalidatePath("/");
  return {};
}

export async function updateCountryControl(
  controlId: string,
  countryId: string,
  sharePct: number,
  isAnnexed: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("mj_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Réservé aux admins." };

  const pct = Math.max(0, Math.min(100, Number(sharePct)));
  const { error } = await supabase
    .from("country_control")
    .update({ share_pct: pct, is_annexed: !!isAnnexed, updated_at: new Date().toISOString() })
    .eq("id", controlId)
    .eq("country_id", countryId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/pays/${countryId}`);
  revalidatePath("/admin/pays");
  revalidatePath("/");
  return {};
}

export async function deleteCountryControl(controlId: string, countryId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("mj_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Réservé aux admins." };

  const { error } = await supabase.from("country_control").delete().eq("id", controlId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/pays/${countryId}`);
  revalidatePath("/admin/pays");
  revalidatePath("/");
  return {};
}

export async function updateLawScore(countryId: string, lawKey: string, score: number) {
  const { ALL_LAW_KEYS } = await import("@/lib/laws");
  if (!ALL_LAW_KEYS.includes(lawKey)) return { error: "Loi inconnue." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("mj_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Réservé aux admins." };

  const clamped = Math.max(0, Math.min(500, Math.round(score)));

  const { data: existing } = await supabase.from("country_laws").select("target_score").eq("country_id", countryId).eq("law_key", lawKey).maybeSingle();
  const { error } = await supabase.from("country_laws").upsert(
    {
      country_id: countryId,
      law_key: lawKey,
      score: clamped,
      target_score: existing?.target_score ?? clamped,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "country_id,law_key" }
  );

  if (error) return { error: error.message };

  revalidatePath(`/admin/pays/${countryId}`);
  revalidatePath("/admin/pays");
  return {};
}

/** @deprecated Use updateLawScore */
export async function updateMobilisationScore(countryId: string, score: number) {
  return updateLawScore(countryId, "mobilisation", score);
}
