import { describe, expect, it } from "vitest";
import { computeHardPowerByCountry } from "@/lib/hardPower";

describe("PLAN_SCENARIOS_TEST — Section 6 (Hard Power)", () => {
  it("Scénario 6.1 — unlockedLevel = floor(points/100)", () => {
    const rosterUnits = [{ id: "u1", branch: "terre", base_count: 1 }] as any;
    const rosterLevels = [
      { unit_id: "u1", level: 0, hard_power: 1 },
      { unit_id: "u1", level: 1, hard_power: 1 },
      { unit_id: "u1", level: 2, hard_power: 1 },
    ] as any;

    const mk = (points: number) =>
      computeHardPowerByCountry(
        [{ country_id: "c1", roster_unit_id: "u1", current_level: points, extra_count: 0 }] as any,
        rosterUnits,
        rosterLevels
      ).get("c1")!;

    // Les hard_power étant constants (=1), le hard power total reflète directement le niveau débloqué
    // uniquement via la présence du levelRow. Pour tester le floor(points/100), on compare via
    // une table de niveaux disponibles (0/1/2) : tout point qui floor->k doit sélectionner hard_power du level k.
    // Ici hard_power est identique, donc on teste indirectement en s'assurant que la sélection de level existe.
    // On rend le hard_power dépendant du level pour rendre l'assert strict.
    const rosterLevels2 = [
      { unit_id: "u1", level: 0, hard_power: 10 },
      { unit_id: "u1", level: 1, hard_power: 20 },
      { unit_id: "u1", level: 2, hard_power: 30 },
    ] as any;

    const mk2 = (points: number) =>
      computeHardPowerByCountry(
        [{ country_id: "c1", roster_unit_id: "u1", current_level: points, extra_count: 0 }] as any,
        rosterUnits,
        rosterLevels2
      ).get("c1")!;

    expect(mk2(0).total).toBe(10); // level 0
    expect(mk2(99).total).toBe(10); // still level 0
    expect(mk2(100).total).toBe(20); // level 1
    expect(mk2(250).total).toBe(30); // level 2

    // Sanity: original helper still returns map
    expect(mk(0).total).toBeTypeOf("number");
  });

  it("Scénario 6.2 — Hard power = Σ count × hard_power(level)", () => {
    const rosterUnits = [{ id: "u1", branch: "terre", base_count: 10 }] as any;
    const rosterLevels = [{ unit_id: "u1", level: 2, hard_power: 3 }] as any;
    const countryUnits = [{ country_id: "c1", roster_unit_id: "u1", current_level: 250, extra_count: 2 }] as any;

    const hp = computeHardPowerByCountry(countryUnits, rosterUnits, rosterLevels).get("c1")!;
    expect(hp.terre).toBe(36);
    expect(hp.total).toBe(36);
  });
});

