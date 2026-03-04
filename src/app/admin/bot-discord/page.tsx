import { createClient } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { formatWorldDateForDiscord } from "@/lib/worldDate";
import { BotDiscordForm } from "./BotDiscordForm";

export default async function AdminBotDiscordPage() {
  const auth = await getCachedAuth();
  if (!auth.user) redirect("/admin/connexion");
  if (!auth.isAdmin) redirect("/admin/connexion?error=non-admin");

  const supabase = await createClient();
  const [
    stateActionTypesRes,
    dispatchTypesRes,
    templatesRes,
    continentsRes,
    regionChannelsRes,
    worldDateRes,
  ] = await Promise.all([
    supabase.from("state_action_types").select("id, key, label_fr, sort_order").order("sort_order"),
    supabase.from("discord_dispatch_types").select("*").order("sort_order"),
    supabase.from("discord_dispatch_templates").select("*").order("dispatch_type_id").order("sort_order"),
    supabase.from("continents").select("id, slug, label_fr").order("sort_order"),
    supabase.from("discord_region_channels").select("id, continent_id, channel_kind, discord_channel_id"),
    supabase.from("rule_parameters").select("value").eq("key", "world_date").maybeSingle(),
  ]);

  const stateActionTypes = stateActionTypesRes.data ?? [];
  let dispatchTypes = dispatchTypesRes.data ?? [];
  const templates = templatesRes.data ?? [];
  const continents = continentsRes.data ?? [];
  const regionChannels = regionChannelsRes.data ?? [];

  // Sync : pour chaque type d'action d'État, s'assurer que la ligne « acceptée » existe
  for (const sat of stateActionTypes) {
    const keyAcc = `${sat.key}_accepted`;
    const hasAcc = dispatchTypes.some((d: { key: string }) => d.key === keyAcc);
    if (!hasAcc) {
      const { data: insertedAcc } = await supabase
        .from("discord_dispatch_types")
        .insert({
          key: keyAcc,
          label_fr: `${sat.label_fr} acceptée`,
          enabled: true,
          sort_order: (sat.sort_order ?? 0) * 2,
          state_action_type_id: sat.id,
          outcome: "accepted",
          destination: "international",
        })
        .select("id")
        .single();
      if (insertedAcc) {
        await supabase.from("discord_dispatch_templates").insert({
          dispatch_type_id: insertedAcc.id,
          label_fr: "Brève — acceptation",
          body_template: "Selon nos sources, {country_name} et {target_country_name} : {action_label} menée à son terme. {impact_magnitude_bold} {date}",
          embed_color: "2e7d32",
          image_urls: [],
          sort_order: 0,
        });
      }
      const { data: refreshed } = await supabase.from("discord_dispatch_types").select("*").order("sort_order");
      dispatchTypes = refreshed ?? dispatchTypes;
    }
  }

  const tokenConfigured = !!process.env.DISCORD_BOT_TOKEN;
  const worldDateVal = (worldDateRes.data as { value?: { month?: number; year?: number } } | null)?.value;
  const worldDateFormatted =
    worldDateVal && typeof worldDateVal.month === "number" && typeof worldDateVal.year === "number"
      ? formatWorldDateForDiscord({ month: worldDateVal.month, year: worldDateVal.year })
      : new Date().toLocaleDateString("fr-FR", { dateStyle: "medium" });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Bot Discord
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Types de dispatch (dérivés des actions d'État), canaux par continent (national / international) et templates.
      </p>
      <BotDiscordForm
        stateActionTypes={stateActionTypes}
        dispatchTypes={dispatchTypes}
        templates={templates}
        continents={continents}
        regionChannels={regionChannels}
        tokenConfigured={tokenConfigured}
        worldDateFormatted={worldDateFormatted}
      />
    </div>
  );
}
