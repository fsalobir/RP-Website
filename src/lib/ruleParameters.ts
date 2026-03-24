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
  budget_procuration_militaire: "Procuration Militaire",
  etat_major_config: "État Major",
  world_date: "Date du monde",
  world_date_advance_months: "Mois par mise à jour (temporalité)",
  cron_paused: "Jeu en pause (cron désactivé)",
  ideology_config: "Configuration idéologique",
  ideology_effects: "Effets par idéologie (hexagone)",
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
      "budget_procuration_militaire",
    ],
  },
];

/** Section État Major (config min/max points par tick). */
export const ETAT_MAJOR_CONFIG_KEYS = ["etat_major_config"] as const;

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
  "budget_procuration_militaire",
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
  budget_procuration_militaire: "Procuration Militaire",
};

/** Types d’effet budget classiques (population, PIB, stats société). */
export const BUDGET_STAT_EFFECT_TYPE_IDS = [
  "population",
  "gdp",
  "militarism",
  "industry",
  "science",
  "stability",
] as const;
export type BudgetStatEffectType = (typeof BUDGET_STAT_EFFECT_TYPE_IDS)[number];

/** Relations bilatérales + vitesse État-major (cron + admin). */
export const BUDGET_EXTENDED_EFFECT_TYPE_IDS = [
  "bilateral_relations",
  "etat_major_design",
  "etat_major_recrutement",
  "etat_major_procuration",
  "etat_major_stock",
] as const;
export type BudgetExtendedEffectType = (typeof BUDGET_EXTENDED_EFFECT_TYPE_IDS)[number];

/** Tous les types d’effet configurables dans `value.effects` d’un ministère. */
export const BUDGET_EFFECT_TYPE_IDS = [
  ...BUDGET_STAT_EFFECT_TYPE_IDS,
  ...BUDGET_EXTENDED_EFFECT_TYPE_IDS,
] as const;
export type BudgetMinistryEffectType = (typeof BUDGET_EFFECT_TYPE_IDS)[number];

export type BilateralRelationScope = "world" | "same_continent" | "neighbors";

/** Un type d’effet avec libellé FR et défaut pour gravity_applies. */
export const BUDGET_EFFECT_TYPES: { id: BudgetMinistryEffectType; label: string; defaultGravityApplies: boolean }[] = [
  { id: "population", label: "Population", defaultGravityApplies: false },
  { id: "gdp", label: "PIB", defaultGravityApplies: false },
  { id: "militarism", label: "Militarisme", defaultGravityApplies: true },
  { id: "industry", label: "Industrie", defaultGravityApplies: true },
  { id: "science", label: "Science", defaultGravityApplies: true },
  { id: "stability", label: "Stabilité", defaultGravityApplies: true },
  { id: "bilateral_relations", label: "Relations bilatérales (portée + plage)", defaultGravityApplies: false },
  { id: "etat_major_design", label: "État-major — vitesse Bureau de design", defaultGravityApplies: true },
  { id: "etat_major_recrutement", label: "État-major — vitesse Recrutement", defaultGravityApplies: true },
  { id: "etat_major_procuration", label: "État-major — vitesse Procuration", defaultGravityApplies: true },
  { id: "etat_major_stock", label: "État-major — vitesse Stock stratégique", defaultGravityApplies: true },
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
  /** Uniquement si effect_type === bilateral_relations */
  relation_scope?: BilateralRelationScope;
  relation_band_min?: number;
  relation_band_max?: number;
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
  budget_procuration_militaire: [{ key: "procuration", label: "Points Procuration (État Major)" }],
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
    return value.effects.map((e) => {
      const meta = BUDGET_EFFECT_TYPES.find((t) => t.id === e.effect_type);
      const base: BudgetMinistryEffectDef = {
        effect_type: e.effect_type,
        bonus: numBonus(e.bonus),
        malus: numMalus(e.malus),
        gravity_applies: e.gravity_applies ?? meta?.defaultGravityApplies ?? false,
      };
      if (e.effect_type === "bilateral_relations") {
        const scope = (e as BudgetMinistryEffectDef).relation_scope;
        const validScope: BilateralRelationScope =
          scope === "same_continent" || scope === "neighbors" ? scope : "world";
        const bmin = Number((e as BudgetMinistryEffectDef).relation_band_min);
        const bmax = Number((e as BudgetMinistryEffectDef).relation_band_max);
        return {
          ...base,
          relation_scope: validScope,
          relation_band_min: Number.isFinite(bmin) ? Math.max(-100, Math.min(100, Math.round(bmin))) : -100,
          relation_band_max: Number.isFinite(bmax) ? Math.max(-100, Math.min(100, Math.round(bmax))) : 100,
        };
      }
      return base;
    });
  }
  const fallbackList = BUDGET_MINISTRY_EFFECTS[ministryKey] ?? [];
  const bonuses = value?.bonuses ?? {};
  const maluses = value?.maluses ?? {};
  return fallbackList
    .filter(({ key }) => BUDGET_STAT_EFFECT_TYPE_IDS.includes(key as BudgetStatEffectType))
    .map(({ key }) => ({
      effect_type: key as BudgetMinistryEffectType,
      bonus: numBonus(bonuses[key]),
      malus: numMalus(maluses[key]),
      gravity_applies: BUDGET_EFFECT_TYPES.find((t) => t.id === key)?.defaultGravityApplies ?? false,
    }));
}

/** Contribution brute budget (même formule que le CTE `bc` SQL du cron). */
export function budgetMinistryRawContrib(pct: number, minPct: number, bonus: number, malus: number): number {
  const min = Math.max(0, minPct);
  if (pct >= min) return (pct / 100) * bonus;
  return ((min - pct) / Math.max(min, 1e-9)) * malus;
}

/** Réplique de `public.cron_gravity_factor` pour prévisions UI (TypeScript). */
export function cronGravityFactorTs(c: number, ga: boolean, gp: number, av: number, cv: number): number {
  if (!ga) return c;
  const avSafe = av === 0 ? 1e-9 : av;
  const signC = c >= 0 ? 1 : -1;
  const term =
    1 +
    (gp / 100) *
      (((av - cv) / avSafe) * ((1 + signC) / 2) + ((cv - av) / avSafe) * ((1 - signC) / 2));
  const clamped = Math.max(0.1, Math.min(2, term));
  return c * clamped;
}

/** Stat monde vs pays pour la gravité selon le type d’effet (aligné sur le cron SQL). */
export function budgetEffectGravityStatPair(
  effectType: string,
  world: { pop: number; gdp: number; mil: number; ind: number; sci: number; stab: number },
  country: { population: number; gdp: number; militarism: number; industry: number; science: number; stability: number }
): { avg: number; cv: number } {
  switch (effectType) {
    case "population":
      return { avg: world.pop, cv: country.population };
    case "gdp":
    case "etat_major_procuration":
    case "bilateral_relations":
      return { avg: world.gdp, cv: country.gdp };
    case "militarism":
    case "etat_major_recrutement":
      return { avg: world.mil, cv: country.militarism };
    case "industry":
    case "etat_major_design":
      return { avg: world.ind, cv: country.industry };
    case "science":
    case "etat_major_stock":
      return { avg: world.sci, cv: country.science };
    case "stability":
      return { avg: world.stab, cv: country.stability };
    default:
      return { avg: world.gdp, cv: country.gdp };
  }
}

/** Champ `pct_*` dans `country_budget` / état local budget pour chaque ministère (clé rule_parameters). */
export const BUDGET_MINISTRY_TO_PCT_KEY: Record<string, string> = {
  budget_etat: "pct_etat",
  budget_education: "pct_education",
  budget_recherche: "pct_recherche",
  budget_infrastructure: "pct_infrastructure",
  budget_sante: "pct_sante",
  budget_industrie: "pct_industrie",
  budget_defense: "pct_defense",
  budget_interieur: "pct_interieur",
  budget_affaires_etrangeres: "pct_affaires_etrangeres",
  budget_procuration_militaire: "pct_procuration_militaire",
};

export const BILATERAL_RELATION_SCOPE_LABELS: Record<BilateralRelationScope, string> = {
  world: "Monde (tous les pays)",
  same_continent: "Même continent",
  neighbors: "Voisins (carte)",
};

export function budgetMinistryFinalContrib(
  pct: number,
  minPct: number,
  bonus: number,
  malus: number,
  gravityApplies: boolean,
  gravityPct: number,
  effectType: string,
  world: { pop: number; gdp: number; mil: number; ind: number; sci: number; stab: number },
  country: { population: number; gdp: number; militarism: number; industry: number; science: number; stability: number }
): number {
  const raw = budgetMinistryRawContrib(pct, minPct, bonus, malus);
  const { avg, cv } = budgetEffectGravityStatPair(effectType, world, country);
  return cronGravityFactorTs(raw, gravityApplies, gravityPct, avg, cv);
}

/** Somme des bonus budget ministères pour les quatre vitesse État-major (aligné cron / gravité). */
export function sumEtatMajorBudgetBonusesFromRules(
  ruleParametersByKey: Record<string, { value: unknown } | undefined>,
  budgetPctByField: Record<string, number>,
  worldAvgs: { pop_avg: number; gdp_avg: number; mil_avg: number; ind_avg: number; sci_avg: number; stab_avg: number } | null,
  country: { population: number; gdp: number; militarism: number; industry: number; science: number; stability: number }
): { em_design_bonus: number; em_rec_bonus: number; em_proc_bonus: number; em_stock_bonus: number } {
  const world = worldAvgs ?? {
    pop_avg: country.population,
    gdp_avg: country.gdp,
    mil_avg: country.militarism,
    ind_avg: country.industry,
    sci_avg: country.science,
    stab_avg: country.stability,
  };
  const w = { pop: world.pop_avg, gdp: world.gdp_avg, mil: world.mil_avg, ind: world.ind_avg, sci: world.sci_avg, stab: world.stab_avg };
  const sums = { em_design_bonus: 0, em_rec_bonus: 0, em_proc_bonus: 0, em_stock_bonus: 0 };
  for (const mk of BUDGET_MINISTRY_KEYS) {
    const pctKey = BUDGET_MINISTRY_TO_PCT_KEY[mk];
    const pct = pctKey ? Number(budgetPctByField[pctKey] ?? 0) : 0;
    const rule = ruleParametersByKey[mk];
    const val = rule?.value as BudgetMinistryValue | undefined;
    const effects = getEffectsListForMinistry(mk, val);
    const minPct = val?.min_pct ?? 5;
    const gravPct = val?.gravity_pct ?? 50;
    for (const eff of effects) {
      const t = eff.effect_type;
      if (
        t !== "etat_major_design" &&
        t !== "etat_major_recrutement" &&
        t !== "etat_major_procuration" &&
        t !== "etat_major_stock"
      ) {
        continue;
      }
      const fc = budgetMinistryFinalContrib(
        pct,
        minPct,
        eff.bonus,
        eff.malus,
        eff.gravity_applies ?? true,
        gravPct,
        t,
        w,
        country
      );
      if (t === "etat_major_design") sums.em_design_bonus += fc;
      else if (t === "etat_major_recrutement") sums.em_rec_bonus += fc;
      else if (t === "etat_major_procuration") sums.em_proc_bonus += fc;
      else sums.em_stock_bonus += fc;
    }
  }
  return sums;
}

export function getRuleLabel(key: string): string {
  return RULE_KEY_LABELS[key] ?? key;
}
