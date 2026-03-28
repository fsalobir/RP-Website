/**
 * Libellés et formatage des valeurs pour la règle `ideology_effects` uniquement
 * (page /ideologie + admin Règles → Idéologie). Le reste de l’app utilise countryEffects tel quel.
 */

import {
  EFFECT_KIND_LABELS,
  formatEffectValue,
  getEffectKindOptionGroups,
  getEffectKindValueHelper,
  type EffectKindOptionGroup,
} from "@/lib/countryEffects";

const IDEOLOGY_EFFECTS_KIND_LABEL_OVERRIDES: Record<string, string> = {
  recrutement_bonus_percent: "Vitesse de Recrutement (%)",
  design_bonus_percent: "Vitesse de Design (%)",
  procuration_bonus_percent: "Vitesse de Procuration (%)",
  budget_ministry_effect_multiplier: "Efficacité Ministère",
};

export function getIdeologyEffectsKindLabel(effectKind: string): string {
  return IDEOLOGY_EFFECTS_KIND_LABEL_OVERRIDES[effectKind] ?? EFFECT_KIND_LABELS[effectKind] ?? effectKind;
}

/** Valeur affichée pour un effet configuré dans ideology_effects (ex. signe explicite pour efficacité ministère). */
export function formatIdeologyEffectsEffectValue(effectKind: string, value: number): string {
  if (effectKind === "budget_ministry_effect_multiplier") {
    const pct = value * 100 - 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)} %`;
  }
  return formatEffectValue(effectKind, value);
}

export function getIdeologyEffectKindOptionGroups(allowedKinds: readonly string[]): EffectKindOptionGroup[] {
  const groups = getEffectKindOptionGroups(allowedKinds);
  return groups.map((g) => ({
    ...g,
    options: g.options.map((o) => ({
      ...o,
      label: IDEOLOGY_EFFECTS_KIND_LABEL_OVERRIDES[o.id] ?? o.label,
    })),
  }));
}

/** Helper formulaire « Effets par idéologie » : libellé de champ valeur clarifié pour l’efficacité ministère. */
export function getIdeologyEffectFormValueHelper(effectKind: string) {
  const base = getEffectKindValueHelper(effectKind);
  if (effectKind === "budget_ministry_effect_multiplier") {
    return { ...base, valueLabel: "% (+/-)" };
  }
  return base;
}
