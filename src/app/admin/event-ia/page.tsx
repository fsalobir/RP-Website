import { createClient } from "@/lib/supabase/server";
import { EventIaList } from "@/components/admin/EventIaList";
import type { AiEventRow } from "@/components/admin/EventIaList";
import { getAllRelationRows, relationRowsToMap } from "@/lib/relations";

const AI_EVENT_ACTION_KEYS = [
  "insulte_diplomatique",
  "ouverture_diplomatique",
  "prise_influence",
  "escarmouche_militaire",
  "conflit_arme",
  "guerre_ouverte",
] as const;

export default async function AdminEventIaPage() {
  const supabase = await createClient();

  const [eventsRes, actionTypesRes, countriesRes, relationRowsRes, configRes, lastRunRes, cronDiagRes] = await Promise.all([
    supabase
      .from("ai_event_requests")
      .select(`
        id, country_id, action_type_id, status, payload, admin_effect_added,
        dice_results, refusal_message, created_at, resolved_at, resolved_by,
        scheduled_trigger_at, consequences_applied_at, source,
        country:countries(id, name, slug, flag_url, regime),
        state_action_types:action_type_id(key, label_fr, params_schema)
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("state_action_types")
      .select("id, key, label_fr")
      .in("key", [...AI_EVENT_ACTION_KEYS])
      .order("sort_order"),
    supabase.from("countries").select("id, name, flag_url, ai_status").order("name"),
    getAllRelationRows(supabase),
    supabase.from("rule_parameters").select("value").eq("key", "ai_events_config").maybeSingle(),
    supabase.from("rule_parameters").select("value").eq("key", "ai_events_last_run").maybeSingle(),
    supabase.rpc("get_ai_events_cron_diagnostic").then((r) => (r.data ?? (r.error ? { error: r.error?.message ?? String(r.error) } : null))),
  ]);

  const rawEvents = (eventsRes.data ?? []) as Record<string, unknown>[];
  const events: AiEventRow[] = rawEvents.map((r) => {
    const country = r.country;
    const typeRow = r.state_action_types;
    return {
      ...r,
      country: Array.isArray(country) ? country[0] : country,
      state_action_types: Array.isArray(typeRow) ? typeRow[0] : typeRow,
    } as AiEventRow;
  });

  const targetCountryIds = new Set<string>();
  for (const e of events) {
    const tid = e.payload?.target_country_id;
    if (typeof tid === "string" && tid) targetCountryIds.add(tid);
  }
  let targetCountriesById: Record<string, { name: string; flag_url: string | null; regime?: string | null }> = {};
  if (targetCountryIds.size > 0) {
    const { data: targetRows } = await supabase
      .from("countries")
      .select("id, name, flag_url, regime")
      .in("id", Array.from(targetCountryIds));
    if (targetRows?.length) {
      targetCountriesById = Object.fromEntries(
        targetRows.map((c) => [c.id, { name: c.name, flag_url: c.flag_url ?? null, regime: c.regime ?? null }])
      );
    }
  }

  const actionTypesForAi = (actionTypesRes.data ?? []) as { id: string; key: string; label_fr: string }[];
  const allCountriesList = (countriesRes.data ?? []) as { id: string; name: string; flag_url: string | null; ai_status: string | null }[];
  const aiCountries = allCountriesList.filter((c) => c.ai_status === "major" || c.ai_status === "minor");
  const allCountries = allCountriesList.map((c) => ({ id: c.id, name: c.name }));
  const relationMap: Record<string, number> = Object.fromEntries(relationRowsToMap(relationRowsRes ?? []));
  const aiEventsConfig = (configRes.data as { value?: Record<string, unknown> } | null)?.value ?? null;
  const lastRunRaw = (lastRunRes.data as { value?: string } | null)?.value;
  const aiEventsLastRun = typeof lastRunRaw === "string" ? lastRunRaw : null;
  const cronDiagnostic =
    cronDiagRes && typeof cronDiagRes === "object" && !("error" in cronDiagRes)
      ? (cronDiagRes as Record<string, unknown>)
      : null;
  const cronDiagnosticError = cronDiagRes && typeof cronDiagRes === "object" && "error" in cronDiagRes ? (cronDiagRes as { error: string }).error : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">Event IA</h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Événements IA (actions d&apos;État générées par le cron ou créés manuellement). Cliquez sur une ligne pour voir le détail, accepter ou refuser.
      </p>
      <EventIaList
        events={events}
        targetCountriesById={targetCountriesById}
        actionTypesForAi={actionTypesForAi}
        aiCountries={aiCountries}
        allCountries={allCountries}
        relationMap={relationMap}
        aiEventsConfig={aiEventsConfig}
        aiEventsLastRun={aiEventsLastRun}
        cronDiagnostic={cronDiagnostic}
        cronDiagnosticError={cronDiagnosticError}
      />
    </div>
  );
}
