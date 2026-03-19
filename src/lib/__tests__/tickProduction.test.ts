import { describe, expect, test } from "vitest";
import {
  extractProductionFromFinalAttrs,
  buildResourceIdByKey,
  PRODUCTION_ATTR_SUFFIX,
} from "@/lib/tickProduction";
import type { UUID } from "@/types/fantasy";

describe("tickProduction", () => {
  test("PRODUCTION_ATTR_SUFFIX est _production", () => {
    expect(PRODUCTION_ATTR_SUFFIX).toBe("_production");
  });

  test("buildResourceIdByKey construit une map key -> id", () => {
    const id1 = "a0000000-0000-0000-0000-000000000001" as UUID;
    const id2 = "a0000000-0000-0000-0000-000000000002" as UUID;
    const map = buildResourceIdByKey([
      { id: id1, key: "gold" },
      { id: id2, key: "nourriture" },
    ]);
    expect(map.get("gold")).toBe(id1);
    expect(map.get("nourriture")).toBe(id2);
    expect(map.get("inconnu")).toBeUndefined();
  });

  test("extractProductionFromFinalAttrs extrait les clés *_production et mappe vers resource_kind_id", () => {
    const idGold = "b0000000-0000-0000-0000-000000000001" as UUID;
    const idNourriture = "b0000000-0000-0000-0000-000000000002" as UUID;
    const resourceIdByKey = new Map<string, UUID>([
      ["gold", idGold],
      ["nourriture", idNourriture],
    ]);

    const attrsFinal: Record<string, number> = {
      gold_production: 50,
      nourriture_production: 120,
      population: 1000,
      other_attr: 3,
    };

    const out = extractProductionFromFinalAttrs(attrsFinal, resourceIdByKey);

    expect(out.get(idGold)).toBe(50);
    expect(out.get(idNourriture)).toBe(120);
    expect(out.size).toBe(2);
  });

  test("extractProductionFromFinalAttrs ignore les clés sans correspondance resource_kind", () => {
    const idGold = "c0000000-0000-0000-0000-000000000001" as UUID;
    const resourceIdByKey = new Map<string, UUID>([["gold", idGold]]);

    const attrsFinal: Record<string, number> = {
      gold_production: 10,
      mana_production: 5,
    };

    const out = extractProductionFromFinalAttrs(attrsFinal, resourceIdByKey);

    expect(out.get(idGold)).toBe(10);
    expect(out.size).toBe(1);
  });

  test("extractProductionFromFinalAttrs agrège si même ressource depuis plusieurs clés (non prévu en convention mais robustesse)", () => {
    const idGold = "d0000000-0000-0000-0000-000000000001" as UUID;
    const resourceIdByKey = new Map<string, UUID>([["gold", idGold]]);

    const attrsFinal: Record<string, number> = {
      gold_production: 10,
    };

    const out = extractProductionFromFinalAttrs(attrsFinal, resourceIdByKey);
    expect(out.get(idGold)).toBe(10);
  });
});
