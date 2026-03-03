"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getRelation, normalizePair, RELATION_MIN, RELATION_MAX } from "@/lib/relations";

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { supabase: null, error: "Réservé aux admins." };
  return { supabase, error: null };
}

/** Retourne la valeur de relation entre deux pays (pour affichage). */
export async function fetchRelation(
  countryIdA: string,
  countryIdB: string
): Promise<{ error?: string; value?: number }> {
  const supabase = await createClient();
  try {
    const value = await getRelation(supabase, countryIdA, countryIdB);
    return { value };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lecture." };
  }
}

/** Définit la relation bilatérale entre deux pays. */
export async function setRelation(
  countryIdA: string,
  countryIdB: string,
  value: number
): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  if (countryIdA === countryIdB) return { error: "Choisissez deux pays différents." };
  const clamped = Math.round(Math.max(RELATION_MIN, Math.min(RELATION_MAX, value)));
  const [a, b] = normalizePair(countryIdA, countryIdB);

  const { error } = await supabase
    .from("country_relations")
    .upsert(
      { country_a_id: a, country_b_id: b, value: clamped, updated_at: new Date().toISOString() },
      { onConflict: "country_a_id,country_b_id" }
    );

  if (error) return { error: error.message };
  revalidatePath("/admin/matrice-diplomatique");
  revalidatePath("/carte");
  return {};
}

/** Réinitialise toutes les relations à 0 (suppression des lignes). */
export async function resetAllRelations(): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { error } = await supabase.from("country_relations").delete().gte("value", RELATION_MIN);
  if (error) return { error: error.message };
  revalidatePath("/admin/matrice-diplomatique");
  revalidatePath("/carte");
  return {};
}

/** Attribue une valeur aléatoire (-100 à +100) à chaque paire de pays. */
export async function randomizeAllRelations(): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: countries, error: fetchError } = await supabase.from("countries").select("id");
  if (fetchError) return { error: fetchError.message };
  if (!countries?.length) return {};

  const ids = countries.map((c) => c.id);
  const rows: { country_a_id: string; country_b_id: string; value: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      rows.push({
        country_a_id: ids[i],
        country_b_id: ids[j],
        value: Math.floor(Math.random() * (RELATION_MAX - RELATION_MIN + 1)) + RELATION_MIN,
      });
    }
  }

  if (rows.length === 0) return {};

  const { error } = await supabase
    .from("country_relations")
    .upsert(rows, { onConflict: "country_a_id,country_b_id" });

  if (error) return { error: error.message };
  revalidatePath("/admin/matrice-diplomatique");
  revalidatePath("/carte");
  return {};
}
