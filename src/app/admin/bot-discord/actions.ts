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

export async function setDispatchTypeEnabled(id: string, enabled: boolean): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };
  const { error } = await supabase.from("discord_dispatch_types").update({ enabled }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/bot-discord");
  return {};
}

export async function setDispatchTypeDestination(
  id: string,
  destination: "national" | "international"
): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };
  const { error } = await supabase.from("discord_dispatch_types").update({ destination }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/bot-discord");
  return {};
}

export async function saveRegionChannel(params: {
  continent_id: string;
  channel_kind: "national" | "international";
  discord_channel_id: string;
}): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };
  const channelId = params.discord_channel_id.trim();
  if (!channelId) {
    const { error } = await supabase
      .from("discord_region_channels")
      .delete()
      .eq("continent_id", params.continent_id)
      .eq("channel_kind", params.channel_kind);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("discord_region_channels").upsert(
      {
        continent_id: params.continent_id,
        channel_kind: params.channel_kind,
        discord_channel_id: channelId,
      },
      { onConflict: "continent_id,channel_kind" }
    );
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/bot-discord");
  return {};
}

export async function saveTemplate(params: {
  id: string;
  label_fr: string;
  body_template: string;
  embed_color: string | null;
  image_urls: string[];
}): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };
  const { error } = await supabase
    .from("discord_dispatch_templates")
    .update({
      label_fr: params.label_fr.trim(),
      body_template: params.body_template,
      embed_color: params.embed_color?.trim() || null,
      image_urls: params.image_urls,
    })
    .eq("id", params.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/bot-discord");
  return {};
}

export async function createTemplate(dispatch_type_id: string): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };
  const { data: type } = await supabase
    .from("discord_dispatch_types")
    .select("label_fr")
    .eq("id", dispatch_type_id)
    .single();
  const label = type?.label_fr ? `Nouveau (${type.label_fr})` : "Nouveau template";
  const { error } = await supabase.from("discord_dispatch_templates").insert({
    dispatch_type_id,
    label_fr: label,
    body_template: "Selon nos sources, {country_name} et {target_country_name} : {action_label}. {date}",
    embed_color: "2e7d32",
    image_urls: [],
    sort_order: 999,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/bot-discord");
  return {};
}

export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };
  const { error } = await supabase.from("discord_dispatch_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/bot-discord");
  return {};
}

/** Retourne une phrase de titre et une de description tirées au hasard pour l’aperçu (même logique que discord-dispatch). */
export async function getPreviewSnippets(dispatch_type_id: string): Promise<{
  error?: string;
  titlePhrase: string | null;
  descriptionPhrase: string | null;
}> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé.", titlePhrase: null, descriptionPhrase: null };

  const { data: dispatchType, error: typeErr } = await supabase
    .from("discord_dispatch_types")
    .select("state_action_type_id, outcome")
    .eq("id", dispatch_type_id)
    .single();
  if (typeErr || !dispatchType) return { titlePhrase: null, descriptionPhrase: null };

  const stateActionTypeId = (dispatchType as { state_action_type_id?: string | null }).state_action_type_id ?? null;
  const outcome = (dispatchType as { outcome?: string | null }).outcome ?? null;
  if (!outcome) return { titlePhrase: null, descriptionPhrase: null };

  const diceResult =
    outcome === "accepted"
      ? (["success", "failure"] as const)[Math.floor(Math.random() * 2)]
      : null;

  const tryLoad = async (
    typeId: string | null,
    slot: "title" | "description"
  ): Promise<string | null> => {
    let q = supabase
      .from("discord_dispatch_snippet_pools")
      .select("phrases")
      .eq("outcome", outcome)
      .eq("slot", slot);
    if (typeId) q = q.eq("state_action_type_id", typeId);
    else q = q.is("state_action_type_id", null);
    if (diceResult) q = q.eq("dice_result", diceResult);
    else q = q.is("dice_result", null);
    const { data: row } = await q.maybeSingle();
    const phrases = (row as { phrases?: unknown } | null)?.phrases;
    if (!Array.isArray(phrases) || phrases.length === 0) return null;
    const str = phrases[Math.floor(Math.random() * phrases.length)];
    return typeof str === "string" ? str : null;
  };

  let titlePhrase = await tryLoad(stateActionTypeId, "title");
  if (!titlePhrase && stateActionTypeId) titlePhrase = await tryLoad(null, "title");

  let descriptionPhrase = await tryLoad(stateActionTypeId, "description");
  if (!descriptionPhrase && stateActionTypeId) descriptionPhrase = await tryLoad(null, "description");

  return { titlePhrase, descriptionPhrase };
}
