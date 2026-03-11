import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getRelation } from "./relations.ts";
import { computeHardPowerByCountry } from "./hardPower.ts";
import { computeInfluenceForAll } from "./influence.ts";
import type { DiceRollResult, MilitaryBranch } from "./types.ts";

const STAT_RANGES: Record<string, { min: number; max: number }> = {
  militarism: { min: 0, max: 10 },
  industry: { min: 0, max: 10 },
  science: { min: 0, max: 10 },
  stability: { min: -3, max: 3 },
};

function computeStatModifierBreakdown(
  rangesConfig: Record<string, { min: number; max: number }>,
  stats: Record<string, number>
): { total: number; byStat: Record<string, number> } {
  const byStat: Record<string, number> = {};
  let total = 0;
  for (const [statKey, range] of Object.entries(rangesConfig)) {
    const statRange = STAT_RANGES[statKey];
    if (!statRange) continue;
    const value = stats[statKey] ?? statRange.min;
    const t = (value - statRange.min) / (statRange.max - statRange.min || 1);
    const modifier = Math.round(range.min + t * (range.max - range.min));
    byStat[statKey] = modifier;
    total += modifier;
  }
  return { total, byStat };
}

export async function computeAiEventDiceRoll({
  supabase,
  countryId,
  actionKey,
  paramsSchema,
  payload,
  rollType,
  adminModifiers = [],
}: {
  supabase: SupabaseClient;
  countryId: string;
  actionKey: string;
  paramsSchema: Record<string, unknown>;
  payload: Record<string, unknown>;
  rollType: "success" | "impact";
  adminModifiers?: Array<{ label: string; value: number }>;
}): Promise<{ error?: string; result?: DiceRollResult }> {
  const statBonus = (paramsSchema.stat_bonus ?? {}) as Record<string, boolean>;
  const statBonusEnabled = (key: string) => (statBonus[key] === undefined ? true : !!statBonus[key]);

  let relationModifier = 0;
  let influenceModifier = 0;
  if (actionKey === "prise_influence") {
    const targetCountryId = payload?.target_country_id;
    const amplitudeRel = typeof paramsSchema.amplitude_relations === "number" ? paramsSchema.amplitude_relations : 0;
    if (typeof targetCountryId === "string" && targetCountryId && amplitudeRel !== 0) {
      const relation = await getRelation(supabase, countryId, targetCountryId);
      relationModifier = Math.round((relation / 100) * amplitudeRel);
    }
    if (typeof targetCountryId === "string" && targetCountryId) {
      const [countriesRes, cmuRes, rosterRes, levelsRes, influenceConfigRes] = await Promise.all([
        supabase.from("countries").select("id, population, gdp, stability"),
        supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
        supabase.from("military_roster_units").select("id, branch, base_count").order("name_fr"),
        supabase.from("military_roster_unit_levels").select("unit_id, level, hard_power").order("unit_id").order("level"),
        supabase.from("rule_parameters").select("value").eq("key", "influence_config").maybeSingle(),
      ]);
      const countries = (countriesRes.data ?? []) as Array<{ id: string; population: number; gdp: number; stability: number }>;
      const rosterUnits = (rosterRes.data ?? []) as Array<{ id: string; branch: MilitaryBranch; base_count: number }>;
      const rosterLevels = (levelsRes.data ?? []) as Array<{ unit_id: string; level: number; hard_power: number }>;
      const influenceConfig = (influenceConfigRes.data?.value ?? {}) as Parameters<typeof computeInfluenceForAll>[2];
      const hardPowerByCountry = computeHardPowerByCountry(
        (cmuRes.data ?? []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>,
        rosterUnits,
        rosterLevels
      );
      const { byCountry: influenceByCountry } = computeInfluenceForAll(countries, hardPowerByCountry, influenceConfig);
      const emitterInfluence = influenceByCountry.get(countryId)?.influence ?? 0;
      const targetInfluence = influenceByCountry.get(targetCountryId)?.influence ?? 0;
      const ratio = targetInfluence > 0 ? emitterInfluence / targetInfluence : 0;
      const eq = (paramsSchema.equilibre_des_forces ?? {}) as Record<string, number>;
      const ratioEquilibre = typeof eq.ratio_equilibre === "number" ? eq.ratio_equilibre : 1;
      const malusMax = typeof eq.malus_max === "number" ? eq.malus_max : 20;
      const bonusMax = typeof eq.bonus_max === "number" ? eq.bonus_max : 20;
      const ratioMin = typeof eq.ratio_min === "number" ? eq.ratio_min : 0.5;
      const ratioMax = typeof eq.ratio_max === "number" ? eq.ratio_max : 2;
      if (ratio <= ratioMin) influenceModifier = -malusMax;
      else if (ratio < ratioEquilibre) {
        influenceModifier = Math.round((-malusMax * (ratioEquilibre - ratio)) / (ratioEquilibre - ratioMin));
      } else if (ratio > ratioEquilibre) {
        if (ratio >= ratioMax) influenceModifier = bonusMax;
        else influenceModifier = Math.round((bonusMax * (ratio - ratioEquilibre)) / (ratioMax - ratioEquilibre));
      }
    }
  }

  const { data: country } = await supabase
    .from("countries")
    .select("militarism, industry, science, stability")
    .eq("id", countryId)
    .single();

  const stats = country
    ? {
        militarism: Number(country.militarism ?? 0),
        industry: Number(country.industry ?? 0),
        science: Number(country.science ?? 0),
        stability: Number(country.stability ?? 0),
      }
    : { militarism: 0, industry: 0, science: 0, stability: 0 };

  const { data: rangesRow } = await supabase
    .from("rule_parameters")
    .select("value")
    .eq("key", "stats_dice_modifier_ranges")
    .maybeSingle();

  const fullRangesConfig = (rangesRow?.value as Record<string, { min: number; max: number }>) ?? {};
  const rangesConfig: Record<string, { min: number; max: number }> = {};
  for (const key of Object.keys(fullRangesConfig)) {
    if (statBonusEnabled(key)) rangesConfig[key] = fullRangesConfig[key];
  }
  const { total: statModifier, byStat: statModifiers } = computeStatModifierBreakdown(rangesConfig, stats);
  const adminSum = adminModifiers.reduce((s, m) => s + m.value, 0);
  const totalModifier = statModifier + adminSum + relationModifier + influenceModifier;

  const roll = Math.floor(Math.random() * 100) + 1;
  const total = Math.max(1, Math.min(100, roll + totalModifier));

  const result: DiceRollResult = {
    roll,
    modifier: totalModifier,
    total,
    stat_modifiers: Object.keys(statModifiers).length > 0 ? statModifiers : undefined,
    admin_modifier: adminSum !== 0 ? adminSum : undefined,
    relation_modifier: relationModifier !== 0 ? relationModifier : undefined,
    influence_modifier: influenceModifier !== 0 ? influenceModifier : undefined,
  };
  return { result };
}
