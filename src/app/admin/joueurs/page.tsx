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
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Gestion Joueurs
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Créez des comptes joueurs (email / mot de passe) et assignez-les à un pays. Un joueur ne peut modifier que le pays auquel il est assigné (nom, régime, drapeau, budget).
      </p>

      <JoueursManager
        players={playersWithCountry}
        countries={countries}
      />
    </div>
  );
}
