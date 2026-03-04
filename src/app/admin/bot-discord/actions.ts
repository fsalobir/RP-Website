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

export async function upsertChannelRoute(params: {
  id?: string;
  dispatch_type_id: string;
  discord_channel_id: string;
  country_id?: string | null;
  region_id?: string | null;
}): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };
  const row = {
    dispatch_type_id: params.dispatch_type_id,
    discord_channel_id: params.discord_channel_id.trim(),
    country_id: params.country_id ?? null,
    region_id: params.region_id ?? null,
  };
  if (params.id) {
    const { error } = await supabase.from("discord_channel_routes").update(row).eq("id", params.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("discord_channel_routes").insert(row);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/bot-discord");
  return {};
}

export async function deleteChannelRoute(id: string): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };
  const { error } = await supabase.from("discord_channel_routes").delete().eq("id", id);
  if (error) return { error: error.message };
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
    body_template: "Rapport : {country_name} — {action_label}. {date}",
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
