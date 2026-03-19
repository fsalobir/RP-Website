import { describe, expect, test } from "vitest";
import { mapFinalNumbersFromAttrs } from "@/lib/effects/mapper";
import type { ResolvedEffects } from "@/lib/effects/engine";

function makeResolved(byKind: ResolvedEffects["byKind"]): ResolvedEffects {
  return {
    target: { type: "province", id: "00000000-0000-0000-0000-000000000000" },
    byKind,
  };
}

describe("mapFinalNumbersFromAttrs", () => {
  test("applique sum/product/max par subkey et ignore les non-numériques", () => {
    const resolved = makeResolved({
      "resource_bonus|prosperity": {
        effect_kind: "resource_bonus",
        target: { type: "province", id: "x" },
        value: 10,
        mode: "sum",
        sources: [],
      },
      "resource_multiplier|prosperity": {
        effect_kind: "resource_multiplier",
        target: { type: "province", id: "x" },
        value: 1.5,
        mode: "product",
        sources: [],
      },
      "resource_min|mana": {
        effect_kind: "resource_min",
        target: { type: "province", id: "x" },
        value: 12,
        mode: "max",
        sources: [],
      },
    });

    const out = mapFinalNumbersFromAttrs(
      {
        prosperity: 40,
        mana: 5,
        population: "12000",
        lore: "texte",
        nested: { a: 1 },
      },
      resolved,
    );

    // prosperity: (40 * 1.5) + 10 = 70
    expect(out.prosperity).toBe(70);
    // mana: (5 * 1) + 0, puis max(5, 12) = 12
    expect(out.mana).toBe(12);
    // population: string numérique acceptée, aucun effet => 12000
    expect(out.population).toBe(12000);
    // non numérique ignoré
    expect("lore" in out).toBe(false);
    expect("nested" in out).toBe(false);
  });
});

