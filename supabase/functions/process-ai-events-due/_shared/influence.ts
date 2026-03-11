import type { HardPowerByBranch } from "./hardPower.ts";

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

function getConfigVal(config: InfluenceConfig, key: keyof InfluenceConfig, fallback: number): number {
  const v = config[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}

function gravityFactor(worldAvg: number, countryVal: number, gravityPct: number, contribution: number): number {
  if (worldAvg === 0) return 1;
  const k = gravityPct / 100;
  const ratio = worldAvg > 0 ? (worldAvg - countryVal) / worldAvg : 0;
  const raw = contribution >= 0 ? 1 + k * ratio : 1 + k * -ratio;
  return Math.max(0.1, Math.min(2, raw));
}

function stabilityModifier(stability: number, modMin: number, modMax: number): number {
  const t = (Number(stability) - -3) / (3 - -3);
  const u = Math.max(0, Math.min(1, t));
  return (1 - u) * modMin + u * modMax;
}

export function computeInfluenceForAll(
  countries: Array<{ id: string; population: number; gdp: number; stability: number }>,
  hardPowerByCountry: Map<string, HardPowerByBranch>,
  config: InfluenceConfig
): { byCountry: Map<string, { influence: number }>; worldAverages: { gdp: number; population: number; military: number } } {
  const multGdp = getConfigVal(config, "mult_gdp", 1e-9);
  const multPop = getConfigVal(config, "mult_population", 1e-7);
  const multMil = getConfigVal(config, "mult_military", 0.01);
  const modMin = getConfigVal(config, "stability_modifier_min", 0);
  const modMax = getConfigVal(config, "stability_modifier_max", 1);
  const gravityGdp = getConfigVal(config, "gravity_pct_gdp", 50);
  const gravityPop = getConfigVal(config, "gravity_pct_population", 50);
  const gravityMil = getConfigVal(config, "gravity_pct_military", 50);

  const rawByCountry = new Map<string, { gdp: number; pop: number; mil: number; stabMult: number }>();
  for (const c of countries) {
    const hp = hardPowerByCountry.get(c.id) ?? { terre: 0, air: 0, mer: 0, strategique: 0, total: 0 };
    rawByCountry.set(c.id, {
      gdp: multGdp * Number(c.gdp || 0),
      pop: multPop * Number(c.population || 0),
      mil: multMil * Number(hp.total || 0),
      stabMult: stabilityModifier(Number(c.stability || 0), modMin, modMax),
    });
  }

  const vals = [...rawByCountry.values()];
  const n = Math.max(1, vals.length);
  const worldAverages = {
    gdp: vals.reduce((s, v) => s + v.gdp, 0) / n,
    population: vals.reduce((s, v) => s + v.pop, 0) / n,
    military: vals.reduce((s, v) => s + v.mil, 0) / n,
  };

  const byCountry = new Map<string, { influence: number }>();
  for (const c of countries) {
    const raw = rawByCountry.get(c.id)!;
    const g = raw.gdp * gravityFactor(worldAverages.gdp, raw.gdp, gravityGdp, raw.gdp);
    const p = raw.pop * gravityFactor(worldAverages.population, raw.pop, gravityPop, raw.pop);
    const m = raw.mil * gravityFactor(worldAverages.military, raw.mil, gravityMil, raw.mil);
    byCountry.set(c.id, { influence: (g + p + m) * raw.stabMult });
  }

  return { byCountry, worldAverages };
}
