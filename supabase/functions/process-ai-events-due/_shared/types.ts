export type MilitaryBranch = "terre" | "air" | "mer" | "strategique";

export interface DiceRollResult {
  roll: number;
  modifier: number;
  total: number;
  success?: boolean;
  stat_modifiers?: Record<string, number>;
  admin_modifier?: number;
  relation_modifier?: number;
  influence_modifier?: number;
}

export interface DiceResults {
  success_roll?: DiceRollResult;
  impact_roll?: DiceRollResult;
  admin_modifiers?: Array<{ label: string; value: number }>;
}

export interface AdminEffectAdded {
  name: string;
  effect_kind: string;
  effect_target: string | null;
  effect_subtype: string | null;
  value: number;
  duration_kind: string;
  duration_remaining: number;
  application?: "duration" | "immediate";
}
