"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";

export type PerkEffectInput = {
  effect_kind: string;
  effect_target: string | null;
  effect_subtype?: string | null;
  value: number;
};

export type PerkRequirementInput = {
  requirement_kind: string;
  requirement_target: string | null;
  value: number;
};

export async function createPerkCategory(formData: FormData) {
  const supabase = await createClient();
  const name_fr = (formData.get("name_fr") as string)?.trim();
  const sort_order = Number(formData.get("sort_order")) || 0;
  if (!name_fr) return { error: "Nom requis." };
  const { data, error } = await supabase
    .from("perk_categories")
    .insert({ name_fr, sort_order })
    .select("*")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/admin/avantages");
  return { error: null, data };
}

export async function updatePerkCategory(id: string, expectedUpdatedAt: string, formData: FormData) {
  const supabase = await createClient();
  const name_fr = (formData.get("name_fr") as string)?.trim();
  const sort_order = Number(formData.get("sort_order")) || 0;
  if (!name_fr) return { error: "Nom requis." };
  const { data, error } = await supabase
    .from("perk_categories")
    .update({ name_fr, sort_order })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) {
    return { error: "Un autre administrateur a modifié cette catégorie. Rechargez la page avant de recommencer." };
  }
  revalidatePath("/admin/avantages");
  return { error: null, data };
}

export async function deletePerkCategory(id: string, expectedUpdatedAt: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("perk_categories")
    .delete()
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) {
    return { error: "Un autre administrateur a modifié cette catégorie. Rechargez la page avant de la supprimer." };
  }
  revalidatePath("/admin/avantages");
  return { error: null };
}

export async function createPerk(
  formData: FormData,
  effects: PerkEffectInput[],
  requirements: PerkRequirementInput[] = []
) {
  const supabase = await createClient();
  const name_fr = (formData.get("name_fr") as string)?.trim();
  const description_fr = (formData.get("description_fr") as string)?.trim() || null;
  const category_id = (formData.get("category_id") as string)?.trim() || null;
  const icon_url = (formData.get("icon_url") as string)?.trim() || null;
  const icon_size = formData.get("icon_size") !== "" && formData.get("icon_size") !== null ? Number(formData.get("icon_size")) : null;
  const sort_order = Number(formData.get("sort_order")) || 0;
  if (!name_fr) return { error: "Titre requis." };
  const { data: perk, error: insertError } = await supabase
    .from("perks")
    .insert({
      name_fr,
      description_fr,
      category_id: category_id || null,
      icon_url,
      icon_size: icon_size != null && icon_size >= 16 && icon_size <= 256 ? icon_size : 48,
      sort_order,
    })
    .select("id")
    .single();
  if (insertError) return { error: insertError.message };
  if (perk?.id && effects.length > 0) {
    const { error } = await supabase.from("perk_effects").insert(
      effects.map((e) => ({
        perk_id: perk.id,
        effect_kind: e.effect_kind,
        effect_target: e.effect_target ?? null,
        effect_subtype: e.effect_subtype ?? null,
        value: Number(e.value),
      }))
    );
    if (error) {
      await supabase.from("perks").delete().eq("id", perk.id);
      return { error: `Création annulée : ${error.message}` };
    }
  }
  if (perk?.id && requirements.length > 0) {
    const { error } = await supabase.from("perk_requirements").insert(
      requirements.map((r) => ({
        perk_id: perk.id,
        requirement_kind: r.requirement_kind,
        requirement_target: r.requirement_target ?? null,
        value: Number(r.value),
      }))
    );
    if (error) {
      await supabase.from("perks").delete().eq("id", perk.id);
      return { error: `Création annulée : ${error.message}` };
    }
  }
  revalidatePath("/admin/avantages");
  revalidateTag("country-page-globals", "max");
  return { error: null };
}

export async function updatePerk(
  id: string,
  expectedUpdatedAt: string,
  formData: FormData,
  effects: PerkEffectInput[],
  requirements: PerkRequirementInput[] = []
) {
  const supabase = await createClient();
  const name_fr = (formData.get("name_fr") as string)?.trim();
  const description_fr = (formData.get("description_fr") as string)?.trim() || null;
  const category_id = (formData.get("category_id") as string)?.trim() || null;
  const icon_url = (formData.get("icon_url") as string)?.trim() || null;
  const icon_size = formData.get("icon_size") !== "" && formData.get("icon_size") !== null ? Number(formData.get("icon_size")) : null;
  const sort_order = Number(formData.get("sort_order")) || 0;
  if (!name_fr) return { error: "Titre requis." };
  const { data: updatedPerk, error: updateError } = await supabase
    .from("perks")
    .update({
      name_fr,
      description_fr,
      category_id: category_id || null,
      icon_url,
      icon_size: icon_size != null && icon_size >= 16 && icon_size <= 256 ? icon_size : 48,
      sort_order,
    })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (updateError) return { error: updateError.message };
  if (!updatedPerk) {
    return { error: "Un autre administrateur a modifié cet avantage. Rechargez la page avant de recommencer." };
  }
  const { error: deleteEffectsError } = await supabase.from("perk_effects").delete().eq("perk_id", id);
  if (deleteEffectsError) return { error: deleteEffectsError.message };
  if (effects.length > 0) {
    const { error: insertEffectsError } = await supabase.from("perk_effects").insert(
      effects.map((e) => ({
        perk_id: id,
        effect_kind: e.effect_kind,
        effect_target: e.effect_target ?? null,
        effect_subtype: e.effect_subtype ?? null,
        value: Number(e.value),
      }))
    );
    if (insertEffectsError) return { error: `Avantage enregistré, mais ses effets n’ont pas pu être remplacés : ${insertEffectsError.message}` };
  }
  const { error: deleteRequirementsError } = await supabase.from("perk_requirements").delete().eq("perk_id", id);
  if (deleteRequirementsError) return { error: deleteRequirementsError.message };
  if (requirements.length > 0) {
    const { error: insertRequirementsError } = await supabase.from("perk_requirements").insert(
      requirements.map((r) => ({
        perk_id: id,
        requirement_kind: r.requirement_kind,
        requirement_target: r.requirement_target ?? null,
        value: Number(r.value),
      }))
    );
    if (insertRequirementsError) {
      return { error: `Avantage enregistré, mais ses conditions n’ont pas pu être remplacées : ${insertRequirementsError.message}` };
    }
  }
  revalidatePath("/admin/avantages");
  revalidateTag("country-page-globals", "max");
  return { error: null };
}

export async function deletePerk(id: string, expectedUpdatedAt: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("perks")
    .delete()
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) {
    return { error: "Un autre administrateur a modifié cet avantage. Rechargez la page avant de le supprimer." };
  }
  revalidatePath("/admin/avantages");
  revalidateTag("country-page-globals", "max");
  return { error: null };
}
