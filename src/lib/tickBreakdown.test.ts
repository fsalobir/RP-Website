import { describe, expect, it } from "vitest";
import { getTickBreakdown } from "@/lib/tickBreakdown";

describe("tickBreakdown", () => {
  it("produces constraints from resolved effects and expectedNextTick totals", () => {
    const country = { population: 1000, gdp: 100, militarism: 5, industry: 5, science: 5, stability: 0 };
    const pcts = {
      pct_sante: 0,
      pct_education: 0,
      pct_recherche: 0,
      pct_infrastructure: 0,
      pct_industrie: 0,
      pct_defense: 0,
      pct_interieur: 0,
      pct_affaires_etrangeres: 0,
      pct_procuration_militaire: 0,
    };
    const rulesByKey = { global_growth_effects: { value: [] } } as any;
    const worldAvgs = { pop_avg: 1000, gdp_avg: 100, mil_avg: 5, ind_avg: 5, sci_avg: 5, stab_avg: 0 };

    const context = {
      countryEffects: [
        // forced min for defense
        {
          id: "e1",
          country_id: "c1",
          name: "Min défense",
          effect_kind: "budget_ministry_min_pct",
          effect_target: "budget_defense",
          effect_subtype: null,
          value: 12,
          duration_kind: "days",
          duration_remaining: 10,
          created_at: "",
          updated_at: "",
        },
      ],
      lawLevelEffects: [],
      globalGrowthEffects: [{ effect_kind: "budget_allocation_cap", effect_target: null, value: 10 }],
    };

    const { breakdown, expected } = getTickBreakdown(
      country as any,
      pcts as any,
      rulesByKey,
      worldAvgs as any,
      context as any,
      { rosterUnitsForExtra: [{ id: "u1", name_fr: "Char" }] }
    );

    expect(expected).toBeTruthy();
    expect(breakdown.constraints.allocationCapPercent).toBe(110);
    expect(breakdown.constraints.forcedMinPcts).toEqual([{ label: "Ministère de la Défense", value: 12 }]);
    // unitExtras should exist even if 0
    expect(breakdown.constraints.unitExtras).toEqual([{ unitLabel: "Char", extra: 0 }]);
  });
});

