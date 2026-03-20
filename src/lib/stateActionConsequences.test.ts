import { describe, expect, it, vi } from "vitest";
import { applyImmediateEffect, applyStateActionConsequences, clampEffectValue } from "@/lib/stateActionConsequences";

type TableHandler = {
  select?: (...args: any[]) => any;
  update?: (...args: any[]) => any;
  insert?: (...args: any[]) => any;
  upsert?: (...args: any[]) => any;
  eq?: (...args: any[]) => any;
  is?: (...args: any[]) => any;
  maybeSingle?: (...args: any[]) => any;
  single?: (...args: any[]) => any;
  order?: (...args: any[]) => any;
};

function makeSupabaseMock(handlers: Record<string, TableHandler>) {
  return {
    from(table: string) {
      const h = handlers[table] ?? {};
      const chain: any = {
        select: (...args: any[]) => {
          void args;
          return chain;
        },
        update: (...args: any[]) => {
          chain._updatePayload = args[0];
          return chain;
        },
        insert: (...args: any[]) => {
          chain._insertPayload = args[0];
          return Promise.resolve({ error: null });
        },
        upsert: (...args: any[]) => {
          chain._upsertPayload = args[0];
          chain._upsertOptions = args[1];
          return Promise.resolve({ error: null });
        },
        eq: (...args: any[]) => {
          void args;
          return chain;
        },
        is: (...args: any[]) => {
          void args;
          return chain;
        },
        order: (...args: any[]) => {
          void args;
          return chain;
        },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
      };

      // override chain methods when provided
      for (const [k, v] of Object.entries(h)) {
        (chain as any)[k] = v;
      }
      return chain;
    },
  } as any;
}

describe("stateActionConsequences", () => {
  it("clampEffectValue clamps to finite range", () => {
    expect(clampEffectValue(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampEffectValue(10_000)).toBeLessThanOrEqual(1000);
    expect(clampEffectValue(-10_000)).toBeGreaterThanOrEqual(-1000);
  });

  it("applyImmediateEffect: relation_delta upserts normalized pair and clamps", async () => {
    const upsertSpy = vi.fn(async () => ({ error: null }));
    const supabase = makeSupabaseMock({
      country_relations: {
        upsert: upsertSpy,
      },
      // getRelation() path: select(value).eq(...).eq(...).maybeSingle()
      // We'll just return existing value via maybeSingle.
      country_relations_select: {},
    });

    // Monkeypatch getRelation's internal fetch by providing a handler for select+maybeSingle on country_relations
    // (simplest: override select to return object with eq().eq().maybeSingle())
    (supabase as any).from = (table: string) => {
      if (table !== "country_relations") return makeSupabaseMock({})["from"](table);
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: { value: 95 } }),
                  };
                },
              };
            },
          };
        },
        upsert: upsertSpy,
      };
    };

    const res = await applyImmediateEffect(supabase, "b", {
      name: "Rel",
      effect_kind: "relation_delta",
      effect_target: "a",
      effect_subtype: null,
      value: 10, // should clamp to 100 max
      duration_kind: "days",
      duration_remaining: 1,
    });

    expect(res.error).toBeUndefined();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const payload = (upsertSpy as any).mock.calls[0][0] as {
      country_a_id: string;
      country_b_id: string;
      value: number;
    };
    // normalized pair: a < b
    expect(payload.country_a_id).toBe("a");
    expect(payload.country_b_id).toBe("b");
    expect(payload.value).toBe(100);
  });

  it("applyStateActionConsequences: missing target errors for insult", async () => {
    const supabase = makeSupabaseMock({});
    const res = await applyStateActionConsequences({
      supabase,
      countryId: "c1",
      payload: {},
      adminEffectAdded: null,
      diceResults: null,
      actionKey: "insulte_diplomatique",
      actionLabel: "Insulte",
      paramsSchema: { impact_maximum: 50 },
      options: { skipDiscord: true },
    });
    expect(res.error).toBe("Pays cible manquant.");
  });
});

