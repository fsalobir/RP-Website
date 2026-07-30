import { describe, expect, it } from "vitest";
import { buildPublicRulesModel } from "@/lib/publicRules";

describe("buildPublicRulesModel", () => {
  it("transforme les paramètres techniques en résumés lisibles", () => {
    const model = buildPublicRulesModel([
      { key: "budget_etat", value: { min_pct: 25, bonuses: { actions: 0.01 } } },
      { key: "mobilisation_config", value: { daily_step: 20 } },
      {
        key: "mobilisation_level_effects",
        value: [{ level: "level_1" }, { level: "level_2" }],
      },
    ]);

    expect(model.budgets[0]).toMatchObject({
      title: "Ministère d'État",
      minPct: 25,
      effects: ["Points d’action d’État"],
    });
    expect(model.laws[0]).toMatchObject({
      title: "Mobilisation",
      dailyStep: 20,
      effectCount: 2,
    });
  });
});
