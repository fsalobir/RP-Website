/**
 * Calcule les valeurs attendues à la prochaine mise à jour cron (un "tick"),
 * en reprenant la logique de run_daily_country_update (moyennes mondiales + gravité).
 * Utilisé pour l’admin / debug sur la fiche pays, onglet Budget.
 */

export type WorldAverages = {
  pop_avg: number;
  gdp_avg: number;
  mil_avg: number;
  ind_avg: number;
  sci_avg: number;
  stab_avg: number;
};

export type CountrySnapshot = {
  population: number;
  gdp: number;
  militarism: number;
  industry: number;
  science: number;
  stability: number;
};

/** Pct par ministère (clés country_budget). */
export type BudgetPcts = {
  pct_sante: number;
  pct_education: number;
  pct_recherche: number;
  pct_infrastructure: number;
  pct_industrie: number;
  pct_defense: number;
  pct_interieur: number;
  pct_affaires_etrangeres: number;
};

export type CountryEffectInput = {
  effect_kind: string;
  effect_target: string | null;
  value: number;
  /** If omitted, effect is treated as still active (e.g. global/mobilisation effects). */
  duration_remaining?: number;
};

/** rule_parameters.value peut être un nombre ou un objet (budget_* = objet). */
function getNum(rules: Record<string, { value: unknown }>, key: string, fallback: number): number {
  const v = rules[key]?.value;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    const raw = (v as Record<string, unknown>)[""] ?? (v as Record<string, unknown>).value;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isNaN(n) ? fallback : n;
  }
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

type GlobalGrowthRates = { pop_global_rate: number; gdp_global_rate: number; pop_base: number; gdp_base: number; pop_from_stats: number; gdp_from_stats: number };

/** Taux PIB et population issus de global_growth_effects (même logique que le cron). */
function getGlobalGrowthRates(
  rulesByKey: Record<string, { value: unknown }>,
  country: CountrySnapshot,
): GlobalGrowthRates {
  const raw = rulesByKey["global_growth_effects"]?.value;
  const arr = Array.isArray(raw) ? raw : [];
  const mil = country.militarism ?? 0;
  const ind = country.industry ?? 0;
  const sci = country.science ?? 0;
  const stab = country.stability ?? 0;
  let pop_base = 0;
  let gdp_base = 0;
  let pop_from_stats = 0;
  let gdp_from_stats = 0;
  for (const e of arr) {
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const o = e as Record<string, unknown>;
    const kind = String(o.effect_kind ?? "");
    const target = o.effect_target != null ? String(o.effect_target) : null;
    const value = Number(o.value);
    if (Number.isNaN(value)) continue;
    const statVal = target === "militarism" ? mil : target === "industry" ? ind : target === "science" ? sci : target === "stability" ? stab : 0;
    if (kind === "gdp_growth_base") gdp_base += value;
    else if (kind === "gdp_growth_per_stat") gdp_from_stats += value * statVal;
    else if (kind === "population_growth_base") pop_base += value;
    else if (kind === "population_growth_per_stat") pop_from_stats += value * statVal;
  }
  return {
    pop_global_rate: pop_base + pop_from_stats,
    gdp_global_rate: gdp_base + gdp_from_stats,
    pop_base,
    gdp_base,
    pop_from_stats,
    gdp_from_stats,
  };
}

function getBudgetVal(
  rules: Record<string, { value: unknown }>,
  key: string,
): { min_pct: number; gravity_pct: number; bonuses: Record<string, number>; maluses: Record<string, number> } {
  const v = rules[key]?.value;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return { min_pct: 5, gravity_pct: 50, bonuses: {}, maluses: {} };
  }
  const o = v as Record<string, unknown>;
  const min_pct = Number(o.min_pct);
  const gravity_pct = Number(o.gravity_pct);
  const bonuses = (o.bonuses as Record<string, number>) ?? {};
  const maluses = (o.maluses as Record<string, number>) ?? {};
  return {
    min_pct: Number.isNaN(min_pct) ? 5 : min_pct,
    gravity_pct: Number.isNaN(gravity_pct) ? 50 : gravity_pct,
    bonuses: typeof bonuses === "object" ? bonuses : {},
    maluses: typeof maluses === "object" ? maluses : {},
  };
}

/** Facteur d’accélération/ralentissement par rapport à la moyenne. Borné à [0,1 ; 2]. Sens selon signe contribution : bonus → (moyenne - pays), malus → (pays - moyenne). */
function gravityFactorForContribution(
  worldAvg: number,
  countryVal: number,
  gravityPct: number,
  contribution: number,
): number {
  if (worldAvg === 0) return 1;
  const k = gravityPct / 100;
  const ratio = worldAvg > 0 ? (worldAvg - countryVal) / worldAvg : 0;
  const raw = contribution >= 0
    ? 1 + k * ratio
    : 1 + k * (-ratio);
  return Math.max(0.1, Math.min(2, raw));
}

/** Contribution budget d’un ministère pour un effet (bonus si pct >= min, sinon malus proportionnel). */
function ministryContribution(
  pct: number,
  minPct: number,
  bonus: number,
  malus: number,
): number {
  if (pct >= minPct) {
    return (pct / 100) * bonus;
  }
  const scale = minPct > 0 ? (minPct - pct) / minPct : 0;
  return scale * malus;
}

export type ExpectedNextTickResult = {
  population: number;
  gdp: number;
  militarism: number;
  industry: number;
  science: number;
  stability: number;
  /** Détails pour debug (taux / deltas intermédiaires). */
  inputs: {
    pop_base: number;
    gdp_base: number;
    pop_from_stats: number;
    gdp_from_stats: number;
    pop_effect_rate: number;
    gdp_effect_rate: number;
    /** Taux/jour population depuis budget (avant gravité). */
    budget_pop_rate_base: number;
    budget_pop_rate: number;
    /** Taux/jour PIB depuis budget (avant gravité, somme des ministères). */
    budget_gdp_rate_base: number;
    budget_gdp_rate: number;
    pop_total_rate: number;
    gdp_total_rate: number;
    delta_mil: number;
    delta_ind: number;
    delta_sci: number;
    delta_stab: number;
    /** Delta militarisme depuis budget (avant gravité). */
    budget_mil_base: number;
    budget_mil: number;
    /** Delta industrie depuis budget (avant gravité). */
    budget_ind_base: number;
    budget_ind: number;
    /** Delta science depuis budget (avant gravité). */
    budget_sci_base: number;
    budget_sci: number;
    /** Delta stabilité depuis budget (avant gravité). */
    budget_stab_base: number;
    budget_stab: number;
    /** Détail par ministère (libellés français) pour affichage "Détail des sources". */
    budget_pop_sources: Record<string, number>;
    budget_gdp_sources: Record<string, number>;
    budget_mil_sources: Record<string, number>;
    budget_ind_sources: Record<string, number>;
    budget_sci_sources: Record<string, number>;
    budget_stab_sources: Record<string, number>;
    /** Pour tooltip gravité : base, moyenne monde, valeur pays, param. gravité (%). Clé = même libellé que budget_*_sources. */
    budget_mil_gravity_info?: Record<string, { base: number; worldAvg: number; countryVal: number; gravityPct: number }>;
    budget_ind_gravity_info?: Record<string, { base: number; worldAvg: number; countryVal: number; gravityPct: number }>;
    budget_sci_gravity_info?: Record<string, { base: number; worldAvg: number; countryVal: number; gravityPct: number }>;
  };
};

/**
 * Calcule les valeurs attendues après un tick, en reprenant la logique du cron
 * (effets, règles de croissance, budget avec gravité).
 */
export function getExpectedNextTick(
  country: CountrySnapshot,
  pcts: BudgetPcts,
  rulesByKey: Record<string, { value: unknown }>,
  worldAvgs: WorldAverages,
  effects: CountryEffectInput[],
): ExpectedNextTickResult {
  const globalRates = getGlobalGrowthRates(rulesByKey, country);
  const { pop_base, gdp_base, pop_from_stats, gdp_from_stats } = globalRates;

  const mil = country.militarism ?? 0;
  const ind = country.industry ?? 0;
  const sci = country.science ?? 0;
  const stab = country.stability ?? 0;

  let pop_effect_rate = 0;
  let gdp_effect_rate = 0;
  let delta_mil = 0;
  let delta_ind = 0;
  let delta_sci = 0;
  let delta_stab = 0;

  for (const e of effects) {
    if (e.duration_remaining != null && e.duration_remaining <= 0) continue;
    const val = Math.abs(e.value) > 1 ? e.value / 100 : e.value;
    if (e.effect_kind === "population_growth_base" || e.effect_kind === "population_growth_per_stat") {
      pop_effect_rate += val;
    } else if (e.effect_kind === "gdp_growth_base" || e.effect_kind === "gdp_growth_per_stat") {
      gdp_effect_rate += val;
    } else if (e.effect_kind === "stat_delta" && e.effect_target) {
      if (e.effect_target === "militarism") delta_mil += e.value;
      else if (e.effect_target === "industry") delta_ind += e.value;
      else if (e.effect_target === "science") delta_sci += e.value;
      else if (e.effect_target === "stability") delta_stab += e.value;
    }
  }

  const wa = worldAvgs;
  const c = country;

  const sante = getBudgetVal(rulesByKey, "budget_sante");
  const budget_pop_rate_base =
    ministryContribution(
      pcts.pct_sante,
      sante.min_pct,
      sante.bonuses.population ?? 0,
      sante.maluses.population ?? -0.05,
    );
  const budget_pop_rate = budget_pop_rate_base;

  const infra = getBudgetVal(rulesByKey, "budget_infrastructure");
  const ae = getBudgetVal(rulesByKey, "budget_affaires_etrangeres");
  const rawGdpInfra = ministryContribution(
    pcts.pct_infrastructure,
    infra.min_pct,
    infra.bonuses.gdp ?? 0,
    infra.maluses.gdp ?? -0.05,
  );
  const rawGdpAe = ministryContribution(
    pcts.pct_affaires_etrangeres,
    ae.min_pct,
    ae.bonuses.gdp ?? 0,
    ae.maluses.gdp ?? -0.05,
  );
  const budget_gdp_rate_base = rawGdpInfra + rawGdpAe;
  const budget_gdp_rate = budget_gdp_rate_base;

  const defense = getBudgetVal(rulesByKey, "budget_defense");
  const budget_mil_base = ministryContribution(
    pcts.pct_defense,
    defense.min_pct,
    defense.bonuses.militarism ?? 0,
    defense.maluses.militarism ?? -0.05,
  );
  const budget_mil_gravity = gravityFactorForContribution(wa.mil_avg, c.militarism, defense.gravity_pct, budget_mil_base);
  const budget_mil = budget_mil_base * budget_mil_gravity;

  const industrie = getBudgetVal(rulesByKey, "budget_industrie");
  const rawIndInfra = ministryContribution(
    pcts.pct_infrastructure,
    infra.min_pct,
    infra.bonuses.industry ?? 0,
    infra.maluses.industry ?? -0.05,
  );
  const rawIndInd = ministryContribution(
    pcts.pct_industrie,
    industrie.min_pct,
    industrie.bonuses.industry ?? 0,
    industrie.maluses.industry ?? -0.05,
  );
  const budget_ind_base = rawIndInfra + rawIndInd;
  const indInfraGravity = gravityFactorForContribution(wa.ind_avg, c.industry, infra.gravity_pct, rawIndInfra);
  const indIndGravity = gravityFactorForContribution(wa.ind_avg, c.industry, industrie.gravity_pct, rawIndInd);
  const budget_ind_infra = rawIndInfra * indInfraGravity;
  const budget_ind_ind = rawIndInd * indIndGravity;
  const budget_ind = budget_ind_infra + budget_ind_ind;

  const education = getBudgetVal(rulesByKey, "budget_education");
  const recherche = getBudgetVal(rulesByKey, "budget_recherche");
  const rawSciEdu = ministryContribution(
    pcts.pct_education,
    education.min_pct,
    education.bonuses.science ?? 0,
    education.maluses.science ?? -0.05,
  );
  const rawSciRech = ministryContribution(
    pcts.pct_recherche,
    recherche.min_pct,
    recherche.bonuses.science ?? 0,
    recherche.maluses.science ?? -0.05,
  );
  const budget_sci_base = rawSciEdu + rawSciRech;
  const sciEduGravity = gravityFactorForContribution(wa.sci_avg, c.science, education.gravity_pct, rawSciEdu);
  const sciRechGravity = gravityFactorForContribution(wa.sci_avg, c.science, recherche.gravity_pct, rawSciRech);
  const budget_sci_edu = rawSciEdu * sciEduGravity;
  const budget_sci_rech = rawSciRech * sciRechGravity;
  const budget_sci = budget_sci_edu + budget_sci_rech;

  const interieur = getBudgetVal(rulesByKey, "budget_interieur");
  const rawStabEdu = ministryContribution(
    pcts.pct_education,
    education.min_pct,
    education.bonuses.stability ?? 0,
    education.maluses.stability ?? -0.05,
  );
  const rawStabInt = ministryContribution(
    pcts.pct_interieur,
    interieur.min_pct,
    interieur.bonuses.stability ?? 0,
    interieur.maluses.stability ?? -0.05,
  );
  const rawStabAe = ministryContribution(
    pcts.pct_affaires_etrangeres,
    ae.min_pct,
    ae.bonuses.stability ?? 0,
    ae.maluses.stability ?? -0.05,
  );
  const budget_stab_base = rawStabEdu + rawStabInt + rawStabAe;
  const budget_stab = budget_stab_base;

  const pop_total_rate =
    pop_base + pop_from_stats + pop_effect_rate + budget_pop_rate;
  const gdp_total_rate =
    gdp_base + gdp_from_stats + gdp_effect_rate + budget_gdp_rate;

  const population = Math.max(
    0,
    Math.round(c.population + c.population * pop_total_rate),
  );
  const gdp = Math.max(0, c.gdp + c.gdp * gdp_total_rate);
  const militarism = Math.min(
    10,
    Math.max(0, Math.round((mil + delta_mil + budget_mil) * 100) / 100),
  );
  const industry = Math.min(
    10,
    Math.max(0, Math.round((ind + delta_ind + budget_ind) * 100) / 100),
  );
  const science = Math.min(
    10,
    Math.max(0, Math.round((sci + delta_sci + budget_sci) * 100) / 100),
  );
  const stability = Math.min(
    3,
    Math.max(-3, Math.round((stab + delta_stab + budget_stab) * 100) / 100),
  );

  return {
    population,
    gdp,
    militarism,
    industry,
    science,
    stability,
    inputs: {
      pop_base,
      gdp_base,
      pop_from_stats,
      gdp_from_stats,
      pop_effect_rate,
      gdp_effect_rate,
      budget_pop_rate_base,
      budget_pop_rate,
      budget_gdp_rate_base,
      budget_gdp_rate,
      pop_total_rate,
      gdp_total_rate,
      delta_mil,
      delta_ind,
      delta_sci,
      delta_stab,
      budget_mil_base,
      budget_mil,
      budget_ind_base,
      budget_ind,
      budget_sci_base,
      budget_sci,
      budget_stab_base,
      budget_stab,
      budget_pop_sources: { Santé: budget_pop_rate_base },
      budget_gdp_sources: { Infrastructure: rawGdpInfra, "Affaires étrangères": rawGdpAe },
      /** Valeurs réellement ajoutées (après gravité) pour que la somme = budget_mil. */
      budget_mil_sources: { Défense: budget_mil },
      /** Valeurs réellement ajoutées (après gravité) pour que la somme = budget_ind. */
      budget_ind_sources: { Infrastructure: budget_ind_infra, Industrie: budget_ind_ind },
      /** Valeurs réellement ajoutées (après gravité) pour que la somme = budget_sci. */
      budget_sci_sources: { Éducation: budget_sci_edu, Recherche: budget_sci_rech },
      budget_stab_sources: { Éducation: rawStabEdu, Intérieur: rawStabInt, "Affaires étrangères": rawStabAe },
      budget_mil_gravity_info: {
        Défense: {
          base: budget_mil_base,
          worldAvg: wa.mil_avg,
          countryVal: c.militarism,
          gravityPct: defense.gravity_pct,
        },
      },
      budget_ind_gravity_info: {
        Infrastructure: {
          base: rawIndInfra,
          worldAvg: wa.ind_avg,
          countryVal: c.industry,
          gravityPct: infra.gravity_pct,
        },
        Industrie: {
          base: rawIndInd,
          worldAvg: wa.ind_avg,
          countryVal: c.industry,
          gravityPct: industrie.gravity_pct,
        },
      },
      budget_sci_gravity_info: {
        Éducation: {
          base: rawSciEdu,
          worldAvg: wa.sci_avg,
          countryVal: c.science,
          gravityPct: education.gravity_pct,
        },
        Recherche: {
          base: rawSciRech,
          worldAvg: wa.sci_avg,
          countryVal: c.science,
          gravityPct: recherche.gravity_pct,
        },
      },
    },
  };
}
