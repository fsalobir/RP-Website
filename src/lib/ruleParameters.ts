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
];

export function getRuleLabel(key: string): string {
  return RULE_KEY_LABELS[key] ?? key;
}
