/**
 * Calcul du score Influence (type Diplomatic Weight) :
 * - Contributions PIB, Population, Hard Power (avec gravité et moyennes monde).
 * - Stabilité : multiplicateur sur la somme (PIB+Population+Hard Power), interpolé entre valeur min et max sur l’échelle -3 à +3.
 */

import type { HardPowerByBranch } from "./hardPower";
import type { InfluenceModifiers } from "./countryEffects";

const STABILITY_SCALE_MIN = -3;
const STABILITY_SCALE_MAX = 3;

export type InfluenceConfig = {
  mult_gdp?: number;
  mult_population?: number;
  mult_military?: number;
  stability_modifier_min?: number;
  stability_modifier_max?: number;
  gravity_pct_gdp?: number;
  gravity_pct_population?: number;
  gravity_pct_military?: number;
};

export type InfluenceResult = {
  influence: number;
  components: {
    gdp: number;
    population: number;
    /** Multiplicateur stabilité (appliqué sur la somme PIB+Population+Hard Power), pas une contribution. */
    stabilityMultiplier: number;
    military: number;
  };
  /** Après gravité (pour détail). stabilityMultiplier = même valeur, pas de gravité. */
  componentsAfterGravity: {
    gdp: number;
    population: number;
    stabilityMultiplier: number;
    military: number;
  };
};

export type WorldInfluenceAverages = {
  gdp: number;
  population: number;
  military: number;
};

function getConfigVal(config: InfluenceConfig, key: keyof InfluenceConfig, fallback: number): number {
  const v = config[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}

/** Facteur de gravité (comme expectedNextTick). Borné [0,1 ; 2]. */
function gravityFactor(worldAvg: number, countryVal: number, gravityPct: number, contribution: number): number {
  if (worldAvg === 0) return 1;
  const k = gravityPct / 100;
  const ratio = worldAvg > 0 ? (worldAvg - countryVal) / worldAvg : 0;
  const raw = contribution >= 0 ? 1 + k * ratio : 1 + k * -ratio;
  return Math.max(0.1, Math.min(2, raw));
}

/** Modificateur stabilité interpolé entre min et max sur l'échelle -3 à +3. */
function stabilityModifier(stability: number, modMin: number, modMax: number): number {
  const t = (Number(stability) - STABILITY_SCALE_MIN) / (STABILITY_SCALE_MAX - STABILITY_SCALE_MIN);
  const u = Math.max(0, Math.min(1, t));
  return (1 - u) * modMin + u * modMax;
}

/**
 * Calcule les contributions brutes (avant gravité) pour un pays.
 */
function rawContributions(
  gdp: number,
  population: number,
  stability: number,
  hardPowerTotal: number,
  config: InfluenceConfig
): InfluenceResult["components"] {
  const multGdp = getConfigVal(config, "mult_gdp", 1e-9);
  const multPop = getConfigVal(config, "mult_population", 1e-7);
  const multMil = getConfigVal(config, "mult_military", 0.01);
  const modMin = getConfigVal(config, "stability_modifier_min", 0);
  const modMax = getConfigVal(config, "stability_modifier_max", 1);

  return {
    gdp: multGdp * Number(gdp) || 0,
    population: multPop * Number(population) || 0,
    stabilityMultiplier: stabilityModifier(Number(stability) ?? 0, modMin, modMax),
    military: multMil * hardPowerTotal || 0,
  };
}

/**
 * Calcule le score Influence pour tous les pays et les moyennes monde.
 */
export function computeInfluenceForAll(
  countries: Array<{ id: string; population: number; gdp: number; stability: number }>,
  hardPowerByCountry: Map<string, HardPowerByBranch>,
  config: InfluenceConfig
): { byCountry: Map<string, InfluenceResult>; worldAverages: WorldInfluenceAverages } {
  const multGdp = getConfigVal(config, "mult_gdp", 1e-9);
  const multPop = getConfigVal(config, "mult_population", 1e-7);
  const multMil = getConfigVal(config, "mult_military", 0.01);
  const modMin = getConfigVal(config, "stability_modifier_min", 0);
  const modMax = getConfigVal(config, "stability_modifier_max", 1);
  const gravityGdp = getConfigVal(config, "gravity_pct_gdp", 50);
  const gravityPop = getConfigVal(config, "gravity_pct_population", 50);
  const gravityMil = getConfigVal(config, "gravity_pct_military", 50);

  const rawGdps: number[] = [];
  const rawPops: number[] = [];
  const rawMils: number[] = [];
  const compsByCountry = new Map<string, InfluenceResult["components"]>();

  for (const c of countries) {
    const hp = hardPowerByCountry.get(c.id) ?? { terre: 0, air: 0, mer: 0, strategique: 0, total: 0 };
    const comp = rawContributions(c.gdp, c.population, c.stability, hp.total, config);
    rawGdps.push(comp.gdp);
    rawPops.push(comp.population);
    rawMils.push(comp.military);
    compsByCountry.set(c.id, comp);
  }

  const n = countries.length;
  const worldAvgGdp = n > 0 ? rawGdps.reduce((a, b) => a + b, 0) / n : 0;
  const worldAvgPop = n > 0 ? rawPops.reduce((a, b) => a + b, 0) / n : 0;
  const worldAvgMil = n > 0 ? rawMils.reduce((a, b) => a + b, 0) / n : 0;
  const worldAverages: WorldInfluenceAverages = {
    gdp: worldAvgGdp,
    population: worldAvgPop,
    military: worldAvgMil,
  };

  const byCountry = new Map<string, InfluenceResult>();
  for (const c of countries) {
    const comp = compsByCountry.get(c.id)!;
    const gfGdp = gravityFactor(worldAvgGdp, comp.gdp, gravityGdp, comp.gdp);
    const gfPop = gravityFactor(worldAvgPop, comp.population, gravityPop, comp.population);
    const gfMil = gravityFactor(worldAvgMil, comp.military, gravityMil, comp.military);

    const afterGravity = {
      gdp: comp.gdp * gfGdp,
      population: comp.population * gfPop,
      stabilityMultiplier: comp.stabilityMultiplier,
      military: comp.military * gfMil,
    };
    const baseInfluence = afterGravity.gdp + afterGravity.population + afterGravity.military;
    const influence = baseInfluence * afterGravity.stabilityMultiplier;

    byCountry.set(c.id, {
      influence,
      components: comp,
      componentsAfterGravity: afterGravity,
    });
  }

  return { byCountry, worldAverages };
}

/**
 * Applique les modificateurs d'effets (influence_modifier_*) à un résultat Influence.
 * Modificateurs sur les parts PIB / population / Hard Power (après gravité), puis global sur le total.
 */
export function applyInfluenceModifiers(
  result: InfluenceResult,
  mods: InfluenceModifiers
): InfluenceResult {
  const ag = result.componentsAfterGravity;
  const gdp = ag.gdp * mods.gdp;
  const population = ag.population * mods.population;
  const military = ag.military * mods.hard_power;
  const baseInfluence = gdp + population + military;
  const influence = baseInfluence * ag.stabilityMultiplier * mods.global;
  return {
    influence,
    components: result.components,
    componentsAfterGravity: {
      gdp,
      population,
      stabilityMultiplier: ag.stabilityMultiplier,
      military,
    },
  };
}
