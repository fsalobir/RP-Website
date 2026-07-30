import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { formatWorldDate, type WorldDateValue } from "@/lib/worldDate";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const serviceSupabase = createServiceRoleClient();
  const [
    countriesRes,
    rulesRes,
    rosterRes,
    playersRes,
    perksRes,
    worldRes,
    pendingRequestsRes,
    pendingAiEventsRes,
  ] = await Promise.all([
    supabase.from("countries").select("id", { count: "exact", head: true }),
    supabase.from("rule_parameters").select("id", { count: "exact", head: true }),
    supabase.from("military_roster_units").select("id", { count: "exact", head: true }),
    supabase.from("country_players").select("user_id", { count: "exact", head: true }),
    supabase.from("perks").select("id", { count: "exact", head: true }),
    supabase
      .from("rule_parameters")
      .select("key, value")
      .in("key", ["world_date", "world_date_advance_months", "cron_paused"]),
    serviceSupabase
      .from("state_action_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    serviceSupabase
      .from("ai_event_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const worldValues = new Map(
    (worldRes.data ?? []).map((row) => [row.key, row.value])
  );
  const worldDateValue = worldValues.get("world_date");
  const advanceMonths = Math.max(
    0,
    Number(worldValues.get("world_date_advance_months") ?? 1)
  );
  const pausedValue = worldValues.get("cron_paused");
  const paused = pausedValue === true || String(pausedValue) === "true";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--foreground)]">
        Aujourd’hui
      </h1>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
        Suivez la partie en direct, traitez les décisions en attente ou préparez la prochaine session.
      </p>
      <AdminDashboardClient
        counts={{
          countries: countriesRes.count ?? 0,
          rules: rulesRes.count ?? 0,
          roster: rosterRes.count ?? 0,
          players: playersRes.count ?? 0,
          perks: perksRes.count ?? 0,
          requests: pendingRequestsRes.count ?? 0,
          aiEvents: pendingAiEventsRes.count ?? 0,
        }}
        world={{
          dateLabel: formatWorldDate(worldDateValue as WorldDateValue | null),
          paused,
          advanceMonths,
        }}
      />
    </div>
  );
}

