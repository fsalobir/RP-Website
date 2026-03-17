import { describe, expect, it } from "vitest";
import { applyInfluenceModifiers, computeInfluenceForAll } from "@/lib/influence";

describe("PLAN_SCENARIOS_TEST — Section 5 (Influence)", () => {
  it("Scénario 5.1 — Contributions brutes + clamp stabilité (t dans [0,1])", () => {
    const config = {
      mult_gdp: 1e-9,
      mult_population: 1e-7,
      mult_military: 0.01,
      stability_modifier_min: 0,
      stability_modifier_max: 1,
      gravity_pct_gdp: 0,
      gravity_pct_population: 0,
      gravity_pct_military: 0,
    };

    const countries = [
      { id: "c1", gdp: 1_000_000_000, population: 10_000_000, stability: 0 },
      // Deux autres pays pour tester le clamp stabilité :
      { id: "cHigh", gdp: 0, population: 0, stability: 999 },
      { id: "cLow", gdp: 0, population: 0, stability: -999 },
    ];
    const hardPower = new Map([
      ["c1", { terre: 0, air: 0, mer: 0, strategique: 0, total: 50 }],
      ["cHigh", { terre: 0, air: 0, mer: 0, strategique: 0, total: 0 }],
      ["cLow", { terre: 0, air: 0, mer: 0, strategique: 0, total: 0 }],
    ]);

    const { byCountry } = computeInfluenceForAll(countries as any, hardPower as any, config);

    const r = byCountry.get("c1")!;
    expect(r.components.gdp).toBe(1);
    expect(r.components.population).toBe(1);
    expect(r.components.military).toBe(0.5);
    expect(r.components.stabilityMultiplier).toBe(0.5);
    expect(r.influence).toBe(1.25);

    // Clamp t>=1 => multiplier = max
    expect(byCountry.get("cHigh")!.components.stabilityMultiplier).toBe(1);
    // Clamp t<=0 => multiplier = min
    expect(byCountry.get("cLow")!.components.stabilityMultiplier).toBe(0);
  });

  it("Scénario 5.2 — Gravité sur composant : pays au-dessus de la moyenne est ralenti", () => {
    // On choisit des valeurs qui donnent un ratio exact (-0.5) pour des expects stricts.
    // A: gdp contrib=3, B: gdp contrib=1 => worldAvg=2.
    const config = {
      mult_gdp: 1,
      mult_population: 0,
      mult_military: 0,
      stability_modifier_min: 1,
      stability_modifier_max: 1,
      gravity_pct_gdp: 50,
      gravity_pct_population: 0,
      gravity_pct_military: 0,
    };

    const countries = [
      { id: "a", gdp: 3, population: 0, stability: 0 },
      { id: "b", gdp: 1, population: 0, stability: 0 },
    ];
    const hardPower = new Map<string, any>();

    const { byCountry, worldAverages } = computeInfluenceForAll(countries as any, hardPower as any, config);
    expect(worldAverages.gdp).toBe(2);

    const a = byCountry.get("a")!;
    // ratio=(2-3)/2=-0.5 ; k=0.5 => factor=0.75 ; after=3*0.75=2.25
    expect(a.componentsAfterGravity.gdp).toBe(2.25);
  });

  it("Scénario 5.3 — Application des effets influence_modifier_*", () => {
    const result = {
      influence: 0,
      components: { gdp: 0, population: 0, military: 0, stabilityMultiplier: 0.5 },
      componentsAfterGravity: { gdp: 10, population: 5, military: 2, stabilityMultiplier: 0.5 },
    };
    const mods = { gdp: 1.2, population: 0.8, hard_power: 1.5, global: 1.1 };

    const out = applyInfluenceModifiers(result as any, mods as any);
    // gdp=12, pop=4, mil=3 => base=19 ; influence=19*0.5*1.1=10.45
    expect(out.componentsAfterGravity.gdp).toBe(12);
    expect(out.componentsAfterGravity.population).toBe(4);
    expect(out.componentsAfterGravity.military).toBe(3);
    expect(out.influence).toBe(10.45);
  });
});

