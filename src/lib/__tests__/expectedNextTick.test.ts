import { describe, expect, it } from "vitest";
import { getExpectedNextTick } from "@/lib/expectedNextTick";

function makeNeutralPcts(): Record<string, number> {
  // Pour éviter les malus budget par défaut (min_pct=5), on met tout à 5%.
  return {
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
}

describe("PLAN_SCENARIOS_TEST — Section 1 (Croissance globale)", () => {
  it("Scénario 1.1 — Croissance globale (base uniquement)", () => {
    const country = {
      population: 1_000,
      gdp: 100,
      militarism: 0,
      industry: 0,
      science: 0,
      stability: 0,
    };

    const rulesByKey = {
      global_growth_effects: {
        value: [
          { effect_kind: "population_growth_base", effect_target: null, value: 0.1 },
          { effect_kind: "gdp_growth_base", effect_target: null, value: 0.2 },
        ],
      },
    } as any;

    const worldAvgs = { pop_avg: 0, gdp_avg: 0, mil_avg: 0, ind_avg: 0, sci_avg: 0, stab_avg: 0 };

    const out = getExpectedNextTick(country as any, makeNeutralPcts() as any, rulesByKey, worldAvgs as any, [] as any);
    expect(out.population).toBe(1100);
    expect(out.gdp).toBe(120);
    expect(out.inputs.pop_total_rate).toBe(0.1);
    expect(out.inputs.gdp_total_rate).toBe(0.2);
  });

  it("Scénario 1.2 — Croissance globale “par stat” (stability négative)", () => {
    const country = {
      population: 0,
      gdp: 100,
      militarism: 0,
      industry: 0,
      science: 0,
      stability: -2,
    };

    const rulesByKey = {
      global_growth_effects: {
        value: [{ effect_kind: "gdp_growth_per_stat", effect_target: "stability", value: 0.01 }],
      },
    } as any;

    const worldAvgs = { pop_avg: 0, gdp_avg: 0, mil_avg: 0, ind_avg: 0, sci_avg: 0, stab_avg: 0 };

    const out = getExpectedNextTick(country as any, makeNeutralPcts() as any, rulesByKey, worldAvgs as any, [] as any);
    expect(out.gdp).toBe(98);
    expect(out.inputs.gdp_from_stats).toBe(-0.02);
    expect(out.inputs.gdp_total_rate).toBe(-0.02);
  });

  it("Scénario 1.3 — Somme multi-effets base + per_stat", () => {
    const country = {
      population: 0,
      gdp: 1_000,
      militarism: 0,
      industry: 6,
      science: 0,
      stability: 0,
    };

    const rulesByKey = {
      global_growth_effects: {
        value: [
          { effect_kind: "gdp_growth_base", effect_target: null, value: 0.01 },
          { effect_kind: "gdp_growth_per_stat", effect_target: "industry", value: 0.002 },
        ],
      },
    } as any;

    const worldAvgs = { pop_avg: 0, gdp_avg: 0, mil_avg: 0, ind_avg: 0, sci_avg: 0, stab_avg: 0 };

    const out = getExpectedNextTick(country as any, makeNeutralPcts() as any, rulesByKey, worldAvgs as any, [] as any);
    expect(out.inputs.gdp_base).toBe(0.01);
    expect(out.inputs.gdp_from_stats).toBe(0.012);
    expect(out.inputs.gdp_total_rate).toBe(0.022);
    expect(out.gdp).toBe(1022);
  });
});

describe("PLAN_SCENARIOS_TEST — Section 2.3 (Expiration d'effets dans expectedNextTick)", () => {
  it("Scénario 2.3 — Expiration : ignore duration_remaining<=0 sauf permanent", () => {
    const country = { population: 0, gdp: 100, militarism: 0, industry: 0, science: 0, stability: 0 };
    const rulesByKey = { global_growth_effects: { value: [] } } as any;
    const worldAvgs = { pop_avg: 0, gdp_avg: 0, mil_avg: 0, ind_avg: 0, sci_avg: 0, stab_avg: 0 };

    const effects = [
      { effect_kind: "gdp_growth_base", effect_target: null, value: 0.5, duration_kind: "days", duration_remaining: 0 },
      { effect_kind: "gdp_growth_base", effect_target: null, value: 0.1, duration_kind: "permanent", duration_remaining: 0 },
    ];

    const out = getExpectedNextTick(country as any, makeNeutralPcts() as any, rulesByKey, worldAvgs as any, effects as any);
    expect(out.gdp).toBe(110);
  });
});

describe("PLAN_SCENARIOS_TEST — Section 3 (Budget ministères + gravité)", () => {
  it("Scénario 3.1 — Bonus si pct >= min_pct", () => {
    const country = { population: 0, gdp: 0, militarism: 0, industry: 0, science: 0, stability: 0 };
    const pcts = { ...makeNeutralPcts(), pct_defense: 20 };
    const rulesByKey = {
      global_growth_effects: { value: [] },
      budget_defense: {
        value: {
          min_pct: 5,
          gravity_pct: 50,
          effects: [{ effect_type: "militarism", bonus: 0.1, malus: -0.05, gravity_applies: false }],
        },
      },
    } as any;
    const worldAvgs = { pop_avg: 1, gdp_avg: 1, mil_avg: 1, ind_avg: 1, sci_avg: 1, stab_avg: 1 };

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, [] as any);
    // contrib = (20/100)*0.1 = 0.02
    expect(out.inputs.budget_mil_sources["Ministère de la Défense"]).toBe(0.02);
    expect(out.inputs.budget_mil_base).toBe(0.02);
  });

  it("Scénario 3.2 — Malus proportionnel si pct < min_pct", () => {
    const country = { population: 0, gdp: 0, militarism: 0, industry: 0, science: 0, stability: 0 };
    const pcts = { ...makeNeutralPcts(), pct_defense: 0 };
    const rulesByKey = {
      global_growth_effects: { value: [] },
      budget_defense: {
        value: {
          min_pct: 5,
          gravity_pct: 50,
          effects: [{ effect_type: "militarism", bonus: 0.1, malus: -0.05, gravity_applies: false }],
        },
      },
    } as any;
    const worldAvgs = { pop_avg: 1, gdp_avg: 1, mil_avg: 1, ind_avg: 1, sci_avg: 1, stab_avg: 1 };

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, [] as any);
    // scale=(5-0)/5=1 => contrib = -0.05
    expect(out.inputs.budget_mil_sources["Ministère de la Défense"]).toBe(-0.05);
    expect(out.inputs.budget_mil_base).toBe(-0.05);
  });

  it("Scénario 3.3 — Cas limite : min_pct=0 évite la division par zéro", () => {
    const country = { population: 0, gdp: 0, militarism: 0, industry: 0, science: 0, stability: 0 };
    const pcts = { ...makeNeutralPcts(), pct_defense: 0 };
    const rulesByKey = {
      global_growth_effects: { value: [] },
      budget_defense: {
        value: {
          min_pct: 0,
          gravity_pct: 50,
          effects: [{ effect_type: "militarism", bonus: 0.1, malus: -0.05, gravity_applies: false }],
        },
      },
    } as any;
    const worldAvgs = { pop_avg: 1, gdp_avg: 1, mil_avg: 1, ind_avg: 1, sci_avg: 1, stab_avg: 1 };

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, [] as any);
    expect(out.inputs.budget_mil_sources["Ministère de la Défense"]).toBe(0);
    expect(out.inputs.budget_mil_base).toBe(0);
  });

  it("Scénario 3.4 — Gravité (bonus) : pays au-dessus de la moyenne diminue la contribution", () => {
    const country = { population: 0, gdp: 0, militarism: 120, industry: 0, science: 0, stability: 0 };
    const pcts = { ...makeNeutralPcts(), pct_defense: 20 };
    const rulesByKey = {
      global_growth_effects: { value: [] },
      budget_defense: {
        value: {
          min_pct: 5,
          gravity_pct: 50,
          effects: [{ effect_type: "militarism", bonus: 0.1, malus: -0.05, gravity_applies: true }],
        },
      },
    } as any;
    const worldAvgs = { pop_avg: 1, gdp_avg: 1, mil_avg: 100, ind_avg: 1, sci_avg: 1, stab_avg: 1 };

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, [] as any);
    // contrib base = 0.02 ; ratio=(100-120)/100=-0.2 ; factor=1+0.5*(-0.2)=0.9 => final=0.018
    expect(out.inputs.budget_mil_sources["Ministère de la Défense"]).toBe(0.018);
  });

  it("Scénario 3.5 — Gravité (malus) : pays au-dessus de la moyenne aggrave le malus", () => {
    const country = { population: 0, gdp: 0, militarism: 120, industry: 0, science: 0, stability: 0 };
    const pcts = { ...makeNeutralPcts(), pct_defense: 0 };
    const rulesByKey = {
      global_growth_effects: { value: [] },
      budget_defense: {
        value: {
          min_pct: 5,
          gravity_pct: 50,
          effects: [{ effect_type: "militarism", bonus: 0.1, malus: -0.05, gravity_applies: true }],
        },
      },
    } as any;
    const worldAvgs = { pop_avg: 1, gdp_avg: 1, mil_avg: 100, ind_avg: 1, sci_avg: 1, stab_avg: 1 };

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, [] as any);
    // contrib base = -0.05 ; ratio=-0.2 ; factor=1+0.5*(+0.2)=1.1 => final=-0.055
    expect(out.inputs.budget_mil_sources["Ministère de la Défense"]).toBe(-0.055);
  });

  it("Scénario 3.6 — Clamp gravité : facteur plafonné à 2", () => {
    const country = { population: 0, gdp: 0, militarism: -100, industry: 0, science: 0, stability: 0 };
    const pcts = { ...makeNeutralPcts(), pct_defense: 10 };
    const rulesByKey = {
      global_growth_effects: { value: [] },
      budget_defense: {
        value: {
          min_pct: 5,
          gravity_pct: 200,
          effects: [{ effect_type: "militarism", bonus: 0.1, malus: -0.05, gravity_applies: true }],
        },
      },
    } as any;
    const worldAvgs = { pop_avg: 1, gdp_avg: 1, mil_avg: 100, ind_avg: 1, sci_avg: 1, stab_avg: 1 };

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, [] as any);
    // contrib base=(10/100)*0.1=0.01 ; ratio=(100-(-100))/100=2 ; k=2 => raw=5 => clamp 2 => final=0.02
    expect(out.inputs.budget_mil_sources["Ministère de la Défense"]).toBe(0.02);
  });

  it("Scénario 3.7 — Budget multi-effets (gdp sans gravité + industry avec gravité)", () => {
    const country = { population: 0, gdp: 0, militarism: 0, industry: 8, science: 0, stability: 0 };
    const pcts = { ...makeNeutralPcts(), pct_infrastructure: 10 };
    const rulesByKey = {
      global_growth_effects: { value: [] },
      budget_infrastructure: {
        value: {
          min_pct: 5,
          gravity_pct: 50,
          effects: [
            { effect_type: "gdp", bonus: 0.1, malus: -0.05, gravity_applies: false },
            { effect_type: "industry", bonus: 0.2, malus: -0.1, gravity_applies: true },
          ],
        },
      },
    } as any;
    const worldAvgs = { pop_avg: 1, gdp_avg: 1, mil_avg: 1, ind_avg: 5, sci_avg: 1, stab_avg: 1 };

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, [] as any);
    expect(out.inputs.budget_gdp_sources["Ministère de l'Infrastructure"]).toBe(0.01);
    expect(out.inputs.budget_ind_sources["Ministère de l'Infrastructure"]).toBe(0.014);
  });
});

describe("PLAN_SCENARIOS_TEST — Section 4 (Tick complet)", () => {
  it("Scénario 4.1 — Tick “tout combiné” (global + effets + budget)", () => {
    const country = { population: 10_000, gdp: 1_000, militarism: 4, industry: 6, science: 2, stability: 1 };
    const pcts = makeNeutralPcts();
    const rulesByKey = {
      global_growth_effects: {
        value: [
          { effect_kind: "population_growth_base", effect_target: null, value: 0.01 },
          { effect_kind: "population_growth_per_stat", effect_target: "stability", value: 0.002 },
          { effect_kind: "gdp_growth_base", effect_target: null, value: 0.02 },
          { effect_kind: "gdp_growth_per_stat", effect_target: "industry", value: 0.001 },
        ],
      },
      // Aucun budget_* : bonuses vides => contributions 0
    } as any;
    const worldAvgs = { pop_avg: 12_000, gdp_avg: 900, mil_avg: 5, ind_avg: 5, sci_avg: 4, stab_avg: 0 };
    const effects = [
      // +5% car abs(value)>1 => 5/100
      { effect_kind: "population_growth_base", effect_target: null, value: 5, duration_kind: "days", duration_remaining: 1 },
      { effect_kind: "stat_delta", effect_target: "militarism", value: 0.3, duration_kind: "days", duration_remaining: 1 },
    ];

    const out = getExpectedNextTick(country as any, pcts as any, rulesByKey, worldAvgs as any, effects as any);
    expect(out.inputs.pop_total_rate).toBe(0.062);
    expect(out.population).toBe(10_620);
    expect(out.inputs.gdp_total_rate).toBe(0.026);
    expect(out.gdp).toBe(1026);
    expect(out.militarism).toBe(4.3);
  });

  it("Scénario 4.2 — Clamp : population et PIB ne deviennent jamais négatifs", () => {
    const country = { population: 1000, gdp: 100, militarism: 0, industry: 0, science: 0, stability: 0 };
    const rulesByKey = {
      global_growth_effects: {
        value: [
          { effect_kind: "population_growth_base", effect_target: null, value: -2 },
          { effect_kind: "gdp_growth_base", effect_target: null, value: -2 },
        ],
      },
    } as any;
    const worldAvgs = { pop_avg: 0, gdp_avg: 0, mil_avg: 0, ind_avg: 0, sci_avg: 0, stab_avg: 0 };

    const out = getExpectedNextTick(country as any, makeNeutralPcts() as any, rulesByKey, worldAvgs as any, [] as any);
    expect(out.population).toBe(0);
    expect(out.gdp).toBe(0);
  });

  it("Scénario 4.3 — Arrondi strict à 2 décimales et clamp [0..10] (militarism)", () => {
    const country = { population: 0, gdp: 0, militarism: 9.999, industry: 0, science: 0, stability: 0 };
    const rulesByKey = { global_growth_effects: { value: [] } } as any;
    const worldAvgs = { pop_avg: 0, gdp_avg: 0, mil_avg: 0, ind_avg: 0, sci_avg: 0, stab_avg: 0 };
    const effects = [{ effect_kind: "stat_delta", effect_target: "militarism", value: 0.01, duration_kind: "days", duration_remaining: 1 }];

    const out = getExpectedNextTick(country as any, makeNeutralPcts() as any, rulesByKey, worldAvgs as any, effects as any);
    // (9.999+0.01)=10.009 -> round 2 décimales = 10.01 -> clamp max 10
    expect(out.militarism).toBe(10);
  });
});

