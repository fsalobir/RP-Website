import { describe, expect, it } from "vitest";
import { getExpectedNextTick } from "@/lib/expectedNextTick";

describe("expectedNextTick", () => {
  it("applies growth rates and clamps stats", () => {
    const country = { population: 1000, gdp: 100, militarism: 10, industry: 0, science: 0, stability: -3 };
    const pcts = {
      // Met tous les ministères au minimum par défaut (5 %) pour éviter les malus automatiques (min_pct=5).
      pct_sante: 5,
      pct_education: 5,
      pct_recherche: 5,
      pct_infrastructure: 5,
      pct_industrie: 5,
      pct_defense: 5,
      pct_interieur: 5,
      pct_affaires_etrangeres: 5,
      pct_procuration_militaire: 5,
    };
    const rulesByKey = {
      global_growth_effects: {
        value: [
          { effect_kind: "population_growth_base", effect_target: null, value: 0.1 }, // +10%
          { effect_kind: "gdp_growth_base", effect_target: null, value: 0.2 }, // +20%
        ],
      },
      // budget_* not needed for this test; defaults are used when missing
    } as any;
    const worldAvgs = { pop_avg: 1000, gdp_avg: 100, mil_avg: 5, ind_avg: 5, sci_avg: 5, stab_avg: 0 };
    const effects = [
      { effect_kind: "stat_delta", effect_target: "militarism", value: 5, duration_kind: "days", duration_remaining: 1 },
      { effect_kind: "stat_delta", effect_target: "stability", value: 10, duration_kind: "days", duration_remaining: 1 },
    ];

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, effects as any);
    expect(out.population).toBe(1100);
    expect(out.gdp).toBeCloseTo(120);
    // militarism capped at 10
    expect(out.militarism).toBe(10);
    // stability capped at 3
    expect(out.stability).toBe(3);
  });

  it("ignores inactive effects by duration_remaining<=0 unless permanent", () => {
    const country = { population: 1000, gdp: 100, militarism: 5, industry: 5, science: 5, stability: 0 };
    const pcts = {
      pct_sante: 5,
      pct_education: 5,
      pct_recherche: 5,
      pct_infrastructure: 5,
      pct_industrie: 5,
      pct_defense: 5,
      pct_interieur: 5,
      pct_affaires_etrangeres: 5,
      pct_procuration_militaire: 5,
    };
    const rulesByKey = { global_growth_effects: { value: [] } } as any;
    const worldAvgs = { pop_avg: 1000, gdp_avg: 100, mil_avg: 5, ind_avg: 5, sci_avg: 5, stab_avg: 0 };
    const effects = [
      { effect_kind: "gdp_growth_base", effect_target: null, value: 0.5, duration_kind: "days", duration_remaining: 0 },
      { effect_kind: "gdp_growth_base", effect_target: null, value: 0.1, duration_kind: "permanent", duration_remaining: 0 },
    ];

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, effects as any);
    expect(out.gdp).toBeCloseTo(110);
  });
});

