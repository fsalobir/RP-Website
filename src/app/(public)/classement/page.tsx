import { createClient } from "@/lib/supabase/server";
import { ClassementContent } from "@/components/classement/ClassementContent";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { buildResolvedEffectsByCountryForMilitary } from "@/lib/militaryResolvedEffects";
import { computeInfluenceForAll, applyInfluenceModifiers } from "@/lib/influence";
import { getInfluenceModifiersByCountry } from "@/lib/countryEffects";
import { getEffectiveSpherePct, type SphereInfluencePct } from "@/lib/ideology";
import type { MilitaryBranch } from "@/types/database";

export const revalidate = 3600;

function normId(id: string | null | undefined): string {
  return String(id ?? "").trim().toLowerCase();
}

export default async function ClassementPage() {
  const supabase = await createClient();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);
  const countryHistoryCutoff = cutoffDate.toISOString().slice(0, 10);
  const [countriesResult, historyResult, rulesRes, rosterUnitsRes, rosterLevelsRes, countryMilitaryRes, effectsRes, lawsRes, controlRes] = await Promise.all([
    supabase
      .from("countries")
      .select("id, name, slug, flag_url, population, gdp, militarism, industry, science, stability, ai_status")
      .order("name"),
    supabase
      .from("country_history")
      .select("country_id, date, population, gdp, militarism, industry, science, stability")
      .gte("date", countryHistoryCutoff)
      .order("date", { ascending: false }),
    supabase.from("rule_parameters").select("key, value").in("key", [
      "influence_config", "sphere_influence_pct", "global_growth_effects",
      "mobilisation_config", "mobilisation_level_effects",
      "law_auto_industry_config", "law_auto_industry_level_effects",
      "law_air_industry_config", "law_air_industry_level_effects",
      "law_naval_industry_config", "law_naval_industry_level_effects",
      "law_research_config", "law_research_level_effects",
      "ai_major_effects", "ai_minor_effects", "ideology_effects",
    ]),
    supabase.from("military_roster_units").select("id, branch, base_count, sub_type"),
    supabase.from("military_roster_unit_levels").select("unit_id, level, hard_power"),
    supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
    supabase.from("country_effects").select("country_id, effect_kind, effect_target, value, duration_remaining, duration_kind").or("duration_remaining.gt.0,duration_kind.eq.permanent"),
    supabase.from("country_laws").select("country_id, law_key, score, target_score"),
    supabase.from("country_control").select("country_id, controller_country_id, share_pct, is_annexed"),
  ]);

  const { data: countries } = countriesResult;
  const { data: historyRows, error: historyError } = historyResult;
  const rulesByKey = Object.fromEntries((rulesRes.data ?? []).map((r) => [r.key, r.value]));
  const ruleParametersByKey: Record<string, { value: unknown }> = {};
  for (const r of rulesRes.data ?? []) ruleParametersByKey[r.key] = { value: r.value };
  const influenceConfig = rulesByKey.influence_config as Record<string, unknown> | undefined;
  const globalGrowthEffects = (Array.isArray(rulesByKey.global_growth_effects) ? rulesByKey.global_growth_effects : []) as Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  const rosterUnits = (rosterUnitsRes.data ?? []) as Array<{ id: string; branch: MilitaryBranch; base_count: number }>;
  const rosterLevels = (rosterLevelsRes.data ?? []) as Array<{ unit_id: string; level: number; hard_power: number }>;
  const countryMilitaryUnits = (countryMilitaryRes.data ?? []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>;
  const countryEffectsRows = (effectsRes.data ?? []) as Array<{
    country_id: string;
    effect_kind: string;
    effect_target: string | null;
    value: number;
    duration_remaining?: number;
    duration_kind?: string;
  }>;
  const countryLawRows = (lawsRes.data ?? []) as Array<{
    country_id: string;
    law_key: string;
    score: number;
    target_score: number;
  }>;

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

  const rosterUnitsForHp = (rosterUnits as Array<{ id: string; branch: MilitaryBranch; base_count: number; sub_type?: string | null }>).map(
    (u) => ({
      id: u.id,
      branch: u.branch,
      base_count: u.base_count ?? 0,
      sub_type: u.sub_type ?? null,
    })
  );
  const aiMajorEffects = (Array.isArray(rulesByKey.ai_major_effects) ? rulesByKey.ai_major_effects : []) as Array<{
    effect_kind: string;
    effect_target: string | null;
    value: number;
  }>;
  const aiMinorEffects = (Array.isArray(rulesByKey.ai_minor_effects) ? rulesByKey.ai_minor_effects : []) as Array<{
    effect_kind: string;
    effect_target: string | null;
    value: number;
  }>;
  const ideologyEffectsConfig = (Array.isArray(rulesByKey.ideology_effects) ? rulesByKey.ideology_effects : []) as Array<{
    ideology_id: string;
    effect_kind: string;
    effect_target: string | null;
    value: number;
  }>;
  const hardPowerByCountryPreEffects = computeHardPowerByCountry(countryMilitaryUnits, rosterUnitsForHp, rosterLevels);
  const { byCountry: influenceByCountryRaw } = computeInfluenceForAll(
    countries ?? [],
    hardPowerByCountryPreEffects,
    (influenceConfig ?? {}) as Parameters<typeof computeInfluenceForAll>[2]
  );
  const countryIds = (countries ?? []).map((c) => c.id);
  const influenceModifiersByCountry = getInfluenceModifiersByCountry(
    countryIds,
    countryEffectsRows,
    countryLawRows,
    ruleParametersByKey,
    globalGrowthEffects
  );
  const influenceByCountryPass1 = new Map(
    countryIds.map((id) => {
      const raw = influenceByCountryRaw.get(id);
      const mods = influenceModifiersByCountry.get(id);
      if (!raw) return [id, null] as const;
      const result = mods ? applyInfluenceModifiers(raw, mods) : raw;
      return [id, result] as const;
    })
  );
  const influenceForMilitary = new Map<string, number | null>(
    countryIds.map((id) => [id, influenceByCountryPass1.get(id)?.influence ?? null])
  );
  const listCountries = countries ?? [];
  const militaryEffectsByCountry = buildResolvedEffectsByCountryForMilitary({
    countryIds,
    countries: listCountries.map((c) => ({
      id: c.id,
      militarism: c.militarism ?? null,
      industry: c.industry ?? null,
      science: c.science ?? null,
      stability: c.stability ?? null,
      gdp: c.gdp ?? null,
      population: c.population ?? null,
      ai_status: (c as { ai_status?: string | null }).ai_status ?? null,
    })),
    countryEffectsAll: countryEffectsRows,
    countryLawsAll: countryLawRows,
    ruleParametersByKey,
    globalGrowthEffects,
    aiMajorEffects,
    aiMinorEffects,
    influenceByCountry: influenceForMilitary,
    ideologyEffectsConfig: ideologyEffectsConfig.length > 0 ? ideologyEffectsConfig : undefined,
  });
  const hardPowerByCountry = computeHardPowerByCountry(
    countryMilitaryUnits,
    rosterUnitsForHp,
    rosterLevels,
    militaryEffectsByCountry
  );

  const { byCountry: influenceByCountryRawFinal } = computeInfluenceForAll(
    countries ?? [],
    hardPowerByCountry,
    (influenceConfig ?? {}) as Parameters<typeof computeInfluenceForAll>[2]
  );
  const influenceByCountry = new Map(
    countryIds.map((id) => {
      const raw = influenceByCountryRawFinal.get(id);
      const mods = influenceModifiersByCountry.get(id);
      if (!raw) return [id, null] as const;
      const result = mods ? applyInfluenceModifiers(raw, mods) : raw;
      return [id, result] as const;
    })
  );

  const controlRows = (controlRes.data ?? []) as Array<{ country_id: string; controller_country_id: string; share_pct: number; is_annexed: boolean }>;
  const sphereInfluencePct = rulesByKey.sphere_influence_pct as SphereInfluencePct | undefined;
  const sphereInfluenceBonusByController = new Map<string, number>();
  for (const r of controlRows) {
    const controllerId = r.controller_country_id;
    const targetInfluence = influenceByCountry.get(r.country_id)?.influence ?? 0;
    const controlRow = { country_id: r.country_id, controller_country_id: controllerId, share_pct: Number(r.share_pct ?? 0), is_annexed: !!r.is_annexed };
    const effectivePct = getEffectiveSpherePct(controlRow, sphereInfluencePct);
    const influenceGiven = targetInfluence * (controlRow.share_pct / 100) * (effectivePct / 100);
    const prev = sphereInfluenceBonusByController.get(controllerId) ?? 0;
    sphereInfluenceBonusByController.set(controllerId, prev + influenceGiven);
  }

  const rows =
    countries?.map((c) => {
      const hp = hardPowerByCountry.get(c.id) ?? { terre: 0, air: 0, mer: 0, strategique: 0, total: 0 };
      const baseInfluence = influenceByCountry.get(c.id)?.influence ?? null;
      const sphereBonus = sphereInfluenceBonusByController.get(c.id) ?? 0;
      const totalInfluence = baseInfluence != null ? Math.round(baseInfluence + sphereBonus) : null;
      return {
        country: c,
        prev: latestByCountry.get(normId(c.id)) ?? null,
        influence: totalInfluence,
        hard_power_terre: hp.terre,
        hard_power_air: hp.air,
        hard_power_mer: hp.mer,
        hard_power_strategique: hp.strategique,
        hard_power_total: hp.total,
      };
    }) ?? [];

  return (
    <div className="relative w-full px-4 py-10">
      {/* Arrière-plan fixe (parallaxe) : taille viewport, reste visible au scroll */}
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ left: "50%", marginLeft: "-50vw", width: "100vw", zIndex: 0 }}
        aria-hidden
      >
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{
            backgroundImage: "url(/images/site/classement-bg.png)",
            filter: "blur(0.5px)",
          }}
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>
      <div className="relative z-10 max-w-6xl mx-auto" style={{ isolation: "isolate" }}>
        <ClassementContent rows={rows} />
      </div>
    </div>
  );
}
