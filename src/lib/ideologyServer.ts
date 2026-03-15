import type { SupabaseClient } from "@supabase/supabase-js";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { computeInfluenceForAll } from "@/lib/influence";
import {
  buildNeighborIdsByCountry,
  computeWorldIdeologies,
  createZeroScores,
  getIdeologyConfig,
  getIdeologyEffectTotals,
  ideologyColumnName,
  IDEOLOGY_IDS,
  relationKey,
  type IdeologyCountryInput,
  type IdeologyCountryResult,
  type IdeologyEffectTotals,
} from "@/lib/ideology";
import { IDEOLOGY_EFFECT_KIND_IDS } from "@/lib/countryEffects";
import type { MilitaryBranch } from "@/types/database";

type WorldIdeologyState = {
  countries: IdeologyCountryInput[];
  ideologyByCountry: Map<string, IdeologyCountryResult>;
  playerCountryIds: Set<string>;
  influenceByCountry: Map<string, number>;
};

export async function fetchWorldIdeologyState(supabase: SupabaseClient): Promise<WorldIdeologyState> {
  const [
    countriesRes,
    countryPlayersRes,
    mapRegionCountriesRes,
    mapRegionNeighborsRes,
    relationsRes,
    controlRes,
    effectsRes,
    rulesRes,
    rosterUnitsRes,
    rosterLevelsRes,
    countryMilitaryRes,
  ] = await Promise.all([
    supabase
      .from("countries")
      .select("id, name, slug, flag_url, regime, militarism, industry, science, stability, population, gdp, ai_status, ideology_germanic_monarchy, ideology_merina_monarchy, ideology_french_republicanism, ideology_mughal_republicanism, ideology_nilotique_cultism, ideology_satoiste_cultism"),
    supabase.from("country_players").select("country_id"),
    supabase.from("map_region_countries").select("region_id, country_id"),
    supabase.from("map_region_neighbors").select("region_a_id, region_b_id"),
    supabase.from("country_relations").select("country_a_id, country_b_id, value"),
    supabase.from("country_control").select("country_id, controller_country_id, share_pct, is_annexed"),
    supabase
      .from("country_effects")
      .select("country_id, effect_kind, value, duration_kind, duration_remaining")
      .in("effect_kind", IDEOLOGY_EFFECT_KIND_IDS)
      .or("duration_remaining.gt.0,duration_kind.eq.permanent"),
    supabase.from("rule_parameters").select("key, value").in("key", ["ideology_config", "influence_config", "sphere_influence_pct"]),
    supabase.from("military_roster_units").select("id, branch, base_count"),
    supabase.from("military_roster_unit_levels").select("unit_id, level, hard_power"),
    supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
  ]);

  if (countriesRes.error) throw countriesRes.error;
  if (countryPlayersRes.error) throw countryPlayersRes.error;
  if (mapRegionCountriesRes.error) throw mapRegionCountriesRes.error;
  if (mapRegionNeighborsRes.error) throw mapRegionNeighborsRes.error;
  if (relationsRes.error) throw relationsRes.error;
  if (controlRes.error) throw controlRes.error;
  if (effectsRes.error) throw effectsRes.error;
  if (rulesRes.error) throw rulesRes.error;
  if (rosterUnitsRes.error) throw rosterUnitsRes.error;
  if (rosterLevelsRes.error) throw rosterLevelsRes.error;
  if (countryMilitaryRes.error) throw countryMilitaryRes.error;

  const countries = (countriesRes.data ?? []) as IdeologyCountryInput[];
  const playerCountryIds = new Set((countryPlayersRes.data ?? []).map((row) => row.country_id));
  const relationMap = new Map<string, number>();
  for (const relation of relationsRes.data ?? []) {
    relationMap.set(relationKey(relation.country_a_id, relation.country_b_id), Number(relation.value ?? 0));
  }

  const effectsByCountry = new Map<string, IdeologyEffectTotals>();
  for (const effect of effectsRes.data ?? []) {
    const list = effectsByCountry.get(effect.country_id) ?? { drift: createZeroScores(), snap: createZeroScores() };
    const next = getIdeologyEffectTotals([
      {
        effect_kind: effect.effect_kind,
        value: Number(effect.value ?? 0),
        duration_kind: effect.duration_kind ?? undefined,
        duration_remaining: effect.duration_remaining ?? undefined,
      },
    ]);
    const drift = { ...list.drift };
    const snap = { ...list.snap };
    for (const id of IDEOLOGY_IDS) {
      drift[id] = list.drift[id] + next.drift[id];
      snap[id] = list.snap[id] + next.snap[id];
    }
    effectsByCountry.set(effect.country_id, { drift, snap });
  }

  const rulesByKey = Object.fromEntries((rulesRes.data ?? []).map((row) => [row.key, row.value]));
  const ideologyConfig = getIdeologyConfig(rulesByKey.ideology_config);
  const influenceConfig = (rulesByKey.influence_config ?? {}) as Parameters<typeof computeInfluenceForAll>[2];
  const rawSphere = rulesByKey.sphere_influence_pct;
  const sphereInfluencePct =
    rawSphere && typeof rawSphere === "object" && !Array.isArray(rawSphere)
      ? (rawSphere as { contested?: number; occupied?: number; annexed?: number })
      : undefined;
  const hardPowerByCountry = computeHardPowerByCountry(
    (countryMilitaryRes.data ?? []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>,
    (rosterUnitsRes.data ?? []) as Array<{ id: string; branch: MilitaryBranch; base_count: number }>,
    (rosterLevelsRes.data ?? []) as Array<{ unit_id: string; level: number; hard_power: number }>
  );
  const { byCountry: influenceByCountry } = computeInfluenceForAll(countries as Array<{ id: string; population: number; gdp: number; stability: number }>, hardPowerByCountry, influenceConfig);
  const neighborIdsByCountry = buildNeighborIdsByCountry(
    (mapRegionCountriesRes.data ?? []) as Array<{ region_id: string; country_id: string }>,
    (mapRegionNeighborsRes.data ?? []) as Array<{ region_a_id: string; region_b_id: string }>
  );

  const ideologyByCountry = computeWorldIdeologies({
    countries,
    config: ideologyConfig,
    relationMap,
    influenceByCountry: new Map(
      countries.map((country) => [country.id, influenceByCountry.get(country.id)?.influence ?? 0])
    ),
    neighborIdsByCountry,
    controlRows: (controlRes.data ?? []) as Array<{ country_id: string; controller_country_id: string; share_pct: number; is_annexed: boolean }>,
    effectsByCountry,
    sphereInfluencePct,
  });

  return {
    countries,
    ideologyByCountry,
    playerCountryIds,
    influenceByCountry: new Map(
      countries.map((country) => [country.id, influenceByCountry.get(country.id)?.influence ?? 0])
    ),
  };
}

export async function persistWorldIdeologies(supabase: SupabaseClient): Promise<void> {
  const { ideologyByCountry } = await fetchWorldIdeologyState(supabase);
  for (const [countryId, ideology] of ideologyByCountry.entries()) {
    const breakdown = {
      dominant: ideology.dominant,
      center_distance: ideology.centerDistance,
      neighbors: ideology.breakdown.neighbors,
      neighbor_contributors: ideology.breakdown.neighborContributors,
      effects: ideology.breakdown.effects,
    };
    const updatePayload: Record<string, number | object> = { ideology_breakdown: breakdown };
    for (const id of IDEOLOGY_IDS) {
      updatePayload[ideologyColumnName(id)] = Number(ideology.scores[id].toFixed(4));
      updatePayload[ideologyColumnName(id, "ideology_drift")] = Number(ideology.drift[id].toFixed(4));
    }
    const { error } = await supabase.from("countries").update(updatePayload).eq("id", countryId);
    if (error) throw error;
  }
}
