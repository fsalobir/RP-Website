import { createClient } from "@/lib/supabase/server";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const [countriesRes, rulesRes, rosterRes, playersRes, perksRes] = await Promise.all([
    supabase.from("countries").select("id", { count: "exact", head: true }),
    supabase.from("rule_parameters").select("id", { count: "exact", head: true }),
    supabase.from("military_roster_units").select("id", { count: "exact", head: true }),
    supabase.from("country_players").select("user_id", { count: "exact", head: true }),
    supabase.from("perks").select("id", { count: "exact", head: true }),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Tableau de bord
      </h1>
      <p className="mb-8 max-w-2xl text-[var(--foreground-muted)]">
        Retrouvez une page par son nom ou par la tâche que vous voulez accomplir.
      </p>
      <AdminDashboardClient
        counts={{
          countries: countriesRes.count ?? 0,
          rules: rulesRes.count ?? 0,
          roster: rosterRes.count ?? 0,
          players: playersRes.count ?? 0,
          perks: perksRes.count ?? 0,
        }}
      />
    </div>
  );
}

