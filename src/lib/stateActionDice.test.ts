import { describe, expect, it, vi } from "vitest";
import { computeAiEventDiceRoll } from "@/lib/stateActionDice";

type SupabaseMock = {
  from: (table: string) => any;
};

function makeSupabaseMock(params: {
  countryRow?: Record<string, unknown> | null;
  rangesRow?: Record<string, unknown> | null;
  relationValue?: number;
}) {
  const { countryRow = { militarism: 10, industry: 0, science: 0, stability: 0 }, rangesRow = { militarism: { min: 0, max: 0 } }, relationValue = 0 } = params;

  const mock = {
    from(table: string) {
      if (table === "countries") {
        return {
          select() {
            return {
              eq() {
                return {
                  single: async () => ({ data: countryRow }),
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
              eq() {
                return {
                  maybeSingle: async () => ({ data: { value: rangesRow } }),
                };
              },
            };
          },
        };
      }
      // for prise_influence, but tests below avoid the heavy branch unless we explicitly go there
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: null }),
              };
            },
            order() {
              return this;
            },
            maybeSingle: async () => ({ data: null }),
          };
        },
      };
    },
  } satisfies SupabaseMock;

  // Patch getRelation import indirectly by providing a .from(country_relations) path if needed.
  // In our current tests, we avoid actionKey=prise_influence to keep mocks minimal.
  void relationValue;

  return mock as any;
}

describe("stateActionDice.computeAiEventDiceRoll", () => {
  it("returns deterministic roll in [1,100] and includes admin_modifier when non-zero", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // roll = 1
    const supabase = makeSupabaseMock({
      countryRow: { militarism: 10, industry: 0, science: 0, stability: 0 },
      rangesRow: { militarism: { min: 0, max: 0 } },
    });

    const { result, error } = await computeAiEventDiceRoll({
      supabase,
      countryId: "c1",
      actionKey: "insulte_diplomatique",
      paramsSchema: {},
      payload: {},
      rollType: "success",
      adminModifiers: [{ label: "Test", value: 10 }],
    });

    expect(error).toBeUndefined();
    expect(result?.roll).toBe(1);
    expect(result?.total).toBe(11); // clamped 1..100; roll(1)+admin(10)
    expect(result?.admin_modifier).toBe(10);
    vi.restoreAllMocks();
  });

  it("clamps total to max 100", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // roll=100
    const supabase = makeSupabaseMock({
      countryRow: { militarism: 10, industry: 10, science: 10, stability: 3 },
      rangesRow: { militarism: { min: 50, max: 50 }, industry: { min: 50, max: 50 }, science: { min: 50, max: 50 }, stability: { min: 50, max: 50 } },
    });

    const { result } = await computeAiEventDiceRoll({
      supabase,
      countryId: "c1",
      actionKey: "insulte_diplomatique",
      paramsSchema: {},
      payload: {},
      rollType: "success",
      adminModifiers: [{ label: "Huge", value: 999 }],
    });

    expect(result?.roll).toBe(100);
    expect(result?.total).toBe(100);
    vi.restoreAllMocks();
  });
});

