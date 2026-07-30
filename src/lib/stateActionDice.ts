/**
 * Logique partagée de calcul des jets de dés (succès / impact) pour les actions d'État.
 * Utilisée par rollD100ForAiEvent (admin UI) et par le job Process due pour les events IA auto-acceptés.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getRelation } from "@/lib/relations";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { computeInfluenceForAll } from "@/lib/influence";
import {
  computePowerBalanceModifier,
  computeRelationModifier,
  computeStatModifierBreakdown,
  getPowerBalanceConfig,
} from "@/lib/stateActionModifiers";
import type { DiceRollResult, MilitaryBranch } from "@/types/database";

export type ComputeAiEventDiceRollParams = {
  supabase: SupabaseClient;
  countryId: string;
  actionKey: string;
  paramsSchema: Record<string, unknown>;
  payload: Record<string, unknown>;
  rollType: "success" | "impact";
  adminModifiers?: Array<{ label: string; value: number }>;
};

/**
 * Calcule un jet de dé (succès ou impact) pour un event IA : modificateurs (stats, relations, influence) + tirage aléatoire.
 * Ne modifie pas la base ; le caller met à jour ai_event_requests.dice_results si besoin.
 */
export async function computeAiEventDiceRoll({
  supabase,
  countryId,
  actionKey,
  paramsSchema,
  payload,
  rollType,
  adminModifiers = [],
}: ComputeAiEventDiceRollParams): Promise<{ error?: string; result?: DiceRollResult }> {
  const statBonus = (paramsSchema.stat_bonus ?? {}) as Record<string, boolean>;
  const statBonusEnabled = (key: string) => (statBonus[key] === undefined ? true : !!statBonus[key]);

  let relationModifier = 0;
  let influenceModifier = 0;
  if (actionKey === "prise_influence") {
    const targetCountryId = payload?.target_country_id;
    const amplitudeRel = typeof paramsSchema.amplitude_relations === "number" ? paramsSchema.amplitude_relations : 0;
    if (typeof targetCountryId === "string" && targetCountryId && amplitudeRel !== 0) {
      const relation = await getRelation(supabase, countryId, targetCountryId);
      relationModifier = computeRelationModifier(relation, amplitudeRel);
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
      influenceModifier = computePowerBalanceModifier(ratio, getPowerBalanceConfig(paramsSchema));
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
    // Toujours fournir un objet (même vide) pour permettre des assertions strictes côté tests/UI.
    stat_modifiers: statModifiers,
    admin_modifier: adminSum !== 0 ? adminSum : undefined,
    relation_modifier: relationModifier !== 0 ? relationModifier : undefined,
    influence_modifier: influenceModifier !== 0 ? influenceModifier : undefined,
  };

  return { result };
}
