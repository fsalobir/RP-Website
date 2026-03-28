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

/** Admin uniquement : applique immédiatement le score et la cible (même valeur). Outil de debug sur la fiche pays. */
export async function setLawScoreImmediate(countryId: string, lawKey: string, score: number) {
  if (!ALL_LAW_KEYS.includes(lawKey)) return { error: "Loi inconnue." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux administrateurs." };

  const clamped = Math.max(0, Math.min(500, Math.round(score)));

  const { error } = await supabase.from("country_laws").upsert(
    {
      country_id: countryId,
      law_key: lawKey,
      score: clamped,
      target_score: clamped,
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
    .select("roster_unit_id, current_level, extra_count, recrutement_points, procuration_points, stock_points")
    .eq("country_id", countryId);
  if (error) return { error: error.message, units: [] as { roster_unit_id: string; current_level: number; extra_count: number; recrutement_points: number; procuration_points: number; stock_points: number }[] };
  return { units: (data ?? []) as { roster_unit_id: string; current_level: number; extra_count: number; recrutement_points: number; procuration_points: number; stock_points: number }[] };
}

export async function adjustTargetCountryIntelForTesting(targetCountryId: string, targetCountrySlug: string, delta: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (adminRow) return { error: "Ce bouton de test est réservé aux joueurs." };

  const { data: playerRow } = await supabase
    .from("country_players")
    .select("country_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const observerCountryId = playerRow?.country_id ?? null;
  if (!observerCountryId) return { error: "Aucun pays joueur associé." };
  if (observerCountryId === targetCountryId) return { error: "Action indisponible sur votre propre pays." };

  const boundedDelta = Math.max(-100, Math.min(100, Math.trunc(delta)));
  if (boundedDelta === 0) return { error: "Le delta doit être différent de 0." };

  const { data: existing, error: readError } = await supabase
    .from("country_intel")
    .select("intel_level")
    .eq("observer_country_id", observerCountryId)
    .eq("target_country_id", targetCountryId)
    .maybeSingle();
  if (readError) return { error: readError.message };

  const currentLevel = Number(existing?.intel_level ?? 0);
  const nextLevel = Math.max(0, Math.min(100, currentLevel + boundedDelta));

  const { error: writeError } = await supabase
    .from("country_intel")
    .upsert(
      {
        observer_country_id: observerCountryId,
        target_country_id: targetCountryId,
        intel_level: nextLevel,
        display_seed: Math.floor(Math.random() * 2147483647),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "observer_country_id,target_country_id" }
    );
  if (writeError) return { error: writeError.message };

  revalidatePath(`/pays/${targetCountrySlug}`, "page");
  return { intelLevel: nextLevel };
}

export type EtatMajorFocusPayload = {
  design_roster_unit_id: string | null;
  recrutement_roster_unit_id: string | null;
  procuration_roster_unit_id: string | null;
  stock_roster_unit_id: string | null;
};

export async function saveEtatMajorFocus(countryId: string, slug: string, focus: EtatMajorFocusPayload) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  const { data: playerRow } = await supabase.from("country_players").select("country_id").eq("user_id", user.id).eq("country_id", countryId).maybeSingle();
  if (!adminRow && !playerRow) return { error: "Vous ne pouvez modifier que le pays qui vous est assigné." };

  const { error } = await supabase
    .from("country_etat_major_focus")
    .upsert(
      {
        country_id: countryId,
        design_roster_unit_id: focus.design_roster_unit_id || null,
        recrutement_roster_unit_id: focus.recrutement_roster_unit_id || null,
        procuration_roster_unit_id: focus.procuration_roster_unit_id || null,
        stock_roster_unit_id: focus.stock_roster_unit_id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "country_id" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/pays/${slug}`, "page");
  return {};
}
