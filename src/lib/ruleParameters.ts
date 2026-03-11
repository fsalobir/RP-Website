/**
 * Libellés français et regroupement des paramètres de règles (rule_parameters).
 * Les clés en base restent en anglais ; l’affichage utilise ces libellés.
 */

export const RULE_KEY_LABELS: Record<string, string> = {
  global_growth_effects: "Global (appliqué à tous les pays)",
  budget_etat: "Ministère d'État",
  budget_education: "Ministère de l'Éducation",
  budget_recherche: "Ministère de la Recherche",
  budget_infrastructure: "Ministère de l'Infrastructure",
  budget_sante: "Ministère de la Santé",
  budget_industrie: "Ministère de l'Industrie",
  budget_defense: "Ministère de la Défense",
  budget_interieur: "Ministère de l'Intérieur",
  budget_affaires_etrangeres: "Ministère des Affaires étrangères",
  world_date: "Date du monde",
  world_date_advance_months: "Mois par mise à jour (temporalité)",
  cron_paused: "Jeu en pause (cron désactivé)",
  ideology_config: "Configuration idéologique",
};

export type RuleSection = {
  title: string;
  keys: string[];
};

/** Regroupement pour l’admin (croissance globale gérée par la section dédiée global_growth_effects). */
export const RULE_SECTIONS: RuleSection[] = [
  {
    title: "Budget d'état (ministères)",
    keys: [
      "budget_etat",
      "budget_education",
      "budget_recherche",
      "budget_infrastructure",
      "budget_sante",
      "budget_industrie",
      "budget_defense",
      "budget_interieur",
      "budget_affaires_etrangeres",
    ],
  },
];

/** Clés des ministères budget (pour rendu structuré). */
export const BUDGET_MINISTRY_KEYS = [
  "budget_etat",
  "budget_education",
  "budget_recherche",
  "budget_infrastructure",
  "budget_sante",
  "budget_industrie",
  "budget_defense",
  "budget_interieur",
  "budget_affaires_etrangeres",
];

/** Libellés des ministères budget. */
export const BUDGET_MINISTRY_LABELS: Record<string, string> = {
  budget_etat: "Ministère d'État",
  budget_education: "Ministère de l'Éducation",
  budget_recherche: "Ministère de la Recherche",
  budget_infrastructure: "Ministère de l'Infrastructure",
  budget_sante: "Ministère de la Santé",
  budget_industrie: "Ministère de l'Industrie",
  budget_defense: "Ministère de la Défense",
  budget_interieur: "Ministère de l'Intérieur",
  budget_affaires_etrangeres: "Ministère des Affaires étrangères",
};

/** Types d’effet budget (agrégats : population, PIB, stats). */
export const BUDGET_EFFECT_TYPE_IDS = [
  "population",
  "gdp",
  "militarism",
  "industry",
  "science",
  "stability",
] as const;
export type BudgetMinistryEffectType = (typeof BUDGET_EFFECT_TYPE_IDS)[number];

/** Un type d’effet avec libellé FR et défaut pour gravity_applies (true pour stats, false pour pop/gdp). */
export const BUDGET_EFFECT_TYPES: { id: BudgetMinistryEffectType; label: string; defaultGravityApplies: boolean }[] = [
  { id: "population", label: "Population", defaultGravityApplies: false },
  { id: "gdp", label: "PIB", defaultGravityApplies: false },
  { id: "militarism", label: "Militarisme", defaultGravityApplies: true },
  { id: "industry", label: "Industrie", defaultGravityApplies: true },
  { id: "science", label: "Science", defaultGravityApplies: true },
  { id: "stability", label: "Stabilité", defaultGravityApplies: true },
];

export const BUDGET_EFFECT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  BUDGET_EFFECT_TYPES.map((t) => [t.id, t.label])
);

/** Une ligne d’effet configurable par ministère (stockée dans rule_parameters.value.effects). */
export type BudgetMinistryEffectDef = {
  effect_type: BudgetMinistryEffectType;
  bonus: number;
  malus: number;
  /** Si true, appliquer le facteur gravité (moyenne mondiale vs pays). Défaut selon le type. */
  gravity_applies?: boolean;
};

/**
 * Pour chaque ministère, liste des effets (bonus max/jour). Fallback pour rétrocompat quand value.effects est absent.
 */
export const BUDGET_MINISTRY_EFFECTS: Record<string, { key: string; label: string }[]> = {
  budget_etat: [{ key: "actions", label: "Actions d'état" }],
  budget_education: [
    { key: "science", label: "Science" },
    { key: "stability", label: "Stabilité" },
  ],
  budget_recherche: [{ key: "science", label: "Science" }],
  budget_infrastructure: [
    { key: "gdp", label: "PIB" },
    { key: "industry", label: "Industrie" },
  ],
  budget_sante: [{ key: "population", label: "Population" }],
  budget_industrie: [{ key: "industry", label: "Industrie" }],
  budget_defense: [{ key: "militarism", label: "Militarisme" }],
  budget_interieur: [{ key: "stability", label: "Stabilité" }],
  budget_affaires_etrangeres: [
    { key: "stability", label: "Stabilité" },
    { key: "gdp", label: "PIB" },
  ],
};

export type BudgetMinistryValue = {
  min_pct?: number;
  /** @deprecated Utiliser maluses par effet à la place. Conservé pour affichage / rétrocompat. */
  max_malus?: number;
  gravity_pct?: number;
  /** Bonus / jour par effet quand allocation >= min_pct. Rétrocompat si effects absent. */
  bonuses?: Record<string, number>;
  /** Malus / jour par effet quand allocation < min_pct. Rétrocompat si effects absent. */
  maluses?: Record<string, number>;
  /** Liste d’effets configurables (prioritaire sur bonuses/maluses). */
  effects?: BudgetMinistryEffectDef[];
};

/**
 * Retourne la liste d’effets pour un ministère : value.effects si présent, sinon dérivée de bonuses / BUDGET_MINISTRY_EFFECTS.
 */
export function getEffectsListForMinistry(
  ministryKey: string,
  value: BudgetMinistryValue | null | undefined
): BudgetMinistryEffectDef[] {
  const numBonus = (v: unknown) => { const n = Number(v); return typeof n === "number" && !Number.isNaN(n) ? n : 0; };
  const numMalus = (v: unknown) => { const n = Number(v); return typeof n === "number" && !Number.isNaN(n) ? n : -0.05; };
  if (value?.effects && value.effects.length > 0) {
    return value.effects.map((e) => ({
      effect_type: e.effect_type,
      bonus: numBonus(e.bonus),
      malus: numMalus(e.malus),
      gravity_applies: e.gravity_applies ?? BUDGET_EFFECT_TYPES.find((t) => t.id === e.effect_type)?.defaultGravityApplies ?? false,
    }));
  }
  const fallbackList = BUDGET_MINISTRY_EFFECTS[ministryKey] ?? [];
  const bonuses = value?.bonuses ?? {};
  const maluses = value?.maluses ?? {};
  return fallbackList
    .filter(({ key }) => BUDGET_EFFECT_TYPE_IDS.includes(key as BudgetMinistryEffectType))
    .map(({ key }) => ({
      effect_type: key as BudgetMinistryEffectType,
      bonus: numBonus(bonuses[key]),
      malus: numMalus(maluses[key]),
      gravity_applies: BUDGET_EFFECT_TYPES.find((t) => t.id === key)?.defaultGravityApplies ?? false,
    }));
}

export function getRuleLabel(key: string): string {
  return RULE_KEY_LABELS[key] ?? key;
}
