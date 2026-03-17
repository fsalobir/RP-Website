import { describe, expect, it, vi } from "vitest";

// Isoler la logique et éviter les side effects.
vi.mock("@/lib/discord-dispatch", () => ({
  dispatchToDiscord: vi.fn(async () => {}),
}));

import { applyImmediateEffect, applyStateActionConsequences } from "@/lib/stateActionConsequences";

type TableChain = any;
type SupabaseMock = {
  from: (table: string) => TableChain;
  _calls: {
    upserts: Array<{ table: string; payload: any; options: any }>;
    updates: Array<{ table: string; payload: any }>;
    inserts: Array<{ table: string; payload: any }>;
  };
};

function makeSupabaseMock(handlers: {
  relationValue?: number;
  controlSharePct?: number | null;
  countryStatsRow?: Record<string, unknown>;
  ideologyRow?: Record<string, unknown>;
  rosterLevelCount?: number;
  cmuRow?: { id: string; current_level: number } | null;
  cmuExtraRow?: { id: string; extra_count: number } | null;
}) {
  const calls = { upserts: [] as any[], updates: [] as any[], inserts: [] as any[] };
  const relationValue = handlers.relationValue ?? 0;
  const controlSharePct = handlers.controlSharePct ?? null;
  const countryStatsRow = handlers.countryStatsRow ?? { stability: 2.5 };
  const ideologyRow = handlers.ideologyRow ?? {};
  const rosterLevelCount = handlers.rosterLevelCount ?? 5;
  const cmuRow = handlers.cmuRow ?? { id: "cmu1", current_level: 480 };
  const cmuExtraRow = handlers.cmuExtraRow ?? { id: "cmu1", extra_count: 1 };

  const supabase: SupabaseMock = {
    _calls: calls,
    from(table: string) {
      const chain: any = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        order() {
          return chain;
        },
        maybeSingle: async () => ({ data: null }),
        single: async () => ({ data: null }),
        update(payload: any) {
          calls.updates.push({ table, payload });
          return { eq: () => Promise.resolve({ error: null }) };
        },
        insert(payload: any) {
          calls.inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
        upsert(payload: any, options: any) {
          calls.upserts.push({ table, payload, options });
          return Promise.resolve({ error: null });
        },
      };

      // Tables utilisées
      if (table === "country_relations") {
        // getRelation() fait select(value)...maybeSingle()
        chain.maybeSingle = async () => ({ data: { value: relationValue } });
        chain.upsert = (payload: any, options: any) => {
          calls.upserts.push({ table, payload, options });
          return Promise.resolve({ error: null });
        };
        return chain;
      }

      if (table === "country_control") {
        chain.maybeSingle = async () => (controlSharePct == null ? { data: null } : { data: { id: "ctrl1", share_pct: controlSharePct } });
        chain.upsert = (payload: any, options: any) => {
          calls.upserts.push({ table, payload, options });
          return Promise.resolve({ error: null });
        };
        return chain;
      }

      if (table === "countries") {
        chain.single = async () => ({ data: countryStatsRow });
        return chain;
      }

      if (table === "military_roster_units") {
        chain.single = async () => ({ data: { level_count: rosterLevelCount } });
        return chain;
      }

      if (table === "country_military_units") {
        chain.maybeSingle = async () => ({ data: cmuRow });
        return chain;
      }

      if (table === "country_effects") {
        chain.insert = (payload: any) => {
          calls.inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        };
        return chain;
      }

      // Spécifique ideology snap : select colonnes ideology_* puis update
      if (table === "countries_ideology") {
        chain.single = async () => ({ data: ideologyRow });
        return chain;
      }

      return chain;
    },
  };

  // Hack: applyImmediateEffect utilise supabase.from("countries") pour idéologie.
  // On multiplexe via l'argument select(columns) : si colonnes contiennent 'ideology_' on renvoie ideologyRow.
  const originalFrom = supabase.from.bind(supabase);
  supabase.from = (table: string) => {
    if (table !== "countries") return originalFrom(table);
    const chain = originalFrom(table);
    const originalSelect = chain.select;
    chain.select = (cols: any) => {
      if (typeof cols === "string" && cols.includes("ideology_")) {
        chain.single = async () => ({ data: ideologyRow });
      } else {
        chain.single = async () => ({ data: countryStatsRow });
      }
      return originalSelect.call(chain, cols);
    };
    return chain;
  };

  // For extra tests: country_military_units existing vs not.
  if (handlers.cmuExtraRow === null) {
    const originalFrom2 = supabase.from.bind(supabase);
    supabase.from = (table: string) => {
      const chain = originalFrom2(table);
      if (table === "country_military_units") {
        chain.maybeSingle = async () => ({ data: null });
      }
      return chain;
    };
  } else if (handlers.cmuExtraRow) {
    const originalFrom2 = supabase.from.bind(supabase);
    supabase.from = (table: string) => {
      const chain = originalFrom2(table);
      if (table === "country_military_units") {
        chain.maybeSingle = async () => ({ data: handlers.cmuExtraRow });
      }
      return chain;
    };
  }

  return supabase as any;
}

describe("PLAN_SCENARIOS_TEST — Section 10 (Conséquences)", () => {
  it("Scénario 10.1 — Relations insulte : delta négatif borné et clamp relation [-100,100]", async () => {
    const supabase = makeSupabaseMock({ relationValue: 10 });
    const res = await applyStateActionConsequences({
      supabase,
      countryId: "c1",
      payload: { target_country_id: "c2" },
      adminEffectAdded: null,
      diceResults: { impact_roll: { total: 80, roll: 1, modifier: 0 } } as any,
      actionKey: "insulte_diplomatique",
      actionLabel: "Insulte",
      paramsSchema: { impact_maximum: 50 } as any,
      options: { skipDiscord: true },
    });
    expect(res.error).toBeUndefined();
    const upsert = (supabase as any)._calls.upserts.find((c: any) => c.table === "country_relations");
    expect(upsert.payload.value).toBe(-30);
  });

  it("Scénario 10.2 — Ouverture diplomatique : delta positif borné", async () => {
    const supabase = makeSupabaseMock({ relationValue: -30 });
    const res = await applyStateActionConsequences({
      supabase,
      countryId: "c1",
      payload: { target_country_id: "c2" },
      adminEffectAdded: null,
      diceResults: { impact_roll: { total: 80, roll: 1, modifier: 0 } } as any,
      actionKey: "ouverture_diplomatique",
      actionLabel: "Ouverture",
      paramsSchema: { impact_maximum: 50 } as any,
      options: { skipDiscord: true },
    });
    expect(res.error).toBeUndefined();
    const upsert = (supabase as any)._calls.upserts.find((c: any) => c.table === "country_relations");
    expect(upsert.payload.value).toBe(10);
  });

  it("Scénario 10.3 — Prise d'influence : share_pct cap à 100", async () => {
    const supabase = makeSupabaseMock({ controlSharePct: 50 });
    const res = await applyStateActionConsequences({
      supabase,
      countryId: "c1",
      payload: { target_country_id: "c2" },
      adminEffectAdded: null,
      diceResults: { impact_roll: { total: 60, roll: 1, modifier: 0 } } as any,
      actionKey: "prise_influence",
      actionLabel: "Prise d'influence",
      paramsSchema: { impact_maximum: 100 } as any,
      options: { skipDiscord: true },
    });
    expect(res.error).toBeUndefined();
    const upsert = (supabase as any)._calls.upserts.find((c: any) => c.table === "country_control");
    expect(upsert.payload.share_pct).toBe(100);
  });

  it("Scénario 10.4 — Effet immédiat stat_delta : clamp stabilité [-3,3]", async () => {
    const supabase = makeSupabaseMock({ countryStatsRow: { stability: 2.5 } });
    const res = await applyImmediateEffect(supabase as any, "c1", {
      name: "Stab",
      effect_kind: "stat_delta",
      effect_target: "stability",
      effect_subtype: null,
      value: 10,
      duration_kind: "days",
      duration_remaining: 1,
      application: "immediate",
    } as any);
    expect(res.error).toBeUndefined();
    const upd = (supabase as any)._calls.updates.find((u: any) => u.table === "countries");
    expect(upd.payload.stability).toBe(3);
  });

  it("Scénario 10.5 — Effet immédiat military_unit_extra : update clamp >=0, insert/no-op", async () => {
    // Cas A : row existante extra_count=1, value=-5 => newExtra=0 (update)
    const supabaseA = makeSupabaseMock({ cmuExtraRow: { id: "cmu1", extra_count: 1 } });
    await applyImmediateEffect(supabaseA as any, "c1", {
      name: "Extra",
      effect_kind: "military_unit_extra",
      effect_target: "u1",
      value: -5,
      duration_kind: "days",
      duration_remaining: 1,
      application: "immediate",
    } as any);
    const updA = (supabaseA as any)._calls.updates.find((u: any) => u.table === "country_military_units");
    expect(updA.payload.extra_count).toBe(0);

    // Cas B : pas de row, value=-1 => no-op (pas d'insert)
    const supabaseB = makeSupabaseMock({ cmuExtraRow: null });
    await applyImmediateEffect(supabaseB as any, "c1", {
      name: "Extra",
      effect_kind: "military_unit_extra",
      effect_target: "u1",
      value: -1,
      duration_kind: "days",
      duration_remaining: 1,
      application: "immediate",
    } as any);
    expect((supabaseB as any)._calls.inserts.filter((i: any) => i.table === "country_military_units")).toHaveLength(0);

    // Cas C : pas de row, value=+3 => insert
    const supabaseC = makeSupabaseMock({ cmuExtraRow: null });
    await applyImmediateEffect(supabaseC as any, "c1", {
      name: "Extra",
      effect_kind: "military_unit_extra",
      effect_target: "u1",
      value: 3,
      duration_kind: "days",
      duration_remaining: 1,
      application: "immediate",
    } as any);
    const insC = (supabaseC as any)._calls.inserts.find((i: any) => i.table === "country_military_units");
    expect(insC.payload.extra_count).toBe(3);
  });

  it("Scénario 10.6 — Effet immédiat military_unit_tech_rate : cap level_count*100", async () => {
    const supabase = makeSupabaseMock({ rosterLevelCount: 5, cmuRow: { id: "cmu1", current_level: 480 } });
    await applyImmediateEffect(supabase as any, "c1", {
      name: "Tech",
      effect_kind: "military_unit_tech_rate",
      effect_target: "u1",
      value: 50,
      duration_kind: "days",
      duration_remaining: 1,
      application: "immediate",
    } as any);
    const upd = (supabase as any)._calls.updates.find((u: any) => u.table === "country_military_units");
    expect(upd.payload.current_level).toBe(500);
  });

  it("Scénario 10.7 — Effet immédiat ideology_snap_* : somme=100 et 4 décimales", async () => {
    // Neutre : 100/6 chacun
    const neutral = 100 / 6;
    const ideologyRow: any = {
      ideology_germanic_monarchy: neutral,
      ideology_satoiste_cultism: neutral,
      ideology_nilotique_cultism: neutral,
      ideology_mughal_republicanism: neutral,
      ideology_french_republicanism: neutral,
      ideology_merina_monarchy: neutral,
    };
    const supabase = makeSupabaseMock({ ideologyRow });

    const res = await applyImmediateEffect(supabase as any, "c1", {
      name: "Snap",
      effect_kind: "ideology_snap_satoiste_cultism",
      effect_target: null,
      value: 10,
      duration_kind: "days",
      duration_remaining: 1,
      application: "immediate",
    } as any);
    expect(res.error).toBeUndefined();

    const upd = (supabase as any)._calls.updates.find((u: any) => u.table === "countries");
    const keys = Object.keys(upd.payload).filter((k) => k.startsWith("ideology_"));
    expect(keys).toHaveLength(6);

    const sum = keys.reduce((s, k) => s + upd.payload[k], 0);
    // Les valeurs sont en Number; on exige une somme exactement 100 (à la précision des 4 décimales)
    expect(Number(sum.toFixed(4))).toBe(100);

    // Chaque valeur persistée doit être arrondie à 4 décimales.
    for (const k of keys) {
      const v = upd.payload[k];
      expect(Number(v.toFixed(4))).toBe(v);
    }
  });
});

