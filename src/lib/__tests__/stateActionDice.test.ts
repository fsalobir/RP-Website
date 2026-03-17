import { describe, expect, it, vi } from "vitest";

// Mock relations/hardPower/influence to avoid DB complexity and to control modifiers.
vi.mock("@/lib/relations", () => ({
  getRelation: vi.fn(async () => -40),
}));

vi.mock("@/lib/hardPower", () => ({
  computeHardPowerByCountry: vi.fn(() => new Map()),
}));

vi.mock("@/lib/influence", () => ({
  computeInfluenceForAll: vi.fn(() => ({
    byCountry: new Map([
      ["emitter", { influence: 200, components: {}, componentsAfterGravity: {} }],
      ["target", { influence: 100, components: {}, componentsAfterGravity: {} }],
    ]),
    worldAverages: { gdp: 0, population: 0, military: 0 },
  })),
}));

import { computeAiEventDiceRoll } from "@/lib/stateActionDice";

type SupabaseMock = {
  from: (table: string) => any;
};

function makeSupabaseMock(params: {
  statsRow?: Record<string, unknown>;
  rangesRow?: Record<string, unknown>;
  influenceConfig?: Record<string, unknown>;
}) {
  const statsRow = params.statsRow ?? { militarism: 0, industry: 0, science: 0, stability: 0 };
  const rangesRow = params.rangesRow ?? {
    militarism: { min: 0, max: 0 },
    industry: { min: 0, max: 0 },
    science: { min: 0, max: 0 },
    stability: { min: 0, max: 0 },
  };
  const influenceConfig = params.influenceConfig ?? {};

  const mock: SupabaseMock = {
    from(table: string) {
      if (table === "countries") {
        return {
          select() {
            return {
              eq() {
                return {
                  single: async () => ({ data: statsRow }),
                };
              },
            };
          },
        };
      }
      if (table === "rule_parameters") {
        return {
          select() {
            return {
              eq(_col: string, key: string) {
                return {
                  maybeSingle: async () => {
                    if (key === "stats_dice_modifier_ranges") return { data: { value: rangesRow } };
                    if (key === "influence_config") return { data: { value: influenceConfig } };
                    return { data: { value: {} } };
                  },
                };
              },
              maybeSingle: async () => ({ data: { value: {} } }),
            };
          },
        };
      }

      // For prise_influence branch it requests a few tables; return minimal empty arrays.
      return {
        select() {
          return {
            order() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => ({ data: null }),
          };
        },
      };
    },
  };

  return mock as any;
}

describe("PLAN_SCENARIOS_TEST — Section 9 (Dés)", () => {
  it("Scénario 9.1 — d100 borné + modif admin + clamp 1..100", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // roll=1
    const supabase = makeSupabaseMock({
      statsRow: { militarism: 0, industry: 0, science: 0, stability: 0 },
      rangesRow: { militarism: { min: 0, max: 0 } },
    });

    const { result } = await computeAiEventDiceRoll({
      supabase,
      countryId: "c1",
      actionKey: "insulte_diplomatique",
      paramsSchema: {},
      payload: {},
      rollType: "success",
      adminModifiers: [{ label: "Admin", value: 10 }],
    });

    expect(result?.roll).toBe(1);
    expect(result?.modifier).toBe(10);
    expect(result?.total).toBe(11);
    Math.random.mockRestore?.();
  });

  it("Scénario 9.2 — Stat modifier : interpolation linéaire + round", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // roll=1
    const supabase = makeSupabaseMock({
      statsRow: { militarism: 5, industry: 0, science: 0, stability: 0 },
      rangesRow: { militarism: { min: -10, max: 20 } },
    });

    const { result } = await computeAiEventDiceRoll({
      supabase,
      countryId: "c1",
      actionKey: "insulte_diplomatique",
      paramsSchema: {},
      payload: {},
      rollType: "success",
      adminModifiers: [],
    });

    // t=0.5 => round(-10 + 0.5*(30)) = 5
    expect(result?.stat_modifiers?.militarism).toBe(5);
    expect(result?.modifier).toBe(5);
    expect(result?.total).toBe(6);
    Math.random.mockRestore?.();
  });

  it("Scénario 9.3 — stat_bonus désactive une stat (science)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // roll=1
    const supabase = makeSupabaseMock({
      statsRow: { militarism: 0, industry: 0, science: 10, stability: 0 },
      rangesRow: { science: { min: 50, max: 50 } },
    });

    const { result } = await computeAiEventDiceRoll({
      supabase,
      countryId: "c1",
      actionKey: "insulte_diplomatique",
      paramsSchema: { stat_bonus: { science: false } },
      payload: {},
      rollType: "success",
      adminModifiers: [],
    });

    expect(result?.stat_modifiers).toEqual({}); // no stat modifiers
    expect(result?.modifier).toBe(0);
    expect(result?.total).toBe(1);
    Math.random.mockRestore?.();
  });

  it("Scénario 9.4 — prise_influence : relationModifier = round((relation/100)*amplitude)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // roll=1
    const supabase = makeSupabaseMock({
      statsRow: { militarism: 0, industry: 0, science: 0, stability: 0 },
      rangesRow: {},
    });

    const { result } = await computeAiEventDiceRoll({
      supabase,
      countryId: "emitter",
      actionKey: "prise_influence",
      paramsSchema: { amplitude_relations: 30 },
      payload: { target_country_id: "target" },
      rollType: "impact",
      adminModifiers: [],
    });

    // mocked getRelation returns -40 => round((-40/100)*30) = -12
    expect(result?.relation_modifier).toBe(-12);
    Math.random.mockRestore?.();
  });

  it("Scénario 9.5 — prise_influence : influenceModifier piecewise (ratio)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // roll=1
    const supabase = makeSupabaseMock({
      statsRow: { militarism: 0, industry: 0, science: 0, stability: 0 },
      rangesRow: {},
    });

    const baseParams = {
      ratio_equilibre: 1,
      ratio_min: 0.5,
      ratio_max: 2,
      malus_max: 20,
      bonus_max: 20,
    };

    // With our influence mock: emitter=200, target=100 => ratio=2 => bonus_max
    const { result } = await computeAiEventDiceRoll({
      supabase,
      countryId: "emitter",
      actionKey: "prise_influence",
      paramsSchema: { equilibre_des_forces: baseParams },
      payload: { target_country_id: "target" },
      rollType: "impact",
      adminModifiers: [],
    });

    expect(result?.influence_modifier).toBe(20);
    Math.random.mockRestore?.();
  });
});

