/**
 * Libellés français et regroupement des paramètres de règles (rule_parameters).
 * Les clés en base restent en anglais ; l’affichage utilise ces libellés.
 */

export const RULE_KEY_LABELS: Record<string, string> = {
  gdp_growth_base_rate: "Croissance économique basique",
  population_growth_base_rate: "Croissance démographique basique",
  gdp_growth_per_militarism: "Militarisme",
  gdp_growth_per_industry: "Industrie",
  gdp_growth_per_science: "Science",
  gdp_growth_per_stability: "Stabilité",
  population_growth_per_militarism: "Militarisme",
  population_growth_per_industry: "Industrie",
  population_growth_per_science: "Science",
  population_growth_per_stability: "Stabilité",
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

export type RuleSection = {
  title: string;
  keys: string[];
};

/** Ordre et regroupement pour l’admin : base, puis PIB par stat, puis démo par stat. */
export const RULE_SECTIONS: RuleSection[] = [
  { title: "Croissance économique basique", keys: ["gdp_growth_base_rate"] },
  {
    title: "Croissance du PIB par stat",
    keys: [
      "gdp_growth_per_militarism",
      "gdp_growth_per_industry",
      "gdp_growth_per_science",
      "gdp_growth_per_stability",
    ],
  },
  { title: "Croissance démographique basique", keys: ["population_growth_base_rate"] },
  {
    title: "Croissance démographique par stat",
    keys: [
      "population_growth_per_militarism",
      "population_growth_per_industry",
      "population_growth_per_science",
      "population_growth_per_stability",
    ],
  },
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

/**
 * Pour chaque ministère, liste des effets (bonus max/jour).
 * Unité des bonuses : pour les stats (science, industrie, militarism, stabilité) c'est un delta par jour
 * sur l'échelle de la stat ; pour PIB et population c'est un taux ou delta par jour (à aligner avec le cron).
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
  /** Bonus / jour par effet quand allocation >= min_pct. */
  bonuses?: Record<string, number>;
  /** Malus / jour par effet quand allocation < min_pct (même clés que bonuses). */
  maluses?: Record<string, number>;
};

export function getRuleLabel(key: string): string {
  return RULE_KEY_LABELS[key] ?? key;
}
