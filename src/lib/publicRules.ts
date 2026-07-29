import { LAW_DEFINITIONS } from "@/lib/laws";
import {
  BUDGET_EFFECT_TYPE_LABELS,
  BUDGET_MINISTRY_EFFECTS,
  BUDGET_MINISTRY_KEYS,
  BUDGET_MINISTRY_LABELS,
  getEffectsListForMinistry,
  type BudgetMinistryValue,
} from "@/lib/ruleParameters";

export type PublicRuleRow = { key: string; value: unknown };

export function ruleObject(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function ruleNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildPublicRulesModel(rules: PublicRuleRow[]) {
  const values = Object.fromEntries(rules.map((rule) => [rule.key, rule.value]));

  const budgets = BUDGET_MINISTRY_KEYS.map((key) => {
    const value = ruleObject(values[key]) as BudgetMinistryValue;
    const configuredEffects = getEffectsListForMinistry(key, value).map(
      (effect) => BUDGET_EFFECT_TYPE_LABELS[effect.effect_type] ?? effect.effect_type
    );
    const fallbackEffects = (BUDGET_MINISTRY_EFFECTS[key] ?? []).map((effect) => effect.label);

    return {
      key,
      title: BUDGET_MINISTRY_LABELS[key] ?? key,
      minPct: ruleNumber(value.min_pct),
      effects: configuredEffects.length > 0 ? configuredEffects : fallbackEffects,
    };
  });

  const laws = LAW_DEFINITIONS.map((law) => {
    const config = ruleObject(values[law.configRuleKey]);
    const effects = values[law.effectsRuleKey];

    return {
      key: law.lawKey,
      title: law.title_fr,
      dailyStep: ruleNumber(config.daily_step),
      effectCount: Array.isArray(effects) ? effects.length : 0,
      levels: law.levels.map((level) => level.label),
    };
  });

  return { values, budgets, laws };
}
