import { describe, it, expect } from "vitest";
import type { Effect, EffectTargetRef } from "@/lib/effects/engine";
import { resolveEffectsForTarget } from "@/lib/effects/engine";
import type { EffectTargetType, UUID } from "@/types/fantasy";

function makeTarget(type: EffectTargetType, id: UUID, subkey?: string): EffectTargetRef {
  return { type, id, subkey };
}

function makeEffect(partial: Partial<Effect>): Effect {
  return {
    id: partial.id ?? "effect-id",
    effect_kind: partial.effect_kind ?? "unknown",
    value: partial.value ?? "0",
    duration_kind: partial.duration_kind ?? "days",
    duration_remaining: partial.duration_remaining ?? null,
    source_label: partial.source_label ?? null,
    created_by_user_id: partial.created_by_user_id ?? null,
    target_type: partial.target_type ?? "realm",
    target_id: partial.target_id ?? "target-id",
    target_subkey: partial.target_subkey ?? null,
    scope: partial.scope ?? {},
    meta: partial.meta ?? {},
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveEffectsForTarget", () => {
  const realmId: UUID = "realm-1";
  const provinceId: UUID = "province-1";
  const anotherProvinceId: UUID = "province-2";

  it("somme les effets numériques simples pour une cible unique", () => {
    const target = makeTarget("province", provinceId);

    const effects: Effect[] = [
      makeEffect({ effect_kind: "tax_bonus", value: "1.5", target_type: "province", target_id: provinceId }),
      makeEffect({ effect_kind: "tax_bonus", value: "0.5", target_type: "province", target_id: provinceId }),
      // autre kind, ne doit pas être agrégé avec tax_bonus
      makeEffect({ effect_kind: "pop_growth", value: "0.1", target_type: "province", target_id: provinceId }),
    ];

    const resolved = resolveEffectsForTarget(target, effects);

    const tax = resolved.byKind["tax_bonus"];
    const pop = resolved.byKind["pop_growth"];

    expect(tax).toBeDefined();
    expect(tax.value).toBeCloseTo(2.0);
    expect(tax.mode).toBe("sum");
    expect(tax.sources).toHaveLength(2);

    expect(pop).toBeDefined();
    expect(pop.value).toBeCloseTo(0.1);
    expect(pop.sources).toHaveLength(1);
  });

  it("utilise le produit pour les multiplicateurs (*_multiplier, mult_*)", () => {
    const target = makeTarget("character", "char-1");

    const effects: Effect[] = [
      makeEffect({
        effect_kind: "damage_multiplier",
        value: "1.10",
        target_type: "character",
        target_id: "char-1",
      }),
      makeEffect({
        effect_kind: "damage_multiplier",
        value: "1.20",
        target_type: "character",
        target_id: "char-1",
      }),
      makeEffect({
        effect_kind: "mult_armor",
        value: "1.50",
        target_type: "character",
        target_id: "char-1",
      }),
    ];

    const resolved = resolveEffectsForTarget(target, effects);

    const dmg = resolved.byKind["damage_multiplier"];
    const armor = resolved.byKind["mult_armor"];

    expect(dmg).toBeDefined();
    expect(dmg.mode).toBe("product");
    expect(dmg.value).toBeCloseTo(1.1 * 1.2, 6);

    expect(armor).toBeDefined();
    expect(armor.mode).toBe("product");
    expect(armor.value).toBeCloseTo(1.5);
  });

  it("utilise max pour les effets *_min_* (seuils)", () => {
    const target = makeTarget("realm", realmId);

    const effects: Effect[] = [
      makeEffect({
        effect_kind: "gold_min_income",
        value: "10",
        target_type: "realm",
        target_id: realmId,
      }),
      makeEffect({
        effect_kind: "gold_min_income",
        value: "25",
        target_type: "realm",
        target_id: realmId,
      }),
      makeEffect({
        effect_kind: "gold_min_income",
        value: "5",
        target_type: "realm",
        target_id: realmId,
      }),
    ];

    const resolved = resolveEffectsForTarget(target, effects);
    const goldMin = resolved.byKind["gold_min_income"];

    expect(goldMin).toBeDefined();
    expect(goldMin.mode).toBe("max");
    expect(goldMin.value).toBe(25);
  });

  it("n’agrège que les effets correspondant exactement à la cible (type + id + subkey)", () => {
    const target = makeTarget("item", "item-1", "slot:weapon");

    const effects: Effect[] = [
      // même kind, même cible, même subkey -> pris
      makeEffect({
        effect_kind: "attack_bonus",
        value: "3",
        target_type: "item",
        target_id: "item-1",
        target_subkey: "slot:weapon",
      }),
      makeEffect({
        effect_kind: "attack_bonus",
        value: "2",
        target_type: "item",
        target_id: "item-1",
        target_subkey: "slot:weapon",
      }),
      // même id mais subkey différente -> ignoré
      makeEffect({
        effect_kind: "attack_bonus",
        value: "100",
        target_type: "item",
        target_id: "item-1",
        target_subkey: "slot:shield",
      }),
      // type différent -> ignoré
      makeEffect({
        effect_kind: "attack_bonus",
        value: "50",
        target_type: "character",
        target_id: "item-1",
      }),
    ];

    const resolved = resolveEffectsForTarget(target, effects);
    const atk = resolved.byKind["attack_bonus|slot:weapon"];

    expect(atk).toBeDefined();
    expect(atk.value).toBe(5);
    expect(atk.sources).toHaveLength(2);
  });

  it("agrège correctement les effets appliqués directement au Realm (sans hiérarchie)", () => {
    const target = makeTarget("realm", realmId);

    const effects: Effect[] = [
      makeEffect({
        effect_kind: "realm_stability_bonus",
        value: "0.5",
        target_type: "realm",
        target_id: realmId,
      }),
      makeEffect({
        effect_kind: "realm_stability_bonus",
        value: "0.25",
        target_type: "realm",
        target_id: realmId,
      }),
      // Autre realm -> ignoré
      makeEffect({
        effect_kind: "realm_stability_bonus",
        value: "10",
        target_type: "realm",
        target_id: "another-realm",
      }),
    ];

    const resolved = resolveEffectsForTarget(target, effects, {
      relatedTargetsForRealm: [],
    });

    const stab = resolved.byKind["realm_stability_bonus"];

    expect(stab).toBeDefined();
    expect(stab.value).toBeCloseTo(0.75);
    expect(stab.sources).toHaveLength(2);
  });

  it("agrège hiérarchiquement les effets des Provinces et Items d’un Realm", () => {
    const targetRealm = makeTarget("realm", realmId);
    const provinceA = makeTarget("province", provinceId);
    const provinceB = makeTarget("province", anotherProvinceId);
    const treasureItem = makeTarget("item", "item-treasure");

    const effects: Effect[] = [
      // Effets sur le royaume directement
      makeEffect({
        effect_kind: "gold_income",
        value: "10",
        target_type: "realm",
        target_id: realmId,
      }),
      // Province A : production d’or
      makeEffect({
        effect_kind: "gold_income",
        value: "3",
        target_type: "province",
        target_id: provinceId,
      }),
      // Province B : production d’or
      makeEffect({
        effect_kind: "gold_income",
        value: "7",
        target_type: "province",
        target_id: anotherProvinceId,
      }),
      // Item de trésor : bonus multiplicatif
      makeEffect({
        effect_kind: "gold_income_multiplier",
        value: "1.20",
        target_type: "item",
        target_id: treasureItem.id,
      }),
      // Effet sur une province d’un autre royaume -> ne doit pas compter
      makeEffect({
        effect_kind: "gold_income",
        value: "1000",
        target_type: "province",
        target_id: "foreign-province",
      }),
      // Effet sur un autre item -> ignoré
      makeEffect({
        effect_kind: "gold_income_multiplier",
        value: "2.0",
        target_type: "item",
        target_id: "foreign-item",
      }),
    ];

    const resolved = resolveEffectsForTarget(targetRealm, effects, {
      relatedTargetsForRealm: [provinceA, provinceB, treasureItem],
    });

    const goldIncome = resolved.byKind["gold_income"];
    const goldMult = resolved.byKind["gold_income_multiplier"];

    // Somme des revenus : 10 (realm) + 3 (A) + 7 (B) = 20
    expect(goldIncome).toBeDefined();
    expect(goldIncome!.value).toBe(20);
    expect(goldIncome!.mode).toBe("sum");
    expect(goldIncome!.sources).toHaveLength(3);

    // Produit des multiplicateurs : uniquement 1.2 (l’item de trésor lié)
    expect(goldMult).toBeDefined();
    expect(goldMult!.mode).toBe("product");
    expect(goldMult!.value).toBeCloseTo(1.2);
    expect(goldMult!.sources).toHaveLength(1);
  });

  it("n’inclut pas les effets hiérarchiques si relatedTargetsForRealm est vide", () => {
    const targetRealm = makeTarget("realm", realmId);

    const effects: Effect[] = [
      makeEffect({
        effect_kind: "gold_income",
        value: "10",
        target_type: "realm",
        target_id: realmId,
      }),
      // Ces effets ne doivent pas être pris en compte sans relatedTargetsForRealm.
      makeEffect({
        effect_kind: "gold_income",
        value: "5",
        target_type: "province",
        target_id: provinceId,
      }),
    ];

    const resolved = resolveEffectsForTarget(targetRealm, effects, {
      relatedTargetsForRealm: [],
    });

    const goldIncome = resolved.byKind["gold_income"];

    expect(goldIncome).toBeDefined();
    expect(goldIncome!.value).toBe(10);
    expect(goldIncome!.sources).toHaveLength(1);
  });
});

