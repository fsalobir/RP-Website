import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const DISCORD_API_BASE = "https://discord.com/api/v10";

type DiscordDispatchType = {
  id: string;
  key: string;
  label_fr: string;
  enabled: boolean;
  sort_order: number;
};

type DiscordChannelRoute = {
  id: string;
  dispatch_type_id: string;
  discord_channel_id: string;
  country_id: string | null;
  region_id: string | null;
};

type DiscordDispatchTemplate = {
  id: string;
  dispatch_type_id: string;
  label_fr: string;
  body_template: string;
  embed_color: string | null;
  image_urls: string[] | null;
  sort_order: number;
};

/** Payload flat : toutes les clés utilisées comme placeholders (ex. country_name, action_label, refusal_message). */
export type DiscordDispatchPayload = Record<string, string | number | null | undefined>;

/**
 * Envoie un événement vers Discord selon la config (types, routage, templates).
 * Ne fait rien si DISCORD_BOT_TOKEN est absent, type désactivé ou pas de route.
 * N'interrompt pas l'action métier en cas d'erreur Discord (log seulement).
 */
export async function dispatchToDiscord(
  eventType: string,
  payload: DiscordDispatchPayload,
  supabaseInstance?: SupabaseClient
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token?.trim()) return;

  const supabase = supabaseInstance ?? (await createClient());

  const { data: dispatchType, error: typeErr } = await supabase
    .from("discord_dispatch_types")
    .select("id, key, label_fr, enabled")
    .eq("key", eventType)
    .single();

  if (typeErr || !dispatchType) return;
  if (!(dispatchType as DiscordDispatchType).enabled) return;

  const channelId = await resolveChannelId(
    supabase,
    (dispatchType as DiscordDispatchType).id,
    payload.country_id != null ? String(payload.country_id) : null
  );
  if (!channelId) return;

  const { data: templates } = await supabase
    .from("discord_dispatch_templates")
    .select("id, body_template, embed_color, image_urls")
    .eq("dispatch_type_id", (dispatchType as DiscordDispatchType).id)
    .order("sort_order");

  const list = (templates ?? []) as DiscordDispatchTemplate[];
  if (list.length === 0) return;

  const template = list[Math.floor(Math.random() * list.length)];
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null) vars[k] = String(v);
  }
  vars.date = vars.resolution_date ?? vars.date ?? new Date().toLocaleDateString("fr-FR", { dateStyle: "medium" });

  const description = replacePlaceholders(template.body_template, vars);
  const urls = Array.isArray(template.image_urls) ? template.image_urls : [];
  const imageUrl = urls.length > 0 ? urls[Math.floor(Math.random() * urls.length)] : undefined;
  const color = parseEmbedColor(template.embed_color);

  const embed: {
    title?: string;
    description?: string;
    color?: number;
    image?: { url: string };
    footer?: { text: string };
  } = {
    description: description || undefined,
    color: color ?? undefined,
    footer: { text: `Simulateur de nations · ${vars.date}` },
  };
  if (imageUrl?.trim()) embed.image = { url: imageUrl.trim() };

  try {
    const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[discord-dispatch] Discord API error:", res.status, text);
    }
  } catch (err) {
    console.error("[discord-dispatch] Failed to send:", err);
  }
}

function replacePlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function parseEmbedColor(hex: string | null | undefined): number | null {
  if (!hex || typeof hex !== "string") return null;
  const s = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return parseInt(s, 16);
}

async function resolveChannelId(
  supabase: SupabaseClient,
  dispatchTypeId: string,
  countryId: string | null
): Promise<string | null> {
  const { data: routes } = await supabase
    .from("discord_channel_routes")
    .select("id, discord_channel_id, country_id, region_id")
    .eq("dispatch_type_id", dispatchTypeId);

  const list = (routes ?? []) as DiscordChannelRoute[];
  if (list.length === 0) return null;

  const exactCountry = list.find((r) => r.country_id === countryId);
  if (exactCountry) return exactCountry.discord_channel_id;

  if (countryId) {
    const { data: regionLinks } = await supabase
      .from("map_region_countries")
      .select("region_id")
      .eq("country_id", countryId);
    const regionIds = (regionLinks ?? []).map((r: { region_id: string }) => r.region_id);
    const byRegion = list.find((r) => r.region_id && regionIds.includes(r.region_id));
    if (byRegion) return byRegion.discord_channel_id;
  }

  const defaultRoute = list.find((r) => r.country_id == null && r.region_id == null);
  return defaultRoute?.discord_channel_id ?? null;
}
