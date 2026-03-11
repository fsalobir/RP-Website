/**
 * Registre central des lois (mobilisation + lois sectorielles).
 * Source unique de vérité pour les clés, libellés et rule_parameter keys.
 */

export type LawLevel = { key: string; label: string };

export type LawDefinition = {
  lawKey: string;
  title_fr: string;
  configRuleKey: string;
  effectsRuleKey: string;
  levels: LawLevel[];
};

export const LAW_DEFINITIONS: LawDefinition[] = [
  {
    lawKey: "mobilisation",
    title_fr: "Mobilisation",
    configRuleKey: "mobilisation_config",
    effectsRuleKey: "mobilisation_level_effects",
    levels: [
      { key: "level_1", label: "Démobilisation" },
      { key: "level_2", label: "Réserve Active" },
      { key: "level_3", label: "Mobilisation Partielle" },
      { key: "level_4", label: "Mobilisation Générale" },
      { key: "level_5", label: "Guerre Patriotique" },
    ],
  },
  {
    lawKey: "auto_industry",
    title_fr: "Industrie Automobile",
    configRuleKey: "law_auto_industry_config",
    effectsRuleKey: "law_auto_industry_level_effects",
    levels: [
      { key: "level_1", label: "Exclusivement véhicules civils" },
      { key: "level_2", label: "Véhicules Civils + Prototypes Militaires" },
      { key: "level_3", label: "Branches militaires dédiées" },
      { key: "level_4", label: "Véhicules Militaires majoritaires" },
      { key: "level_5", label: "Exclusivement Véhicules Militaires" },
    ],
  },
  {
    lawKey: "air_industry",
    title_fr: "Industrie Aéronautique",
    configRuleKey: "law_air_industry_config",
    effectsRuleKey: "law_air_industry_level_effects",
    levels: [
      { key: "level_1", label: "Exclusivement Avions civils" },
      { key: "level_2", label: "Avions Civils + Prototypes Militaires" },
      { key: "level_3", label: "Branches militaires dédiées" },
      { key: "level_4", label: "Avions de combat majoritaires" },
      { key: "level_5", label: "Exclusivement Aviation de Combat" },
    ],
  },
  {
    lawKey: "naval_industry",
    title_fr: "Industrie Navale",
    configRuleKey: "law_naval_industry_config",
    effectsRuleKey: "law_naval_industry_level_effects",
    levels: [
      { key: "level_1", label: "Exclusivement Marine Marchande" },
      { key: "level_2", label: "Marine Marchande + Navires Légers" },
      { key: "level_3", label: "Arsenaux Militaires Dédiés" },
      { key: "level_4", label: "Marine de Guerre Majoritaire" },
      { key: "level_5", label: "Exclusivement Marine de Guerre" },
    ],
  },
  {
    lawKey: "research",
    title_fr: "Recherche",
    configRuleKey: "law_research_config",
    effectsRuleKey: "law_research_level_effects",
    levels: [
      { key: "level_1", label: "Exclusivement Civile" },
      { key: "level_2", label: "Rares projets militaires" },
      { key: "level_3", label: "Recherche Militaire Gouvernementale" },
      { key: "level_4", label: "Projets Militaires majoritaires" },
      { key: "level_5", label: "Exclusivement Projets Militaires" },
    ],
  },
];

export const ALL_LAW_KEYS = LAW_DEFINITIONS.map((d) => d.lawKey);

export function getLawDefinition(lawKey: string): LawDefinition | undefined {
  return LAW_DEFINITIONS.find((d) => d.lawKey === lawKey);
}

export function getLawLevelKeyFromScore(
  score: number,
  thresholds: Record<string, number> | undefined,
  levels: LawLevel[]
): string {
  if (!thresholds) return levels[0]?.key ?? "level_1";
  let best = levels[0]?.key ?? "level_1";
  let bestVal = -1;
  for (const lvl of levels) {
    const t = thresholds[lvl.key] ?? 0;
    if (t <= score && t >= bestVal) {
      best = lvl.key;
      bestVal = t;
    }
  }
  return best;
}

export function getLawLevelLabel(lawKey: string, levelKey: string | null | undefined): string {
  if (!levelKey) return "—";
  const def = getLawDefinition(lawKey);
  if (!def) return levelKey;
  return def.levels.find((l) => l.key === levelKey)?.label ?? levelKey;
}

export type CountryLawRow = {
  country_id: string;
  law_key: string;
  score: number;
  target_score: number;
};

export type LawConfig = {
  level_thresholds?: Record<string, number>;
  daily_step?: number;
};

export type LawLevelEffect = {
  level: string;
  effect_kind: string;
  effect_target: string | null;
  value: number;
};

/**
 * Resolve law level effects for a country across all laws.
 * Returns a flat array of effects (effect_kind, effect_target, value)
 * ready to inject into the effect resolution context.
 *
 * Évolution prévue : accepter un contexte élargi (stats du pays) pour
 * calculer des effets dont la valeur dépend d'une stat (multiplicateur).
 * Ex. valeur_effective = value × (country_stat / 10).
 * Quand ce besoin sera activé, ajouter un paramètre optionnel `countryStats`
 * et appliquer le multiplicateur ici avant de push dans `out`.
 */
export function resolveAllLawEffectsForCountry(
  countryLawRows: CountryLawRow[],
  ruleParametersByKey: Record<string, { value: unknown }>
): Array<{ effect_kind: string; effect_target: string | null; value: number }> {
  const out: Array<{ effect_kind: string; effect_target: string | null; value: number }> = [];

  for (const def of LAW_DEFINITIONS) {
    const lawRow = countryLawRows.find((r) => r.law_key === def.lawKey);
    if (!lawRow) continue;

    const config = ruleParametersByKey[def.configRuleKey]?.value as LawConfig | undefined;
    const levelKey = getLawLevelKeyFromScore(lawRow.score, config?.level_thresholds, def.levels);

    const allEffects = ruleParametersByKey[def.effectsRuleKey]?.value;
    if (!Array.isArray(allEffects)) continue;

    for (const e of allEffects) {
      if (
        e &&
        typeof e === "object" &&
        typeof (e as LawLevelEffect).level === "string" &&
        (e as LawLevelEffect).level === levelKey &&
        typeof (e as LawLevelEffect).effect_kind === "string" &&
        typeof (e as LawLevelEffect).value === "number"
      ) {
        out.push({
          effect_kind: (e as LawLevelEffect).effect_kind,
          effect_target: (e as LawLevelEffect).effect_target ?? null,
          value: Number((e as LawLevelEffect).value),
        });
      }
    }
  }

  return out;
}

/**
 * Get effects for a specific level of a specific law (for display purposes).
 */
export function getLawEffectsForLevel(
  lawKey: string,
  levelKey: string,
  ruleParametersByKey: Record<string, { value: unknown }>
): Array<{ effect_kind: string; effect_target: string | null; value: number }> {
  const def = getLawDefinition(lawKey);
  if (!def) return [];
  const allEffects = ruleParametersByKey[def.effectsRuleKey]?.value;
  if (!Array.isArray(allEffects)) return [];
  return allEffects
    .filter(
      (e: unknown): e is LawLevelEffect =>
        e != null &&
        typeof (e as LawLevelEffect).level === "string" &&
        (e as LawLevelEffect).level === levelKey &&
        typeof (e as LawLevelEffect).effect_kind === "string" &&
        typeof (e as LawLevelEffect).value === "number"
    )
    .map((e) => ({
      effect_kind: e.effect_kind,
      effect_target: e.effect_target ?? null,
      value: Number(e.value),
    }));
}
