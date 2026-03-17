import { describe, expect, it } from "vitest";
import {
  getAllocationCapPercent,
  getEffectsForCountry,
  getEffectsForCountryTickRates,
  getForcedMinPcts,
  getInfluenceModifiersFromEffects,
  getSubTypeLimitModifierPercent,
} from "@/lib/countryEffects";

describe("PLAN_SCENARIOS_TEST — Section 2 (Effets)", () => {
  it("Scénario 2.1 — getEffectsForCountry agrège country+law+global+perk+ai+ideology (6 effets)", () => {
    const ctx = {
      countryId: "c1",
      countryEffects: [
        {
          id: "e1",
          country_id: "c1",
          name: "Test country effect",
          effect_kind: "stat_delta",
          effect_target: "militarism",
          effect_subtype: null,
          value: 1,
          duration_kind: "days",
          duration_remaining: 1,
          created_at: "",
          updated_at: "",
        },
      ],
      lawLevelEffects: [{ effect_kind: "gdp_growth_base", effect_target: null, value: 0.01 }],
      globalGrowthEffects: [{ effect_kind: "population_growth_base", effect_target: null, value: 0.02 }],
      perkEffects: [{ effect_kind: "budget_allocation_cap", effect_target: null, value: 10, sourceLabel: "Avantage : X" }],
      ai_status: "major",
      aiMajorEffects: [{ effect_kind: "influence_modifier_global", effect_target: null, value: 1.1 }],
      ideologyScores: { satoiste_cultism: 100 },
      ideologyEffectsConfig: [
        // À 100%, doit produire un effet non nul.
        { ideology_id: "satoiste_cultism", effect_kind: "budget_allocation_cap", effect_target: null, value: 3 },
      ],
    } as any;

    const effects = getEffectsForCountry(ctx);
    expect(effects).toHaveLength(6);

    const sources = effects.map((e: any) => e.source).sort();
    expect(sources).toEqual(["ai", "country", "global", "ideology", "law", "perk"].sort());

    const sourceLabels = effects.map((e: any) => e.sourceLabel);
    expect(sourceLabels).toEqual(
      expect.arrayContaining([
        "Test country effect",
        "Loi",
        "Global",
        "Avantage : X",
        "IA",
        "Cultisme Satoiste",
      ])
    );
  });

  it("Scénario 2.2 — getEffectsForCountryTickRates inclut country (+0.10) et exclut globalGrowthEffects", () => {
    const ctx = {
      countryId: "c1",
      countryEffects: [
        {
          id: "e1",
          country_id: "c1",
          name: "Country GDP",
          effect_kind: "gdp_growth_base",
          effect_target: null,
          effect_subtype: null,
          value: 0.1,
          duration_kind: "days",
          duration_remaining: 1,
          created_at: "",
          updated_at: "",
        },
      ],
      lawLevelEffects: [],
      globalGrowthEffects: [{ effect_kind: "gdp_growth_base", effect_target: null, value: 0.05 }],
    } as any;

    const tickEffects = getEffectsForCountryTickRates(ctx);
    expect(tickEffects).toHaveLength(1);
    expect(tickEffects[0]).toMatchObject({
      effect_kind: "gdp_growth_base",
      value: 0.1,
      source: "country",
    });
  });

  it("Scénario 2.4 — getForcedMinPcts : max par ministère et clamp >=0", () => {
    const out = getForcedMinPcts([
      { effect_kind: "budget_ministry_min_pct", effect_target: "budget_education", value: 10 },
      { effect_kind: "budget_ministry_min_pct", effect_target: "budget_education", value: 15 },
      { effect_kind: "budget_ministry_min_pct", effect_target: "budget_defense", value: -5 },
    ]);
    expect(out.pct_education).toBe(15);
    expect(out.pct_defense).toBe(0);
  });

  it("Scénario 2.5 — getAllocationCapPercent : somme", () => {
    expect(
      getAllocationCapPercent([
        { effect_kind: "budget_allocation_cap", value: 10 },
        { effect_kind: "budget_allocation_cap", value: -25 },
      ])
    ).toBe(85);
  });

  it("Scénario 2.6 — getSubTypeLimitModifierPercent : somme sur clé branch:sub_type", () => {
    const effects = [
      {
        effect_kind: "military_unit_limit_modifier_sub_type",
        effect_target: "terre:infanterie",
        value: 10,
        duration_kind: "permanent",
        duration_remaining: 0,
      },
      {
        effect_kind: "military_unit_limit_modifier_sub_type",
        effect_target: "terre:infanterie",
        value: -2,
        duration_kind: "permanent",
        duration_remaining: 0,
      },
    ];
    expect(getSubTypeLimitModifierPercent(effects as any, "terre", "infanterie")).toBe(8);
  });

  it("Scénario 2.7 — getInfluenceModifiersFromEffects : produit et ignore inactifs", () => {
    const effects = [
      { effect_kind: "influence_modifier_global", value: 1.1, duration_kind: "days", duration_remaining: 1 },
      { effect_kind: "influence_modifier_gdp", value: 1.2, duration_kind: "days", duration_remaining: 1 },
      { effect_kind: "influence_modifier_gdp", value: 2.0, duration_kind: "days", duration_remaining: 0 },
    ];
    const isActive = (e: { duration_remaining?: number; duration_kind?: string }) =>
      e.duration_kind === "permanent" || (e.duration_remaining ?? 0) > 0;

    const mods = getInfluenceModifiersFromEffects(effects as any, isActive);
    expect(mods).toEqual({ global: 1.1, gdp: 1.2, population: 1, hard_power: 1 });
  });
});

