import { createClient } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { BotDiscordForm } from "./BotDiscordForm";

export default async function AdminBotDiscordPage() {
  const auth = await getCachedAuth();
  if (!auth.user) redirect("/admin/connexion");
  if (!auth.isAdmin) redirect("/admin/connexion?error=non-admin");

  const supabase = await createClient();
  const [
    typesRes,
    routesRes,
    templatesRes,
    countriesRes,
    regionsRes,
  ] = await Promise.all([
    supabase.from("discord_dispatch_types").select("*").order("sort_order"),
    supabase.from("discord_channel_routes").select("id, dispatch_type_id, discord_channel_id, country_id, region_id"),
    supabase.from("discord_dispatch_templates").select("*").order("dispatch_type_id").order("sort_order"),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("map_regions").select("id, name").order("name"),
  ]);

  const types = typesRes.data ?? [];
  const routes = routesRes.data ?? [];
  const templates = templatesRes.data ?? [];
  const countries = countriesRes.data ?? [];
  const regions = regionsRes.data ?? [];
  const tokenConfigured = !!process.env.DISCORD_BOT_TOKEN;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Bot Discord
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Configurer les types de dispatch, le routage des canaux et les templates de messages (formules de texte et images).
      </p>
      <BotDiscordForm
        types={types}
        routes={routes}
        templates={templates}
        countries={countries}
        regions={regions}
        tokenConfigured={tokenConfigured}
      />
    </div>
  );
}
