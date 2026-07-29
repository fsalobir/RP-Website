import { describe, expect, it } from "vitest";
import {
  computePowerBalanceModifier,
  computeRelationModifier,
  computeStatModifierBreakdown,
  getPowerBalanceConfig,
} from "@/lib/stateActionModifiers";

describe("state action modifiers", () => {
  const config = getPowerBalanceConfig({
    equilibre_des_forces: {
      ratio_equilibre: 1,
      ratio_min: 0.5,
      ratio_max: 2,
      malus_max: 20,
      bonus_max: 20,
    },
  });

  it("keeps the existing relation and power-balance calculation", () => {
    expect(computeRelationModifier(-40, 30)).toBe(-12);
    expect(computePowerBalanceModifier(0.5, config)).toBe(-20);
    expect(computePowerBalanceModifier(0.75, config)).toBe(-10);
    expect(computePowerBalanceModifier(1, config)).toBe(0);
    expect(computePowerBalanceModifier(1.5, config)).toBe(10);
    expect(computePowerBalanceModifier(2, config)).toBe(20);
  });

  it("keeps the stat interpolation used by dice rolls", () => {
    expect(
      computeStatModifierBreakdown(
        { militarism: { min: -10, max: 20 }, stability: { min: -6, max: 6 } },
        { militarism: 5, stability: 0 }
      )
    ).toEqual({
      total: 5,
      byStat: { militarism: 5, stability: 0 },
    });
  });
});
