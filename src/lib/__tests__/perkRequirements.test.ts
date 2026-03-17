import { describe, expect, it } from "vitest";
import { getRequirementValueHelper, isPerkActive } from "@/lib/perkRequirements";

// Mock minimal laws API used by perkRequirements.ts for law_level requirements.
import { vi } from "vitest";
vi.mock("@/lib/laws", () => {
  return {
    LAW_DEFINITIONS: [
      { lawKey: "law_test", title_fr: "Loi Test", configRuleKey: "law_test_config", levels: [{ key: "l1", label: "N1" }, { key: "l2", label: "N2" }, { key: "l3", label: "N3" }, { key: "l4", label: "N4" }, { key: "l5", label: "N5" }] },
    ],
    getLawDefinition: (lawKey: string) => {
      if (lawKey !== "law_test") return null;
      return { lawKey: "law_test", title_fr: "Loi Test", configRuleKey: "law_test_config", levels: [{ key: "l1", label: "N1" }, { key: "l2", label: "N2" }, { key: "l3", label: "N3" }, { key: "l4", label: "N4" }, { key: "l5", label: "N5" }] };
    },
    getLawLevelKeyFromScore: () => "l3",
  };
});

describe("PLAN_SCENARIOS_TEST — Section 8 (Avantages)", () => {
  it("Scénario 8.1 — Requis stat (frontière)", () => {
    const perk = {
      id: "p1",
      perk_requirements: [{ requirement_kind: "stat", requirement_target: "militarism", value: 5 }],
    };
    const ctx = {
      country: { militarism: 5, industry: 0, science: 0, stability: 0, gdp: 0, population: 0 },
    };
    expect(isPerkActive(perk as any, ctx as any)).toBe(true);
  });

  it("Scénario 8.2 — Requis PIB : comparaison sur valeur brute stockée", () => {
    const perk = {
      id: "p1",
      perk_requirements: [{ requirement_kind: "gdp", requirement_target: null, value: 1_200_000_000 }],
    };
    const ctx = {
      country: { militarism: 0, industry: 0, science: 0, stability: 0, gdp: 1_199_999_999, population: 0 },
    };
    expect(isPerkActive(perk as any, ctx as any)).toBe(false);

    // Helper affichage->stockage (Bn -> brut)
    const h = getRequirementValueHelper("gdp");
    expect(h.displayToStored(1.2)).toBe(1_200_000_000);
  });

  it("Scénario 8.3 — Requis influence absent => false", () => {
    const perk = {
      id: "p1",
      perk_requirements: [{ requirement_kind: "influence", requirement_target: null, value: 100 }],
    };
    const ctx = {
      country: { militarism: 0, industry: 0, science: 0, stability: 0, gdp: 0, population: 0 },
      influenceValue: null,
    };
    expect(isPerkActive(perk as any, ctx as any)).toBe(false);
  });

  it("Scénario 8.4 — Requis law_level : niveau résolu depuis score (>=3 => true)", () => {
    const perk = {
      id: "p1",
      perk_requirements: [{ requirement_kind: "law_level", requirement_target: "law_test", value: 3 }],
    };
    const ctx = {
      country: { militarism: 0, industry: 0, science: 0, stability: 0, gdp: 0, population: 0 },
      countryLawRows: [{ country_id: "c1", law_key: "law_test", score: 999 }],
      ruleParametersByKey: { law_test_config: { value: { level_thresholds: {} } } },
    };
    expect(isPerkActive(perk as any, ctx as any)).toBe(true);
  });
});

