import { unstable_cache } from "next/cache";
import { createClient, createAnonClientForCache } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CountryTabs } from "./CountryTabs";
import type { RosterRowByBranch } from "./countryTabsTypes";
import type {
  CountryUpdateLog,
  MilitaryBranch,
  MilitaryRosterUnit,
  MilitaryRosterUnitLevel,
  CountryMilitaryUnit,
} from "@/types/database";

const RULE_KEYS = [
  "global_growth_effects",
  "budget_sante",
  "budget_education",
  "budget_recherche",
  "budget_infrastructure",
  "budget_industrie",
  "budget_defense",
  "budget_interieur",
  "budget_affaires_etrangeres",
] as const;

async function fetchCountryPageGlobals() {
  const supabase = createAnonClientForCache();
  const [ruleRes, rosterUnitsRes, rosterLevelsRes, perksRes] = await Promise.all([
    supabase
      .from("rule_parameters")
      .select("key, value")
      .in("key", [...RULE_KEYS, "mobilisation_config", "mobilisation_level_effects"]),
    supabase
      .from("military_roster_units")
      .select("*")
      .order("branch")
      .order("sort_order")
      .order("name_fr"),
    supabase
      .from("military_roster_unit_levels")
      .select("*")
      .order("unit_id")
      .order("level"),
    supabase.from("perks").select("*").order("sort_order"),
  ]);
  return {
    ruleParamsData: ruleRes.data ?? [],
    rosterUnits: (rosterUnitsRes.data ?? []) as MilitaryRosterUnit[],
    rosterLevels: (rosterLevelsRes.data ?? []) as MilitaryRosterUnitLevel[],
    perksDef: perksRes.data ?? [],
  };
}

const getCachedCountryPageGlobals = unstable_cache(
  fetchCountryPageGlobals,
  ["country-page-globals"],
  { revalidate: 60, tags: ["country-page-globals"] }
);

export type { RosterRowByBranch };

export default async function CountryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: country, error } = await supabase
    .from("countries")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !country) notFound();

  const auth = await getCachedAuth();
  const isAdmin = auth.isAdmin;
  const isPlayerForThisCountry = auth.playerCountryId === country.id;
  const backHref = isAdmin ? "/admin/pays" : "/";

  const [cachedGlobals, macrosRes, limitsRes, countryPerksRes, budgetRes, effectsRes, countriesRes, updateLogsRes, mobilisationRes, countryMilitaryUnitsRes, assignedPlayerRes] = await Promise.all([
    getCachedCountryPageGlobals(),
    supabase.from("country_macros").select("*").eq("country_id", country.id),
    supabase
      .from("country_military_limits")
      .select("*, military_unit_types(*)")
      .eq("country_id", country.id),
    supabase.from("country_perks").select("perk_id").eq("country_id", country.id),
    supabase.from("country_budget").select("*").eq("country_id", country.id).maybeSingle(),
    supabase.from("country_effects").select("*").eq("country_id", country.id).gt("duration_remaining", 0),
    supabase.from("countries").select("id, population, gdp, militarism, industry, science, stability"),
    isAdmin
      ? supabase.from("country_update_logs").select("*").eq("country_id", country.id).order("run_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as CountryUpdateLog[] }),
    supabase.from("country_mobilisation").select("score, target_score").eq("country_id", country.id).maybeSingle(),
    supabase.from("country_military_units").select("*").eq("country_id", country.id),
    supabase.from("country_players").select("email, name").eq("country_id", country.id).maybeSingle(),
  ]);

  const { ruleParamsData, rosterUnits, rosterLevels, perksDef } = cachedGlobals;

  const playerRow = assignedPlayerRes.data;
  const assignedPlayerEmail = (playerRow?.name?.trim() || playerRow?.email) ?? null;

  const macros = macrosRes.data ?? [];
  const limits = limitsRes.data ?? [];
  const countryMilitaryUnits = (countryMilitaryUnitsRes.data ?? []) as CountryMilitaryUnit[];
  const unlockedPerkIds = new Set((countryPerksRes.data ?? []).map((p) => p.perk_id));
  const budget = budgetRes.data ?? null;
  const effects = effectsRes.data ?? [];

  const countries = countriesRes.data ?? [];
  const byPopulation = [...countries].sort((a, b) => Number(b.population) - Number(a.population));
  const byGdp = [...countries].sort((a, b) => Number(b.gdp) - Number(a.gdp));
  const rankPopulation = byPopulation.findIndex((c) => c.id === country.id) + 1 || 0;
  const rankGdp = byGdp.findIndex((c) => c.id === country.id) + 1 || 0;
  const updateLogs = (updateLogsRes.data ?? []) as CountryUpdateLog[];

  const ruleParametersByKey: Record<string, { value: unknown }> = {};
  for (const r of ruleParamsData) {
    ruleParametersByKey[r.key] = { value: r.value };
  }

  const mobilisationConfig = ruleParametersByKey.mobilisation_config?.value as
    | { level_thresholds?: Record<string, number>; daily_step?: number }
    | undefined;
  const mobilisationState = mobilisationRes.data
    ? { score: mobilisationRes.data.score, target_score: mobilisationRes.data.target_score }
    : null;

  const worldAverages = isAdmin && countries.length > 0
    ? {
        pop_avg: countries.reduce((s, c) => s + Number(c.population ?? 0), 0) / countries.length,
        gdp_avg: countries.reduce((s, c) => s + Number(c.gdp ?? 0), 0) / countries.length,
        mil_avg: countries.reduce((s, c) => s + Number(c.militarism ?? 0), 0) / countries.length,
        ind_avg: countries.reduce((s, c) => s + Number(c.industry ?? 0), 0) / countries.length,
        sci_avg: countries.reduce((s, c) => s + Number(c.science ?? 0), 0) / countries.length,
        stab_avg: countries.reduce((s, c) => s + Number(c.stability ?? 0), 0) / countries.length,
      }
    : null;

  const branches: MilitaryBranch[] = ["terre", "air", "mer", "strategique"];
  const rosterByBranch: Record<MilitaryBranch, RosterRowByBranch[]> = {
    terre: [],
    air: [],
    mer: [],
    strategique: [],
  };
  for (const unit of rosterUnits) {
    const countryState =
      countryMilitaryUnits.find((cmu) => cmu.roster_unit_id === unit.id) ?? null;
    const levels = rosterLevels
      .filter((l) => l.unit_id === unit.id)
      .sort((a, b) => a.level - b.level)
      .map((l) => ({ level: l.level, manpower: l.manpower }));
    rosterByBranch[unit.branch].push({ unit, countryState, levels });
  }
  for (const b of branches) {
    rosterByBranch[b].sort(
      (a, b) => (a.unit.sort_order ?? 0) - (b.unit.sort_order ?? 0) || a.unit.name_fr.localeCompare(b.unit.name_fr)
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link
        href={backHref}
        className="mb-6 inline-block text-sm text-[var(--foreground-muted)] hover:text-[var(--accent)]"
      >
        ← Retour aux nations
      </Link>

      <CountryTabs
        country={country}
        macros={macros}
        limits={limits}
        perksDef={perksDef}
        unlockedPerkIds={unlockedPerkIds}
        budget={budget}
        effects={effects}
        rankPopulation={rankPopulation}
        rankGdp={rankGdp}
        isAdmin={isAdmin}
        isPlayerForThisCountry={isPlayerForThisCountry}
        assignedPlayerEmail={assignedPlayerEmail}
        updateLogs={updateLogs}
        ruleParametersByKey={ruleParametersByKey}
        worldAverages={worldAverages}
        rosterByBranch={rosterByBranch}
        mobilisationConfig={mobilisationConfig}
        mobilisationState={mobilisationState}
      />
    </div>
  );
}
