import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { DemandesList } from "@/components/admin/DemandesList";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import type { MilitaryBranch } from "@/types/database";
import { computeInfluenceForAll } from "@/lib/influence";
import { getAllRelationRows, relationRowsToMap } from "@/lib/relations";

export default async function AdminDemandesPage() {
  const supabase = await createClient();
  const serviceSupabase = createServiceRoleClient();
  const [requestsRes, rosterRes, countriesRes, countriesListRes, cmuRes, rosterLevelsRes, influenceConfigRes, intelConfigRes, relationRowsRes] = await Promise.all([
    serviceSupabase
      .from("state_action_requests")
      .select(`
        id, country_id, user_id, action_type_id, status, payload, admin_effect_added,
        refund_actions, refusal_message, created_at, resolved_at, resolved_by, dice_results,
        country:countries!country_id(id, name, slug, flag_url, regime),
        state_action_types:state_action_types(key, label_fr, cost, params_schema)
      `)
      .order("created_at", { ascending: false }),
    supabase.from("military_roster_units").select("id, name_fr, branch, sub_type, base_count").order("branch").order("sub_type").order("name_fr"),
    supabase.from("countries").select("id, population, gdp, stability"),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
    supabase.from("military_roster_unit_levels").select("unit_id, level, hard_power").order("unit_id").order("level"),
    supabase.from("rule_parameters").select("value").eq("key", "influence_config").maybeSingle(),
    supabase.from("rule_parameters").select("value").eq("key", "intel_config").maybeSingle(),
    getAllRelationRows(supabase),
  ]);

  type RequestRow = {
    id: string;
    country_id: string;
    user_id: string;
    action_type_id: string;
    status: string;
    payload: Record<string, unknown> | null;
    admin_effect_added: Record<string, unknown> | null;
    refund_actions: boolean;
    refusal_message: string | null;
    created_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    dice_results?: { success_roll?: { roll: number; modifier: number; total: number }; impact_roll?: { roll: number; modifier: number; total: number }; admin_modifiers?: Array<{ label: string; value: number }> } | null;
    country?: { id: string; name: string; slug: string; flag_url: string | null; regime: string | null } | null;
    state_action_types?: { key: string; label_fr: string; cost: number; params_schema: Record<string, unknown> | null } | null;
  };

  const raw = (requestsRes.data ?? []) as Record<string, unknown>[];
  const requests: RequestRow[] = raw.map((r) => {
    const country = r.country;
    const typeRow = r.state_action_types;
    return {
      ...r,
      country: Array.isArray(country) ? country[0] : country,
      state_action_types: Array.isArray(typeRow) ? typeRow[0] : typeRow,
    } as RequestRow;
  });

  const rosterUnits = (rosterRes.data ?? []) as Array<{ id: string; name_fr: string; branch: MilitaryBranch; sub_type: string | null; base_count: number }>;
const rosterUnitIds = rosterUnits.map((u) => ({ id: u.id, name_fr: u.name_fr }));

  const targetCountryIds = new Set<string>();
  for (const r of requests) {
    const tid = r.payload?.target_country_id;
    if (typeof tid === "string" && tid) targetCountryIds.add(tid);
  }
  let targetCountriesById: Record<string, { name: string; flag_url: string | null; regime: string | null }> = {};
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

  const countries = (countriesRes.data ?? []) as Array<{ id: string; population: number; gdp: number; stability: number }>;
  const countryMilitaryUnitsAll = (cmuRes.data ?? []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>;
  const rosterLevels = (rosterLevelsRes.data ?? []) as Array<{ unit_id: string; level: number; hard_power: number }>;
  const influenceConfig = (influenceConfigRes.data?.value ?? {}) as Parameters<typeof computeInfluenceForAll>[2];
  const hardPowerByCountry = computeHardPowerByCountry(countryMilitaryUnitsAll, rosterUnits, rosterLevels);
  const { byCountry: influenceByCountry } = computeInfluenceForAll(countries, hardPowerByCountry, influenceConfig);
  const influenceByCountryId: Record<string, number> = {};
  for (const c of countries) {
    const inf = influenceByCountry.get(c.id)?.influence;
    if (inf != null) influenceByCountryId[c.id] = Math.round(inf);
  }

  const relationMap: Record<string, number> = Object.fromEntries(relationRowsToMap(relationRowsRes ?? []));
  const countriesList = (countriesListRes.data ?? []) as Array<{ id: string; name: string }>;
  const intelConfig = (intelConfigRes.data?.value ?? {}) as { espionage_intel_gain_base?: number };
  const espionageIntelGainBase = Number(intelConfig.espionage_intel_gain_base ?? 50);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Demandes
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Tickets des joueurs (actions d'État). Cliquez sur une ligne pour voir le détail, modifier l'effet attaché, accepter ou refuser.
      </p>
      <DemandesList
        requests={requests}
        rosterUnitIds={rosterUnitIds}
        rosterUnits={rosterUnits}
        targetCountriesById={targetCountriesById}
        influenceByCountryId={influenceByCountryId}
        relationMap={relationMap}
        countriesList={countriesList}
        espionageIntelGainBase={espionageIntelGainBase}
      />
    </div>
  );
}
