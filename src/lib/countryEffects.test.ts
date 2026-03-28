import { describe, expect, it } from "vitest";
import {
  buildEffectKeys,
  formatEffectValue,
  getAllocationCapPercent,
  getDefaultTargetForKind,
  getEffectDescription,
  getEffectKindValueHelper,
  getForcedMinPcts,
  getInfluenceModifiersFromEffects,
  getEffectiveMilitaryUnitCount,
  getSubTypeLimitModifierPercent,
  getUnitExtraEffectSum,
  isEffectDisplayPositive,
  normalizeAdminEffectsAdded,
  parseSubTypeTarget,
  SUB_TYPE_TARGET_SEP,
} from "@/lib/countryEffects";

describe("countryEffects", () => {
  it("buildEffectKeys: gdp_growth base/per_stat", () => {
    expect(buildEffectKeys("gdp_growth", "base", null)).toEqual({
      effect_kind: "gdp_growth_base",
      effect_target: null,
      effect_subtype: null,
    });
    expect(buildEffectKeys("gdp_growth", "per_stat", "militarism")).toEqual({
      effect_kind: "gdp_growth_per_stat",
      effect_target: "militarism",
      effect_subtype: null,
    });
  });

  it("parseSubTypeTarget splits branch and subtype", () => {
    expect(parseSubTypeTarget(`terre${SUB_TYPE_TARGET_SEP}infanterie`)).toEqual({ branch: "terre", subType: "infanterie" });
    expect(parseSubTypeTarget(`air${SUB_TYPE_TARGET_SEP}`)).toEqual({ branch: "air", subType: null });
    expect(parseSubTypeTarget("mer")).toEqual({ branch: "mer", subType: null });
  });

  it("getEffectKindValueHelper: multiplier influence stores as 1+x/100", () => {
    const h = getEffectKindValueHelper("influence_modifier_global");
    expect(h.displayToStored(20)).toBeCloseTo(1.2);
    expect(h.storedToDisplay(1.2)).toBeCloseTo(20);
  });

  it("formatEffectValue handles key formats", () => {
    expect(formatEffectValue("budget_ministry_min_pct", 12)).toBe("12 %");
    expect(formatEffectValue("budget_allocation_cap", 5)).toBe("+5 %");
    expect(formatEffectValue("budget_allocation_cap", -5)).toBe("-5 %");
    expect(formatEffectValue("gdp_growth_base", 0.0123)).toBe("1.23 %");
    expect(formatEffectValue("military_unit_extra", 3)).toBe("+3");
    expect(formatEffectValue("military_unit_extra", -2)).toBe("-2");
  });

  it("normalizeAdminEffectsAdded supports null, object, array and filters invalid", () => {
    expect(normalizeAdminEffectsAdded(null)).toEqual([]);
    expect(
      normalizeAdminEffectsAdded({
        name: "X",
        effect_kind: "stat_delta",
        effect_target: "militarism",
        effect_subtype: null,
        value: 1,
        duration_kind: "days",
        duration_remaining: 1,
      })
    ).toHaveLength(1);
    expect(normalizeAdminEffectsAdded([{ name: "X", effect_kind: "stat_delta" }, { nope: true }])).toHaveLength(1);
  });

  it("getForcedMinPcts uses max per ministry and clamps to >=0", () => {
    const out = getForcedMinPcts([
      { effect_kind: "budget_ministry_min_pct", effect_target: "budget_education", value: 10 },
      { effect_kind: "budget_ministry_min_pct", effect_target: "budget_education", value: 15 },
      { effect_kind: "budget_ministry_min_pct", effect_target: "budget_defense", value: -5 },
    ]);
    expect(out.pct_education).toBe(15);
    expect(out.pct_defense).toBe(0);
  });

  it("getAllocationCapPercent sums all caps", () => {
    expect(getAllocationCapPercent([{ effect_kind: "budget_allocation_cap", value: 10 }, { effect_kind: "x", value: 999 }])).toBe(110);
    expect(getAllocationCapPercent([{ effect_kind: "budget_allocation_cap", value: -25 }])).toBe(75);
  });

  it("getUnitExtraEffectSum ignores expired (duration_remaining<=0 unless permanent)", () => {
    const effects = [
      { effect_kind: "military_unit_extra", effect_target: "u1", value: 2, duration_kind: "days", duration_remaining: 1 },
      { effect_kind: "military_unit_extra", effect_target: "u1", value: 5, duration_kind: "days", duration_remaining: 0 },
      { effect_kind: "military_unit_extra", effect_target: "u1", value: 3, duration_kind: "permanent", duration_remaining: 0 },
      { effect_kind: "military_unit_extra", effect_target: "u2", value: 99, duration_kind: "days", duration_remaining: 1 },
    ];
    expect(getUnitExtraEffectSum(effects, "u1")).toBe(5);
  });

  it("getSubTypeLimitModifierPercent sums only matching key", () => {
    const key = `terre${SUB_TYPE_TARGET_SEP}infanterie`;
    const effects = [
      { effect_kind: "military_unit_limit_modifier_sub_type", effect_target: key, value: 10, duration_kind: "days", duration_remaining: 1 },
      { effect_kind: "military_unit_limit_modifier_sub_type", effect_target: key, value: -2, duration_kind: "permanent", duration_remaining: 0 },
      { effect_kind: "military_unit_limit_modifier_sub_type", effect_target: `terre${SUB_TYPE_TARGET_SEP}artillerie`, value: 999, duration_kind: "days", duration_remaining: 1 },
    ];
    expect(getSubTypeLimitModifierPercent(effects, "terre", "infanterie")).toBe(8);
  });

  it("getSubTypeLimitModifierPercent : casse roster vs règle (Infanterie / infanterie)", () => {
    const key = `terre${SUB_TYPE_TARGET_SEP}infanterie`;
    const effects = [
      { effect_kind: "military_unit_limit_modifier_sub_type", effect_target: key, value: 75, duration_kind: "days", duration_remaining: 1 },
    ];
    expect(getSubTypeLimitModifierPercent(effects, "terre", "Infanterie")).toBe(75);
  });

  it("getEffectiveMilitaryUnitCount : % branche × % sous-type (ex. mobilisation)", () => {
    const effects = [
      { effect_kind: "military_unit_limit_modifier", effect_target: "terre", value: 75, duration_kind: "days", duration_remaining: 1 },
      {
        effect_kind: "military_unit_limit_modifier_sub_type",
        effect_target: `terre${SUB_TYPE_TARGET_SEP}infanterie`,
        value: 75,
        duration_kind: "days",
        duration_remaining: 1,
      },
    ];
    expect(getEffectiveMilitaryUnitCount(effects, "unit-1", "terre", "Infanterie", 10)).toBe(31);
  });

  it("getInfluenceModifiersFromEffects multiplies per subtype and ignores inactive", () => {
    const effects = [
      { effect_kind: "influence_modifier_global", value: 1.1, duration_kind: "days", duration_remaining: 1 },
      { effect_kind: "influence_modifier_gdp", value: 1.2, duration_kind: "days", duration_remaining: 1 },
      { effect_kind: "influence_modifier_gdp", value: 2, duration_kind: "days", duration_remaining: 0 },
    ];
    const isActive = (e: { duration_remaining?: number; duration_kind?: string }) =>
      e.duration_kind === "permanent" || (e.duration_remaining ?? 0) > 0;
    const out = getInfluenceModifiersFromEffects(effects, isActive);
    expect(out.global).toBeCloseTo(1.1);
    expect(out.gdp).toBeCloseTo(1.2);
  });

  it("getDefaultTargetForKind returns null when no target needed", () => {
    expect(getDefaultTargetForKind("gdp_growth_base")).toBeNull();
    expect(getDefaultTargetForKind("stat_delta")).toBe("militarism");
  });

  it("isEffectDisplayPositive: min_pct is always negative display; influence uses multiplier >1", () => {
    expect(isEffectDisplayPositive({ effect_kind: "budget_ministry_min_pct", value: 10 } as any)).toBe(false);
    expect(isEffectDisplayPositive({ effect_kind: "influence_modifier_global", value: 1.0 } as any)).toBe(false);
    expect(isEffectDisplayPositive({ effect_kind: "influence_modifier_global", value: 1.01 } as any)).toBe(true);
  });

  it("getEffectDescription includes targets and value formatting", () => {
    const desc = getEffectDescription(
      { effect_kind: "military_unit_extra", effect_target: "u1", value: 2 } as any,
      { rosterUnitName: (id) => (id === "u1" ? "Char" : null) }
    );
    expect(desc).toContain("Char");
    expect(desc).toContain("+2");
  });
});

