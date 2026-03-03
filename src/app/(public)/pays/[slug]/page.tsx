import { unstable_cache } from "next/cache";
import { createClient, createAnonClientForCache } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CountryTabs } from "./CountryTabs";
import type { RosterRowByBranch } from "./countryTabsTypes";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { computeInfluenceForAll, applyInfluenceModifiers } from "@/lib/influence";
import { getEffectsForCountry, getInfluenceModifiersFromEffects } from "@/lib/countryEffects";
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
      .in("key", [...RULE_KEYS, "mobilisation_config", "mobilisation_level_effects", "world_date", "influence_config", "ai_major_effects", "ai_minor_effects"]),
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

  const [cachedGlobals, macrosRes, limitsRes, countryPerksRes, budgetRes, effectsRes, countriesRes, updateLogsRes, mobilisationRes, countryMilitaryUnitsRes, countryMilitaryUnitsAllRes, assignedPlayerRes, controlRes] = await Promise.all([
    getCachedCountryPageGlobals(),
    supabase.from("country_macros").select("*").eq("country_id", country.id),
    supabase
      .from("country_military_limits")
      .select("*, military_unit_types(*)")
      .eq("country_id", country.id),
    supabase.from("country_perks").select("perk_id").eq("country_id", country.id),
    supabase.from("country_budget").select("*").eq("country_id", country.id).maybeSingle(),
    supabase.from("country_effects").select("*").eq("country_id", country.id).or("duration_remaining.gt.0,duration_kind.eq.permanent"),
    supabase.from("countries").select("id, population, gdp, militarism, industry, science, stability"),
    supabase.from("country_control").select("country_id").eq("controller_country_id", country.id),
    isAdmin
      ? supabase.from("country_update_logs").select("*").eq("country_id", country.id).order("run_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as CountryUpdateLog[] }),
    supabase.from("country_mobilisation").select("score, target_score").eq("country_id", country.id).maybeSingle(),
    supabase.from("country_military_units").select("*").eq("country_id", country.id),
    supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
    supabase.from("country_players").select("email, name").eq("country_id", country.id).maybeSingle(),
  ]);

  const controlRows = (Array.isArray(controlRes.data) ? controlRes.data : []) as { country_id: string }[];
  const controlledIds = [...new Set(controlRows.map((r) => r.country_id))];
  const sphereCountries =
    controlledIds.length > 0
      ? (await supabase.from("countries").select("id, name, slug, population, gdp").in("id", controlledIds)).data ?? []
      : [];
  const sphereData = {
    totalPopulation: sphereCountries.reduce((s, c) => s + Number(c.population ?? 0), 0),
    totalGdp: sphereCountries.reduce((s, c) => s + Number(c.gdp ?? 0), 0),
    countries: sphereCountries as Array<{ id: string; name: string; slug: string; population: number | null; gdp: number | null }>,
  };

  const { ruleParamsData, rosterUnits, rosterLevels, perksDef } = cachedGlobals;

  const playerRow = assignedPlayerRes.data as { email?: string; name?: string } | null;
  const assignedPlayerEmail = (playerRow?.name?.trim() || playerRow?.email) ?? null;

  const macros = macrosRes.data ?? [];
  const limits = limitsRes.data ?? [];
  const countryMilitaryUnits = (Array.isArray(countryMilitaryUnitsRes.data) ? countryMilitaryUnitsRes.data : []) as CountryMilitaryUnit[];
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

  const countryMilitaryUnitsAll = (Array.isArray(countryMilitaryUnitsAllRes.data) ? countryMilitaryUnitsAllRes.data : []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>;
  const rosterUnitsForInfluence = rosterUnits as Array<{ id: string; branch: MilitaryBranch; base_count: number }>;
  const rosterLevelsForInfluence = rosterLevels as Array<{ unit_id: string; level: number; hard_power: number }>;
  const hardPowerByCountry = computeHardPowerByCountry(countryMilitaryUnitsAll, rosterUnitsForInfluence, rosterLevelsForInfluence);
  const influenceConfig = ruleParametersByKey.influence_config?.value as Record<string, unknown> | undefined;
  const { byCountry: influenceByCountry } = computeInfluenceForAll(
    countries,
    hardPowerByCountry,
    (influenceConfig ?? {}) as Parameters<typeof computeInfluenceForAll>[2]
  );
  let influenceResult = influenceByCountry.get(country.id) ?? null;

  const mobilisationConfig = ruleParametersByKey.mobilisation_config?.value as
    | { level_thresholds?: Record<string, number>; daily_step?: number }
    | undefined;
  const mobilisationRow = mobilisationRes.data as { score: number; target_score: number } | null;
  const mobilisationState = mobilisationRow
    ? { score: mobilisationRow.score, target_score: mobilisationRow.target_score }
    : null;

  const globalGrowthEffects = (Array.isArray(ruleParametersByKey.global_growth_effects?.value) ? ruleParametersByKey.global_growth_effects.value : []) as Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  const aiMajorEffects = (Array.isArray(ruleParametersByKey.ai_major_effects?.value) ? ruleParametersByKey.ai_major_effects.value : []) as Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  const aiMinorEffects = (Array.isArray(ruleParametersByKey.ai_minor_effects?.value) ? ruleParametersByKey.ai_minor_effects.value : []) as Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  const mobilisationLevelEffectsRaw = (Array.isArray(ruleParametersByKey.mobilisation_level_effects?.value) ? ruleParametersByKey.mobilisation_level_effects.value : []) as Array<{ level: string; effect_kind: string; effect_target: string | null; value: number }>;
  const mobilisationLevelKey = (() => {
    if (!mobilisationConfig?.level_thresholds || mobilisationState == null) return null;
    const score = mobilisationState.score ?? 0;
    const entries = Object.entries(mobilisationConfig.level_thresholds)
      .filter(([, val]) => typeof val === "number")
      .sort(([, a], [, b]) => (b as number) - (a as number));
    const found = entries.find(([, val]) => (val as number) <= score);
    return found?.[0] ?? null;
  })();
  const mobilisationLevelEffects = mobilisationLevelKey ? mobilisationLevelEffectsRaw.filter((e) => e.level === mobilisationLevelKey) : [];
  const effectsContext = {
    countryId: country.id,
    countryEffects: effects,
    mobilisationLevelEffects: mobilisationLevelEffects.map((e) => ({ effect_kind: e.effect_kind, effect_target: e.effect_target, value: e.value })),
    globalGrowthEffects,
    ai_status: country.ai_status ?? null,
    aiMajorEffects,
    aiMinorEffects,
  };
  const resolvedEffects = getEffectsForCountry(effectsContext);
  const influenceMods = getInfluenceModifiersFromEffects(resolvedEffects, (e) => e.duration_kind === "permanent" || (e.duration_remaining ?? 0) > 0);
  if (influenceResult && (influenceMods.global !== 1 || influenceMods.gdp !== 1 || influenceMods.population !== 1 || influenceMods.hard_power !== 1)) {
    influenceResult = applyInfluenceModifiers(influenceResult, influenceMods);
  }

  const worldAverages = countries.length > 0
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
      .map((l) => ({ level: l.level, manpower: l.manpower, hard_power: (l as { hard_power?: number }).hard_power ?? 0 }));
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
        worldDate={ruleParametersByKey.world_date?.value as { month: number; year: number } | undefined}
        influenceResult={influenceResult}
        hardPowerByBranch={hardPowerByCountry.get(country.id) ?? null}
        ai_status={country.ai_status ?? null}
        aiMajorEffects={aiMajorEffects}
        aiMinorEffects={aiMinorEffects}
        sphereData={sphereData}
      />
    </div>
  );
}
