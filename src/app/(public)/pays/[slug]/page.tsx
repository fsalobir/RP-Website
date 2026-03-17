import { unstable_cache } from "next/cache";
import { createClient, createAnonClientForCache, createServiceRoleClient } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CountryTabs } from "./CountryTabs";
import type { RosterRowByBranch } from "./countryTabsTypes";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { computeInfluenceForAll, applyInfluenceModifiers } from "@/lib/influence";
import { getAllRelationRows, relationRowsToMap, getRelationFromMap } from "@/lib/relations";
import { getEffectsForCountry, getInfluenceModifiersFromEffects } from "@/lib/countryEffects";
import { resolveAllLawEffectsForCountry, LAW_DEFINITIONS, type CountryLawRow } from "@/lib/laws";
import { isPerkActive } from "@/lib/perkRequirements";
import { computeFoggedRoster, type FoggedRoster } from "@/lib/intelFog";
import { fetchWorldIdeologyState } from "@/lib/ideologyServer";
import { getEffectiveSpherePct, type SphereInfluencePct } from "@/lib/ideology";
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
  "etat_major_config",
  ...LAW_DEFINITIONS.map((d) => d.configRuleKey),
  ...LAW_DEFINITIONS.map((d) => d.effectsRuleKey),
] as const;

async function fetchCountryPageGlobals() {
  const supabase = createAnonClientForCache();
  const [ruleRes, rosterUnitsRes, rosterLevelsRes, perkCategoriesRes, perksRes] = await Promise.all([
    supabase
      .from("rule_parameters")
      .select("key, value")
      .in("key", [...RULE_KEYS, "mobilisation_config", "mobilisation_level_effects", "world_date", "influence_config", "sphere_influence_pct", "ai_major_effects", "ai_minor_effects", "ideology_effects"]),
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
    supabase.from("perk_categories").select("*").order("sort_order"),
    supabase.from("perks").select("*, perk_categories(*), perk_effects(*), perk_requirements(*)").order("sort_order"),
  ]);
  return {
    ruleParamsData: ruleRes.data ?? [],
    rosterUnits: (rosterUnitsRes.data ?? []) as MilitaryRosterUnit[],
    rosterLevels: (rosterLevelsRes.data ?? []) as MilitaryRosterUnitLevel[],
    perkCategories: perkCategoriesRes.data ?? [],
    perksDef: perksRes.data ?? [],
  };
}

const getCachedCountryPageGlobals = unstable_cache(
  fetchCountryPageGlobals,
  ["country-page-globals"],
  { revalidate: 60, tags: ["country-page-globals"] }
);

export const dynamic = "force-dynamic";

export type { RosterRowByBranch };
export type { FoggedRoster } from "@/lib/intelFog";

async function fetchCountryPagePublicData(slug: string) {
  const supabase = createAnonClientForCache();

  const { data: country, error } = await supabase
    .from("countries")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !country) return { country: null as typeof country | null };

  const [macrosRes, limitsRes, countryPerksRes, budgetRes, effectsRes, countriesRes, controlRes, countryLawsRes, countryMilitaryUnitsRes, countryMilitaryUnitsAllRes, etatMajorFocusRes] = await Promise.all([
    supabase.from("country_macros").select("*").eq("country_id", country.id),
    supabase
      .from("country_military_limits")
      .select("*, military_unit_types(*)")
      .eq("country_id", country.id),
    supabase.from("country_perks").select("perk_id").eq("country_id", country.id),
    supabase.from("country_budget").select("*").eq("country_id", country.id).maybeSingle(),
    supabase.from("country_effects").select("*").eq("country_id", country.id).or("duration_remaining.gt.0,duration_kind.eq.permanent"),
    supabase.from("countries").select("id, population, gdp, militarism, industry, science, stability"),
    supabase.from("country_control").select("country_id, share_pct, is_annexed").eq("controller_country_id", country.id),
    supabase.from("country_laws").select("law_key, score, target_score").eq("country_id", country.id),
    supabase.from("country_military_units").select("*").eq("country_id", country.id),
    supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
    supabase
      .from("country_etat_major_focus")
      .select("design_roster_unit_id, recrutement_roster_unit_id, procuration_roster_unit_id, stock_roster_unit_id")
      .eq("country_id", country.id)
      .maybeSingle(),
  ]);

  const controlRows = (Array.isArray(controlRes.data) ? controlRes.data : []) as Array<{ country_id: string; share_pct: number; is_annexed: boolean }>;
  const controlledIds = [...new Set(controlRows.map((r) => r.country_id))];
  const sphereCountries =
    controlledIds.length > 0
      ? (await supabase.from("countries").select("id, name, slug, flag_url, population, gdp").in("id", controlledIds)).data ?? []
      : [];

  return {
    country,
    macrosRes,
    limitsRes,
    countryPerksRes,
    budgetRes,
    effectsRes,
    countriesRes,
    controlRows,
    sphereCountries,
    countryLawsRes,
    countryMilitaryUnitsRes,
    countryMilitaryUnitsAllRes,
    etatMajorFocusRes,
  };
}

function getCachedCountryPagePublicData(slug: string) {
  return unstable_cache(
    () => fetchCountryPagePublicData(slug),
    ["country-page-public", slug],
    { revalidate: 60, tags: [`country-page:${slug}`] }
  )();
}

export default async function CountryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cachedGlobals = await getCachedCountryPageGlobals();
  const publicData = await getCachedCountryPagePublicData(slug);
  const country = publicData.country;
  if (!country) notFound();

  const auth = await getCachedAuth();
  const isAdmin = auth.isAdmin;
  const isPlayerForThisCountry = auth.playerCountryId === country.id;
  const backHref = isAdmin ? "/admin/pays" : "/";

  const supabase = await createClient();
  const [updateLogsRes, assignedPlayerRes, countriesListRes, ideologyState] = await Promise.all([
    isAdmin
      ? supabase.from("country_update_logs").select("*").eq("country_id", country.id).order("run_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as CountryUpdateLog[] }),
    supabase.from("country_players").select("email, name").eq("country_id", country.id).maybeSingle(),
    supabase.from("countries").select("id, name").order("name"),
    fetchWorldIdeologyState(createServiceRoleClient()),
  ]);

  const controlRows = publicData.controlRows ?? [];
  const sphereCountries = publicData.sphereCountries ?? [];
  // sphereData : somme impériale (pays maître + parts proportionnelles au contrôle). Enrichi plus bas.
  const masterPop = Number(country.population ?? 0);
  const masterGdp = Number(country.gdp ?? 0);
  let sphereData: {
    totalPopulation: number;
    totalGdp: number;
    masterInfluence: number;
    totalInfluence: number;
    countries: Array<{
      id: string;
      name: string;
      slug: string;
      flag_url: string | null;
      population: number | null;
      gdp: number | null;
      share_pct: number;
      is_annexed: boolean;
      controlStatus: "Contesté" | "Occupé" | "Annexé";
      influenceGiven: number;
      contributionPopulation: number;
      contributionGdp: number;
    }>;
  } = {
    totalPopulation: masterPop,
    totalGdp: masterGdp,
    masterInfluence: 0,
    totalInfluence: 0,
    countries: [],
  };

  let stateActionTypes: Array<{ id: string; key: string; label_fr: string; cost: number; params_schema: Record<string, unknown> | null }> = [];
  let stateActionBalance: number = 0;
  let stateActionRequests: Array<{ id: string; action_type_id: string; status: string; payload: Record<string, unknown> | null; created_at: string; refusal_message: string | null; dice_results?: { success_roll?: { roll: number; modifier: number; total: number }; impact_roll?: { roll: number; modifier: number; total: number } } | null; admin_effect_added: Record<string, unknown> | null; state_action_types?: { key: string; label_fr: string } | null }> = [];
  let incomingTargetRequests: Array<{ id: string; action_type_id: string; status: string; payload: Record<string, unknown> | null; created_at: string; state_action_types?: { key: string; label_fr: string } | null; country?: { id: string; name: string; slug: string; flag_url: string | null } | null }> = [];
  let countriesForTarget: Array<{ id: string; name: string; flag_url: string | null; regime: string | null; influence: number; relation: number }> = [];
  if (isPlayerForThisCountry) {
    const [typesRes, balanceRes, requestsRes, incomingRes, countriesTargetRes] = await Promise.all([
      supabase.from("state_action_types").select("id, key, label_fr, cost, params_schema").order("sort_order"),
      supabase.from("country_state_action_balance").select("balance").eq("country_id", country.id).maybeSingle(),
      supabase.from("state_action_requests").select("id, action_type_id, status, payload, created_at, refusal_message, dice_results, admin_effect_added, state_action_types:state_action_types(key, label_fr)").eq("country_id", country.id).order("created_at", { ascending: false }),
      supabase.from("state_action_requests").select("id, action_type_id, status, payload, created_at, state_action_types:state_action_types(key, label_fr), country:countries(id, name, slug, flag_url)").eq("target_country_id", country.id).eq("status", "pending_target").order("created_at", { ascending: false }),
      supabase.from("countries").select("id, name, flag_url, regime").neq("id", country.id).order("name"),
    ]);
    stateActionTypes = (typesRes.data ?? []) as Array<{ id: string; key: string; label_fr: string; cost: number; params_schema: Record<string, unknown> | null }>;
    stateActionBalance = (balanceRes.data?.balance ?? 0) as number;
    const rawReqs = requestsRes.data ?? [];
    stateActionRequests = rawReqs.map((r: Record<string, unknown>) => ({
      ...r,
      state_action_types: Array.isArray(r.state_action_types) ? r.state_action_types[0] : r.state_action_types,
    })) as typeof stateActionRequests;
    const rawIncoming = incomingRes.data ?? [];
    incomingTargetRequests = rawIncoming.map((r: Record<string, unknown>) => ({
      ...r,
      state_action_types: Array.isArray(r.state_action_types) ? r.state_action_types[0] : r.state_action_types,
      country: Array.isArray(r.country) ? r.country[0] : r.country,
    })) as typeof incomingTargetRequests;
    countriesForTarget = ((countriesTargetRes.data ?? []) as Array<{ id: string; name: string; flag_url: string | null; regime: string | null }>).map((c) => ({
      ...c,
      influence: 0,
      relation: 0,
    }));
  }

  const { ruleParamsData, rosterUnits, rosterLevels, perkCategories, perksDef } = cachedGlobals;

  const playerRow = assignedPlayerRes.data as { email?: string; name?: string } | null;
  const assignedPlayerEmail = (playerRow?.name?.trim() || playerRow?.email) ?? null;

  const macros = publicData.macrosRes?.data ?? [];
  const limits = publicData.limitsRes?.data ?? [];
  const countryMilitaryUnits = (Array.isArray(publicData.countryMilitaryUnitsRes?.data) ? publicData.countryMilitaryUnitsRes?.data : []) as CountryMilitaryUnit[];
  const etatMajorFocus = publicData.etatMajorFocusRes?.data as { design_roster_unit_id: string | null; recrutement_roster_unit_id: string | null; procuration_roster_unit_id: string | null; stock_roster_unit_id: string | null } | null;
  const unlockedPerkIds = new Set((publicData.countryPerksRes?.data ?? []).map((p) => p.perk_id));

  const activePerkIds = new Set<string>();
  const perkEffects: Array<{ effect_kind: string; effect_target: string | null; value: number; sourceLabel: string }> = [];
  const budget = publicData.budgetRes?.data ?? null;
  const effects = publicData.effectsRes?.data ?? [];

  const countries = publicData.countriesRes?.data ?? [];
  const byPopulation = [...countries].sort((a, b) => Number(b.population) - Number(a.population));
  const byGdp = [...countries].sort((a, b) => Number(b.gdp) - Number(a.gdp));
  const rankPopulation = byPopulation.findIndex((c) => c.id === country.id) + 1 || 0;
  const rankGdp = byGdp.findIndex((c) => c.id === country.id) + 1 || 0;
  const updateLogs = (updateLogsRes.data ?? []) as CountryUpdateLog[];
  const ruleParametersByKey: Record<string, { value: unknown }> = {};
  for (const r of ruleParamsData) {
    ruleParametersByKey[r.key] = { value: r.value };
  }

  const countryMilitaryUnitsAll = (Array.isArray(publicData.countryMilitaryUnitsAllRes?.data) ? publicData.countryMilitaryUnitsAllRes?.data : []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>;
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

  if (sphereCountries.length > 0) {
    const sphereInfluencePct = ruleParametersByKey.sphere_influence_pct?.value as SphereInfluencePct | undefined;
    const controlByCountryId = new Map(controlRows.map((r) => [r.country_id, r]));
    const deriveControlStatus = (share_pct: number, is_annexed: boolean): "Contesté" | "Occupé" | "Annexé" => {
      if (is_annexed) return "Annexé";
      if (share_pct >= 100) return "Occupé";
      return "Contesté";
    };
    let sumContributionPop = 0;
    let sumContributionGdp = 0;
    const countries = (sphereCountries as Array<{ id: string; name: string; slug: string; flag_url: string | null; population: number | null; gdp: number | null }>).map((c) => {
      const control = controlByCountryId.get(c.id) ?? { share_pct: 0, is_annexed: false };
      const share_pct = Number(control.share_pct ?? 0);
      const is_annexed = !!control.is_annexed;
      const pop = Number(c.population ?? 0);
      const gdp = Number(c.gdp ?? 0);
      const controlRow = { country_id: c.id, controller_country_id: country.id, share_pct, is_annexed };
      const effectivePct = getEffectiveSpherePct(controlRow, sphereInfluencePct);
      const contributionPopulation = (pop * share_pct * effectivePct) / 10000;
      const contributionGdp = (gdp * share_pct * effectivePct) / 10000;
      sumContributionPop += contributionPopulation;
      sumContributionGdp += contributionGdp;
      const rawInfluence = influenceByCountry.get(c.id)?.influence ?? 0;
      const influenceGiven = Math.round((rawInfluence * (share_pct / 100) * (effectivePct / 100)));
      return {
        ...c,
        share_pct,
        is_annexed,
        controlStatus: deriveControlStatus(share_pct, is_annexed),
        influenceGiven,
        contributionPopulation,
        contributionGdp,
      };
    });
    sphereData = {
      ...sphereData,
      totalPopulation: masterPop + sumContributionPop,
      totalGdp: masterGdp + sumContributionGdp,
      countries,
    };
  }

  const countryLawRows: CountryLawRow[] = ((Array.isArray(publicData.countryLawsRes?.data) ? publicData.countryLawsRes?.data : []) as Array<{ law_key: string; score: number; target_score: number }>).map((r) => ({
    country_id: country.id,
    law_key: r.law_key,
    score: Number(r.score ?? 0),
    target_score: Number(r.target_score ?? 0),
  }));

  const perkActivationContext = {
    country: {
      militarism: country.militarism ?? null,
      industry: country.industry ?? null,
      science: country.science ?? null,
      stability: country.stability ?? null,
      gdp: country.gdp ?? null,
      population: country.population ?? null,
    },
    influenceValue: influenceByCountry.get(country.id)?.influence ?? null,
    countryLawRows,
    ruleParametersByKey,
  };
  for (const perk of perksDef as Array<{ id: string; name_fr: string; perk_effects?: Array<{ effect_kind: string; effect_target: string | null; value: number }>; perk_requirements?: Array<{ requirement_kind: string; requirement_target: string | null; value: number }> }>) {
    if (isPerkActive(perk, perkActivationContext)) activePerkIds.add(perk.id);
  }
  for (const perk of perksDef as Array<{ id: string; name_fr: string; perk_effects?: Array<{ effect_kind: string; effect_target: string | null; value: number }> }>) {
    if (!activePerkIds.has(perk.id) || !perk.perk_effects?.length) continue;
    const sourceLabel = `Avantage : ${perk.name_fr}`;
    for (const e of perk.perk_effects) {
      perkEffects.push({
        effect_kind: e.effect_kind,
        effect_target: e.effect_target ?? null,
        value: Number(e.value),
        sourceLabel,
      });
    }
  }

  const lawLevelEffects = resolveAllLawEffectsForCountry(countryLawRows, ruleParametersByKey);

  const globalGrowthEffects = (Array.isArray(ruleParametersByKey.global_growth_effects?.value) ? ruleParametersByKey.global_growth_effects.value : []) as Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  const aiMajorEffects = (Array.isArray(ruleParametersByKey.ai_major_effects?.value) ? ruleParametersByKey.ai_major_effects.value : []) as Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  const aiMinorEffects = (Array.isArray(ruleParametersByKey.ai_minor_effects?.value) ? ruleParametersByKey.ai_minor_effects.value : []) as Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  const ideologySummaryForContext = ideologyState.ideologyByCountry.get(country.id) ?? null;
  const ideologyEffectsConfigRaw = ruleParametersByKey.ideology_effects?.value;
  const ideologyEffectsConfig = Array.isArray(ideologyEffectsConfigRaw)
    ? (ideologyEffectsConfigRaw as Array<{ ideology_id: string; effect_kind: string; effect_target: string | null; value: number }>).filter(
        (e) => e && typeof e.ideology_id === "string" && typeof e.effect_kind === "string" && typeof e.value === "number"
      )
    : [];
  const effectsContext = {
    countryId: country.id,
    countryEffects: effects,
    lawLevelEffects,
    globalGrowthEffects,
    ai_status: country.ai_status ?? null,
    aiMajorEffects,
    aiMinorEffects,
    perkEffects,
    ideologyScores: ideologySummaryForContext?.scores ?? undefined,
    ideologyEffectsConfig: ideologyEffectsConfig.length > 0 ? ideologyEffectsConfig : undefined,
  };
  const resolvedEffects = getEffectsForCountry(effectsContext);
  const influenceMods = getInfluenceModifiersFromEffects(resolvedEffects, (e) => e.duration_kind === "permanent" || (e.duration_remaining ?? 0) > 0);
  if (influenceResult && (influenceMods.global !== 1 || influenceMods.gdp !== 1 || influenceMods.population !== 1 || influenceMods.hard_power !== 1)) {
    influenceResult = applyInfluenceModifiers(influenceResult, influenceMods);
  }
  sphereData.masterInfluence = influenceResult?.influence ?? 0;
  sphereData.totalInfluence = sphereData.masterInfluence + sphereData.countries.reduce((s, c) => s + c.influenceGiven, 0);
  const latestUpdateLog = updateLogs[0] ?? null;
  const getInfluenceForCountrySnapshot = (overrides?: { population?: number | null; gdp?: number | null; stability?: number | null }) => {
    const snapshotCountries = countries.map((c) =>
      c.id === country.id
        ? {
            ...c,
            population: Number(overrides?.population ?? c.population ?? 0),
            gdp: Number(overrides?.gdp ?? c.gdp ?? 0),
            stability: Number(overrides?.stability ?? c.stability ?? 0),
          }
        : c
    );
    const { byCountry } = computeInfluenceForAll(
      snapshotCountries,
      hardPowerByCountry,
      (influenceConfig ?? {}) as Parameters<typeof computeInfluenceForAll>[2]
    );
    let value = byCountry.get(country.id) ?? null;
    if (value && (influenceMods.global !== 1 || influenceMods.gdp !== 1 || influenceMods.population !== 1 || influenceMods.hard_power !== 1)) {
      value = applyInfluenceModifiers(value, influenceMods);
    }
    return value;
  };
  const previousInfluenceResult = latestUpdateLog
    ? getInfluenceForCountrySnapshot({
        population: latestUpdateLog.population_before,
        gdp: latestUpdateLog.gdp_before,
        stability: latestUpdateLog.stability_before,
      })
    : null;
  const lastCronInfluenceAfterResult = latestUpdateLog
    ? getInfluenceForCountrySnapshot({
        population: latestUpdateLog.population_after,
        gdp: latestUpdateLog.gdp_after,
        stability: latestUpdateLog.stability_after,
      })
    : null;
  if (countriesForTarget.length > 0) {
    const relationRows = await getAllRelationRows(supabase);
    const relationMap = relationRowsToMap(relationRows);
    countriesForTarget = countriesForTarget.map((c) => ({
      ...c,
      influence: Math.round(influenceByCountry.get(c.id)?.influence ?? 0),
      relation: getRelationFromMap(relationMap, country.id, c.id),
    }));
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

  const ideologySummary = ideologyState.ideologyByCountry.get(country.id) ?? null;

  let intelLevel: number | null = null;
  let foggedRoster: FoggedRoster | null = null;

  const countryStateByUnitId = new Map<string, CountryMilitaryUnit>();
  for (const row of countryMilitaryUnits) {
    if (row?.roster_unit_id) countryStateByUnitId.set(row.roster_unit_id, row);
  }

  const rosterLevelsByUnitId = new Map<string, MilitaryRosterUnitLevel[]>();
  for (const lvl of rosterLevels as MilitaryRosterUnitLevel[]) {
    const unitId = (lvl as { unit_id?: string }).unit_id;
    if (!unitId) continue;
    const list = rosterLevelsByUnitId.get(unitId) ?? [];
    list.push(lvl);
    rosterLevelsByUnitId.set(unitId, list);
  }
  for (const [unitId, list] of rosterLevelsByUnitId) {
    list.sort((a, b) => Number(a.level ?? 0) - Number(b.level ?? 0));
    rosterLevelsByUnitId.set(unitId, list);
  }

  if (!isAdmin && !isPlayerForThisCountry) {
    let intelRow: { intel_level: number; display_seed: number } | null = null;
    if (auth.playerCountryId) {
      const { data } = await supabase
        .from("country_intel")
        .select("intel_level, display_seed")
        .eq("observer_country_id", auth.playerCountryId)
        .eq("target_country_id", country.id)
        .maybeSingle();
      intelRow = data;
    }
    intelLevel = intelRow ? Number(intelRow.intel_level) : 0;
    // Seed d'affichage déterministe si aucun row en base (évite Math.random() dans le render).
    const displaySeed = intelRow
      ? Number(intelRow.display_seed)
      : (() => {
          const s = `${auth.playerCountryId ?? "anon"}|${country.id}`;
          let h = 2166136261;
          for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          // Borné à int32 positif.
          return (h >>> 0) % 2147483647;
        })();
    const tempRoster: Record<MilitaryBranch, RosterRowByBranch[]> = { terre: [], air: [], mer: [], strategique: [] };
    for (const unit of rosterUnits) {
      const countryState = countryStateByUnitId.get(unit.id) ?? null;
      const levels = (rosterLevelsByUnitId.get(unit.id) ?? []).map((l) => ({
        level: l.level,
        manpower: l.manpower,
        hard_power: (l as MilitaryRosterUnitLevel).hard_power ?? 0,
        mobilization_cost: (l as MilitaryRosterUnitLevel).mobilization_cost ?? 100,
        science_required: Number((l as MilitaryRosterUnitLevel).science_required ?? 0),
      }));
      tempRoster[unit.branch].push({ unit, countryState, levels });
    }
    for (const b of ["terre", "air", "mer", "strategique"] as const) {
      tempRoster[b].sort((a, b2) => (a.unit.sort_order ?? 0) - (b2.unit.sort_order ?? 0) || a.unit.name_fr.localeCompare(b2.unit.name_fr));
    }
    foggedRoster = computeFoggedRoster(tempRoster, intelLevel, displaySeed);
  }

  const branches: MilitaryBranch[] = ["terre", "air", "mer", "strategique"];
  const rosterByBranch: Record<MilitaryBranch, RosterRowByBranch[]> = {
    terre: [],
    air: [],
    mer: [],
    strategique: [],
  };
  for (const unit of rosterUnits) {
    const countryState = countryStateByUnitId.get(unit.id) ?? null;
    const levels = (rosterLevelsByUnitId.get(unit.id) ?? []).map((l) => ({
      level: l.level,
      manpower: l.manpower,
      hard_power: (l as MilitaryRosterUnitLevel).hard_power ?? 0,
      mobilization_cost: (l as MilitaryRosterUnitLevel).mobilization_cost ?? 100,
      science_required: Number((l as MilitaryRosterUnitLevel).science_required ?? 0),
    }));
    rosterByBranch[unit.branch].push({ unit, countryState, levels });
  }
  for (const b of branches) {
    rosterByBranch[b].sort(
      (a, b) => (a.unit.sort_order ?? 0) - (b.unit.sort_order ?? 0) || a.unit.name_fr.localeCompare(b.unit.name_fr)
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Arrière-plan ancré sous le menu (h-14) et en haut de l'image pour garder le motif visible */}
      <div className="fixed left-0 right-0 bottom-0 top-14 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 bg-cover bg-no-repeat scale-105"
          style={{
            backgroundImage: "url(/images/site/fiche-pays-bg.png)",
            backgroundPosition: "top center",
            filter: "blur(0.5px)",
          }}
        />
        <div className="absolute inset-0 bg-[var(--background-panel)]/75" />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-10">
        <div
          className="mb-6 inline-block rounded-xl border border-white/25 px-4 py-2"
          style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}
        >
          <Link
            href={backHref}
            className="text-sm text-white/90 hover:text-white transition-colors"
          >
            ← Retour aux nations
          </Link>
        </div>

        <CountryTabs
        country={country}
        macros={macros}
        limits={limits}
        perksDef={perksDef}
        perkCategories={perkCategories}
        activePerkIds={activePerkIds}
        perkEffects={perkEffects}
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
        rosterByBranch={foggedRoster ? { terre: [], air: [], mer: [], strategique: [] } : rosterByBranch}
        intelLevel={intelLevel}
        foggedRoster={foggedRoster}
        countryLawRows={countryLawRows}
        worldDate={ruleParametersByKey.world_date?.value as { month: number; year: number } | undefined}
        influenceResult={influenceResult}
        previousInfluenceValue={previousInfluenceResult?.influence ?? null}
        lastCronInfluenceAfterValue={lastCronInfluenceAfterResult?.influence ?? null}
        hardPowerByBranch={hardPowerByCountry.get(country.id) ?? null}
        ai_status={country.ai_status ?? null}
        aiMajorEffects={aiMajorEffects}
        aiMinorEffects={aiMinorEffects}
        etatMajorFocus={etatMajorFocus}
        sphereData={sphereData}
        ideologySummary={ideologySummary}
        stateActionTypes={stateActionTypes}
        stateActionBalance={stateActionBalance}
        stateActionRequests={stateActionRequests}
        incomingTargetRequests={incomingTargetRequests}
        countriesForTarget={countriesForTarget}
        countriesList={((countriesListRes as { data?: { id: string; name: string }[] })?.data ?? []) as Array<{ id: string; name: string }>}
        emitterCountry={{
          name: country.name ?? "",
          flag_url: country.flag_url ?? null,
          regime: country.regime ?? null,
          influence: Math.round(sphereData.totalInfluence),
        }}
      />
      </div>
    </div>
  );
}
