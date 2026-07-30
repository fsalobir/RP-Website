import { createClient } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { JoueursManager } from "./JoueursManager";

export default async function AdminJoueursPage() {
  const auth = await getCachedAuth();
  if (!auth.user) redirect("/admin/connexion");
  if (!auth.isAdmin) redirect("/admin/connexion?error=non-admin");

  const supabase = await createClient();
  const [playersRes, countriesRes] = await Promise.all([
    supabase
      .from("country_players")
      .select("user_id, country_id, email, name, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("countries").select("id, name, slug").order("name"),
  ]);
  const loadError = [playersRes, countriesRes].find((result) => result.error)?.error;
  if (loadError) throw new Error(`Impossible de charger les joueurs : ${loadError.message}`);

  const players = (playersRes.data ?? []).map((p) => ({
    user_id: p.user_id,
    country_id: p.country_id,
    email: p.email ?? "",
    name: p.name ?? null,
    created_at: p.created_at,
  }));
  const countries = countriesRes.data ?? [];

  const playersWithCountry = players.map((p) => ({
    ...p,
    countryName: countries.find((c) => c.id === p.country_id)?.name ?? "—",
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <JoueursManager
        players={playersWithCountry}
        countries={countries}
      />
    </div>
  );
}
