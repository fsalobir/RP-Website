/**
 * Effets résolus par pays pour le calcul militaire (hard power, brouillage renseignement),
 * alignés sur la fiche pays : lois avec cible, effets pays, global, IA, avantages.
 */

import { getEffectsForCountry, type EffectResolutionContext, type ResolvedEffect } from "@/lib/countryEffects";
import { resolveAllLawEffectsForCountry, type CountryLawRow } from "@/lib/laws";
import { isPerkActive, type PerkWithRequirements } from "@/lib/perkRequirements";
import type { CountryEffect } from "@/types/database";

export type CountryRowForMilitaryEffects = {
  id: string;
  militarism?: number | null;
  industry?: number | null;
  science?: number | null;
  stability?: number | null;
  gdp?: number | null;
  population?: number | null;
  ai_status?: string | null;
};

export type CountryEffectRowLite = {
  country_id: string;
  effect_kind: string;
  effect_target: string | null;
  value: number;
  duration_remaining?: number;
  duration_kind?: string;
};

export type CountryLawRowLite = {
  country_id: string;
  law_key: string;
  score: number;
  target_score?: number;
};

export type PerkDefLite = PerkWithRequirements & {
  name_fr: string;
  perk_effects?: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
};

export type BuildMilitaryResolvedEffectsOptions = {
  countryIds: string[];
  countries: CountryRowForMilitaryEffects[];
  countryEffectsAll: CountryEffectRowLite[];
  countryLawsAll: CountryLawRowLite[];
  ruleParametersByKey: Record<string, { value: unknown }>;
  globalGrowthEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  aiMajorEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  aiMinorEffects: Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  /** Influence affichée (après modificateurs si tu les appliques avant l’appel). */
  influenceByCountry: Map<string, number | null | undefined>;
  perksDef?: PerkDefLite[];
  ideologyEffectsConfig?: Array<{ ideology_id: string; effect_kind: string; effect_target: string | null; value: number }>;
  ideologyScoresByCountryId?: Map<string, Record<string, number> | undefined>;
};

function mapToCountryEffects(rows: CountryEffectRowLite[]): CountryEffect[] {
  return rows.map((e) => ({
    id: "",
    country_id: e.country_id,
    name: "",
    effect_kind: e.effect_kind,
    effect_target: e.effect_target,
    effect_subtype: null,
    value: Number(e.value),
    duration_kind: (e.duration_kind ?? "days") as CountryEffect["duration_kind"],
    duration_remaining: e.duration_remaining ?? 0,
    created_at: "",
    updated_at: "",
  }));
}

/**
 * Map countryId → liste d’effets résolus (même agrégation que l’onglet militaire de la fiche).
 */
export function buildResolvedEffectsByCountryForMilitary(opts: BuildMilitaryResolvedEffectsOptions): Map<string, ResolvedEffect[]> {
  const {
    countryIds,
    countries,
    countryEffectsAll,
    countryLawsAll,
    ruleParametersByKey,
    globalGrowthEffects,
    aiMajorEffects,
    aiMinorEffects,
    influenceByCountry,
    perksDef,
    ideologyEffectsConfig,
    ideologyScoresByCountryId,
  } = opts;

  const countryById = new Map(countries.map((c) => [c.id, c]));
  const effectsByCountry = new Map<string, CountryEffectRowLite[]>();
  for (const r of countryEffectsAll) {
    const list = effectsByCountry.get(r.country_id) ?? [];
    list.push(r);
    effectsByCountry.set(r.country_id, list);
  }
  const lawsByCountry = new Map<string, CountryLawRowLite[]>();
  for (const r of countryLawsAll) {
    const list = lawsByCountry.get(r.country_id) ?? [];
    list.push(r);
    lawsByCountry.set(r.country_id, list);
  }
  const out = new Map<string, ResolvedEffect[]>();

  for (const countryId of countryIds) {
    const c = countryById.get(countryId);
    const rawLaws = lawsByCountry.get(countryId) ?? [];
    const lawRows: CountryLawRow[] = rawLaws.map((l) => ({
      country_id: countryId,
      law_key: l.law_key,
      score: Number(l.score ?? 0),
      target_score: Number(l.target_score ?? l.score ?? 0),
    }));

    const lawLevelEffects = resolveAllLawEffectsForCountry(lawRows, ruleParametersByKey, {
      lawLevelScoreSource: "target",
    });

    const perkEffects: Array<{ effect_kind: string; effect_target: string | null; value: number; sourceLabel: string }> = [];
    if (perksDef?.length) {
      const perkActivationContext = {
        country: {
          militarism: c?.militarism ?? null,
          industry: c?.industry ?? null,
          science: c?.science ?? null,
          stability: c?.stability ?? null,
          gdp: c?.gdp ?? null,
          population: c?.population ?? null,
        },
        influenceValue: influenceByCountry.get(countryId) ?? null,
        countryLawRows: lawRows,
        ruleParametersByKey,
      };
      for (const perk of perksDef) {
        if (!isPerkActive(perk, perkActivationContext) || !perk.perk_effects?.length) continue;
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
    }

    const countryEffectsRows = effectsByCountry.get(countryId) ?? [];
    const countryEffects = mapToCountryEffects(countryEffectsRows);

    const ideologyScores = ideologyScoresByCountryId?.get(countryId);

    const ctx: EffectResolutionContext = {
      countryId,
      countryEffects,
      lawLevelEffects,
      globalGrowthEffects,
      ai_status: c?.ai_status ?? null,
      aiMajorEffects,
      aiMinorEffects,
      perkEffects: perkEffects.length ? perkEffects : undefined,
      ideologyScores: ideologyScores && Object.keys(ideologyScores).length ? ideologyScores : undefined,
      ideologyEffectsConfig:
        ideologyEffectsConfig && ideologyEffectsConfig.length > 0 ? ideologyEffectsConfig : undefined,
    };

    out.set(countryId, getEffectsForCountry(ctx));
  }

  return out;
}
