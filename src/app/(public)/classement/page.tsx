import { createClient } from "@/lib/supabase/server";
import { ClassementContent } from "@/components/classement/ClassementContent";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { computeInfluenceForAll } from "@/lib/influence";
import type { MilitaryBranch } from "@/types/database";

export const revalidate = 3600;

function normId(id: string | null | undefined): string {
  return String(id ?? "").trim().toLowerCase();
}

export default async function ClassementPage() {
  const supabase = await createClient();
  const [countriesResult, historyResult, rulesRes, rosterUnitsRes, rosterLevelsRes, countryMilitaryRes] = await Promise.all([
    supabase
      .from("countries")
      .select("id, name, slug, flag_url, population, gdp, militarism, industry, science, stability")
      .order("name"),
    supabase
      .from("country_history")
      .select("country_id, date, population, gdp, militarism, industry, science, stability")
      .order("date", { ascending: false }),
    supabase.from("rule_parameters").select("key, value").eq("key", "influence_config"),
    supabase.from("military_roster_units").select("id, branch, base_count"),
    supabase.from("military_roster_unit_levels").select("unit_id, level, hard_power"),
    supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
  ]);

  const { data: countries } = countriesResult;
  const { data: historyRows, error: historyError } = historyResult;
  const influenceConfig = (rulesRes.data ?? []).find((r) => r.key === "influence_config")?.value as Record<string, unknown> | undefined;
  const rosterUnits = (rosterUnitsRes.data ?? []) as Array<{ id: string; branch: MilitaryBranch; base_count: number }>;
  const rosterLevels = (rosterLevelsRes.data ?? []) as Array<{ unit_id: string; level: number; hard_power: number }>;
  const countryMilitaryUnits = (countryMilitaryRes.data ?? []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>;

  type HistoryRow = NonNullable<typeof historyRows>[number];
  const latestByCountry = new Map<string, HistoryRow>();
  if (historyRows?.length && !historyError) {
    for (const row of historyRows) {
      const id = normId(row.country_id);
      if (id && !latestByCountry.has(id)) {
        latestByCountry.set(id, row);
      }
    }
  }

  const hardPowerByCountry = computeHardPowerByCountry(countryMilitaryUnits, rosterUnits, rosterLevels);
  const { byCountry: influenceByCountry } = computeInfluenceForAll(
    countries ?? [],
    hardPowerByCountry,
    (influenceConfig ?? {}) as Parameters<typeof computeInfluenceForAll>[2]
  );

  const rows =
    countries?.map((c) => {
      const hp = hardPowerByCountry.get(c.id) ?? { terre: 0, air: 0, mer: 0, strategique: 0, total: 0 };
      return {
        country: c,
        prev: latestByCountry.get(normId(c.id)) ?? null,
        influence: influenceByCountry.get(c.id)?.influence ?? null,
        hard_power_terre: hp.terre,
        hard_power_air: hp.air,
        hard_power_mer: hp.mer,
        hard_power_strategique: hp.strategique,
        hard_power_total: hp.total,
      };
    }) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Classement des nations
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Vue d'ensemble des puissances mondiales par critères global, militaire et économique.
      </p>
      <ClassementContent rows={rows} />
    </div>
  );
}
