import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { replacePlaceholders } from "./discord-format.ts";
import { formatWorldDateForDiscord } from "./worldDate.ts";

const DISCORD_API_BASE = "https://discord.com/api/v10";

type DiscordDispatchType = {
  id: string;
  key: string;
  enabled: boolean;
  destination: string;
  state_action_type_id: string | null;
  outcome: string | null;
};

type DiscordDispatchTemplate = {
  id: string;
  dispatch_type_id: string;
  body_template: string;
  embed_color: string | null;
  image_urls: string[] | null;
};

export async function dispatchToDiscord(
  eventType: string,
  payload: Record<string, string | number | null | undefined>,
  supabase: SupabaseClient
): Promise<void> {
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token?.trim()) return;

  const { data: dispatchType, error: typeErr } = await supabase
    .from("discord_dispatch_types")
    .select("id, key, enabled, destination, state_action_type_id, outcome")
    .eq("key", eventType)
    .single();

  if (typeErr || !dispatchType) return;
  if (!(dispatchType as DiscordDispatchType).enabled) return;

  const channelId = await resolveChannelId(
    supabase,
    (dispatchType as DiscordDispatchType).destination,
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

  let effectivePayload = { ...payload };
  if (effectivePayload.date == null && effectivePayload.resolution_date == null) {
    const { data: worldDateRow } = await supabase
      .from("rule_parameters")
      .select("value")
      .eq("key", "world_date")
      .maybeSingle();
    const worldDate = (worldDateRow as { value?: { month?: number; year?: number } } | null)?.value;
    if (worldDate && typeof worldDate.month === "number" && typeof worldDate.year === "number") {
      effectivePayload = {
        ...effectivePayload,
        date: formatWorldDateForDiscord({ month: worldDate.month, year: worldDate.year }),
      };
    }
  }

  const template = list[Math.floor(Math.random() * list.length)];
  const vars = buildPayloadVars(effectivePayload);
  const outcome = (dispatchType as DiscordDispatchType).outcome ?? null;
  const stateActionTypeId = (dispatchType as DiscordDispatchType).state_action_type_id ?? null;
  const upKind = effectivePayload.up_kind != null ? String(effectivePayload.up_kind) : null;
  const diceSuccessRaw = payload.dice_success;
  const diceSuccess = String(diceSuccessRaw ?? "").toLowerCase() === "true";
  const diceResult = outcome === "accepted" ? (diceSuccess ? "success" : "failure") : null;

  let title: string | undefined;
  let description: string;

  const snippetTitle = await getSnippetPhrase(supabase, stateActionTypeId, outcome, diceResult, "title", upKind);
  const snippetDescription = await getSnippetPhrase(
    supabase,
    stateActionTypeId,
    outcome,
    diceResult,
    "description",
    upKind
  );

  if (snippetTitle) title = `${vars.date} — ${replacePlaceholders(snippetTitle, vars)}`;
  if (snippetDescription) description = replacePlaceholders(snippetDescription, vars);
  else description = replacePlaceholders(template.body_template, vars);

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
    ...(title ? { title } : {}),
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
      console.error("[edge-process-due][discord] API error:", res.status, text);
    }
  } catch (err) {
    console.error("[edge-process-due][discord] send failed:", err);
  }
}

function buildPayloadVars(payload: Record<string, string | number | null | undefined>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null) vars[k] = String(v);
  }
  vars.date = vars.resolution_date ?? vars.date ?? new Date().toLocaleDateString("fr-FR", { dateStyle: "medium" });
  const magnitudeText = payload.impact_magnitude_text != null ? String(payload.impact_magnitude_text) : "";
  const impactValue = payload.impact_value != null ? String(payload.impact_value) : "";
  if (magnitudeText && impactValue) vars.impact_magnitude_bold = `**${magnitudeText}** (${impactValue})`;
  else if (magnitudeText) vars.impact_magnitude_bold = `**${magnitudeText}**`;
  else vars.impact_magnitude_bold = "";
  if (payload.up_kind != null && String(payload.dice_success ?? "").toLowerCase() === "false") {
    vars.up_summary = "Aucun effet";
  }
  return vars;
}

async function getSnippetPhrase(
  supabase: SupabaseClient,
  stateActionTypeId: string | null,
  outcome: string | null,
  diceResult: string | null,
  slot: "title" | "description",
  upKind?: string | null
): Promise<string | null> {
  if (!outcome) return null;
  const tryLoad = async (typeId: string | null, kind: string | null) => {
    let q = supabase
      .from("discord_dispatch_snippet_pools")
      .select("phrases")
      .eq("outcome", outcome)
      .eq("slot", slot);
    if (typeId) q = q.eq("state_action_type_id", typeId);
    else q = q.is("state_action_type_id", null);
    if (kind) q = q.eq("up_kind", kind);
    else q = q.is("up_kind", null);
    if (diceResult) q = q.eq("dice_result", diceResult);
    else q = q.is("dice_result", null);
    const { data: row } = await q.maybeSingle();
    const phrases = (row as { phrases?: unknown } | null)?.phrases;
    if (!Array.isArray(phrases) || phrases.length === 0) return null;
    const str = phrases[Math.floor(Math.random() * phrases.length)];
    return typeof str === "string" ? str : null;
  };
  const wantedKind = upKind != null && typeof upKind === "string" && upKind.trim() ? upKind.trim() : null;
  const phrase = await tryLoad(stateActionTypeId, wantedKind);
  if (phrase) return phrase;
  const fallbackKindPhrase = wantedKind ? await tryLoad(stateActionTypeId, null) : null;
  if (fallbackKindPhrase) return fallbackKindPhrase;
  const genericPhrase = await tryLoad(null, wantedKind);
  if (genericPhrase) return genericPhrase;
  if (wantedKind) return tryLoad(null, null);
  return null;
}

function parseEmbedColor(hex: string | null | undefined): number | null {
  if (!hex || typeof hex !== "string") return null;
  const s = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return parseInt(s, 16);
}

async function resolveChannelId(
  supabase: SupabaseClient,
  destination: string,
  countryId: string | null
): Promise<string | null> {
  if (!countryId) return null;
  const { data: country } = await supabase
    .from("countries")
    .select("continent_id")
    .eq("id", countryId)
    .single();
  const continentId = (country as { continent_id?: string } | null)?.continent_id;
  if (!continentId) return null;
  const channelKind = destination === "national" ? "national" : "international";
  const { data: row } = await supabase
    .from("discord_region_channels")
    .select("discord_channel_id")
    .eq("continent_id", continentId)
    .eq("channel_kind", channelKind)
    .maybeSingle();
  return (row as { discord_channel_id: string } | null)?.discord_channel_id ?? null;
}
