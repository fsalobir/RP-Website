import { normalizePair } from "@/lib/relations";

export const IDEOLOGY_IDS = ["monarchism", "republicanism", "cultism"] as const;
export type IdeologyId = (typeof IDEOLOGY_IDS)[number];

export const IDEOLOGY_LABELS: Record<IdeologyId, string> = {
  monarchism: "Monarchisme",
  republicanism: "Républicanisme",
  cultism: "Cultisme",
};

export type IdeologyScores = Record<IdeologyId, number>;

export type IdeologyWeights = {
  monarchism_from_stability: number;
  monarchism_from_militarism: number;
  republicanism_from_science: number;
  republicanism_from_stability: number;
  republicanism_from_industry: number;
  cultism_from_instability: number;
  cultism_from_low_science: number;
  cultism_from_militarism: number;
};

export type IdeologyConfig = {
  daily_step: number;
  base_pull_weight: number;
  neighbor_pull_weight: number;
  relation_pull_weight: number;
  influence_pull_weight: number;
  control_pull_weight: number;
  effect_pull_weight: number;
  snap_strength: number;
  weights: IdeologyWeights;
};

export const DEFAULT_IDEOLOGY_CONFIG: IdeologyConfig = {
  daily_step: 0.18,
  base_pull_weight: 0.9,
  neighbor_pull_weight: 0.8,
  relation_pull_weight: 0.35,
  influence_pull_weight: 0.45,
  control_pull_weight: 1.1,
  effect_pull_weight: 1,
  snap_strength: 16,
  weights: {
    monarchism_from_stability: 1.15,
    monarchism_from_militarism: 0.75,
    republicanism_from_science: 1.1,
    republicanism_from_stability: 0.75,
    republicanism_from_industry: 0.55,
    cultism_from_instability: 1.2,
    cultism_from_low_science: 0.85,
    cultism_from_militarism: 0.3,
  },
};

type PartialIdeologyConfig = Partial<IdeologyConfig> & {
  weights?: Partial<IdeologyWeights>;
};

export function getIdeologyConfig(raw: unknown): IdeologyConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_IDEOLOGY_CONFIG;
  const cfg = raw as PartialIdeologyConfig;
  return {
    daily_step: num(cfg.daily_step, DEFAULT_IDEOLOGY_CONFIG.daily_step),
    base_pull_weight: num(cfg.base_pull_weight, DEFAULT_IDEOLOGY_CONFIG.base_pull_weight),
    neighbor_pull_weight: num(cfg.neighbor_pull_weight, DEFAULT_IDEOLOGY_CONFIG.neighbor_pull_weight),
    relation_pull_weight: num(cfg.relation_pull_weight, DEFAULT_IDEOLOGY_CONFIG.relation_pull_weight),
    influence_pull_weight: num(cfg.influence_pull_weight, DEFAULT_IDEOLOGY_CONFIG.influence_pull_weight),
    control_pull_weight: num(cfg.control_pull_weight, DEFAULT_IDEOLOGY_CONFIG.control_pull_weight),
    effect_pull_weight: num(cfg.effect_pull_weight, DEFAULT_IDEOLOGY_CONFIG.effect_pull_weight),
    snap_strength: num(cfg.snap_strength, DEFAULT_IDEOLOGY_CONFIG.snap_strength),
    weights: {
      monarchism_from_stability: num(cfg.weights?.monarchism_from_stability, DEFAULT_IDEOLOGY_CONFIG.weights.monarchism_from_stability),
      monarchism_from_militarism: num(cfg.weights?.monarchism_from_militarism, DEFAULT_IDEOLOGY_CONFIG.weights.monarchism_from_militarism),
      republicanism_from_science: num(cfg.weights?.republicanism_from_science, DEFAULT_IDEOLOGY_CONFIG.weights.republicanism_from_science),
      republicanism_from_stability: num(cfg.weights?.republicanism_from_stability, DEFAULT_IDEOLOGY_CONFIG.weights.republicanism_from_stability),
      republicanism_from_industry: num(cfg.weights?.republicanism_from_industry, DEFAULT_IDEOLOGY_CONFIG.weights.republicanism_from_industry),
      cultism_from_instability: num(cfg.weights?.cultism_from_instability, DEFAULT_IDEOLOGY_CONFIG.weights.cultism_from_instability),
      cultism_from_low_science: num(cfg.weights?.cultism_from_low_science, DEFAULT_IDEOLOGY_CONFIG.weights.cultism_from_low_science),
      cultism_from_militarism: num(cfg.weights?.cultism_from_militarism, DEFAULT_IDEOLOGY_CONFIG.weights.cultism_from_militarism),
    },
  };
}

export type IdeologyEffectTotals = {
  drift: IdeologyScores;
  snap: IdeologyScores;
};

export type IdeologyCountryInput = {
  id: string;
  name: string;
  slug: string;
  flag_url: string | null;
  regime: string | null;
  militarism: number | null;
  industry: number | null;
  science: number | null;
  stability: number | null;
  gdp: number | null;
  population: number | null;
  ai_status?: string | null;
  ideology_monarchism?: number | null;
  ideology_republicanism?: number | null;
  ideology_cultism?: number | null;
};

export type IdeologyControlRow = {
  country_id: string;
  controller_country_id: string;
  share_pct: number;
  is_annexed: boolean;
};

export type IdeologyCountryResult = {
  countryId: string;
  scores: IdeologyScores;
  drift: IdeologyScores;
  dominant: IdeologyId;
  centerDistance: number;
  point: { x: number; y: number };
  breakdown: {
    base: IdeologyScores;
    neighbors: IdeologyScores;
    effects: IdeologyScores;
    topFactors: Array<{ label: string; ideology: IdeologyId; value: number }>;
  };
};

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createZeroScores(): IdeologyScores {
  return { monarchism: 0, republicanism: 0, cultism: 0 };
}

export function normalizeIdeologyScores(scores: Partial<IdeologyScores>): IdeologyScores {
  const raw: IdeologyScores = {
    monarchism: Math.max(0, num(scores.monarchism, 0)),
    republicanism: Math.max(0, num(scores.republicanism, 0)),
    cultism: Math.max(0, num(scores.cultism, 0)),
  };
  const sum = raw.monarchism + raw.republicanism + raw.cultism;
  if (sum <= 0) {
    return { monarchism: 33.3333, republicanism: 33.3333, cultism: 33.3334 };
  }
  return {
    monarchism: (raw.monarchism / sum) * 100,
    republicanism: (raw.republicanism / sum) * 100,
    cultism: (raw.cultism / sum) * 100,
  };
}

function addScores(a: IdeologyScores, b: IdeologyScores): IdeologyScores {
  return {
    monarchism: a.monarchism + b.monarchism,
    republicanism: a.republicanism + b.republicanism,
    cultism: a.cultism + b.cultism,
  };
}

function scaleScores(scores: IdeologyScores, factor: number): IdeologyScores {
  return {
    monarchism: scores.monarchism * factor,
    republicanism: scores.republicanism * factor,
    cultism: scores.cultism * factor,
  };
}

function dominantIdeology(scores: IdeologyScores): IdeologyId {
  return IDEOLOGY_IDS.reduce((best, current) => (scores[current] > scores[best] ? current : best), "monarchism");
}

function ideologyCenterDistance(scores: IdeologyScores): number {
  const centered = {
    monarchism: scores.monarchism - 33.3333,
    republicanism: scores.republicanism - 33.3333,
    cultism: scores.cultism - 33.3333,
  };
  const magnitude = Math.sqrt(centered.monarchism ** 2 + centered.republicanism ** 2 + centered.cultism ** 2);
  return clamp(magnitude / 81.65, 0, 1);
}

export function ideologyPointFromScores(scores: IdeologyScores): { x: number; y: number } {
  const normalized = normalizeIdeologyScores(scores);
  const r = normalized.republicanism / 100;
  const c = normalized.cultism / 100;
  return {
    x: r + c * 0.5,
    y: c * 0.8660254038,
  };
}

function deriveBaseIdeology(country: IdeologyCountryInput, config: IdeologyConfig): IdeologyScores {
  const militarism = clamp(num(country.militarism, 0), 0, 10) / 10;
  const industry = clamp(num(country.industry, 0), 0, 10) / 10;
  const science = clamp(num(country.science, 0), 0, 10) / 10;
  const stability = (clamp(num(country.stability, 0), -3, 3) + 3) / 6;
  const instability = 1 - stability;
  const lowScience = 1 - science;
  const weights = config.weights;
  return normalizeIdeologyScores({
    monarchism:
      stability * weights.monarchism_from_stability +
      militarism * weights.monarchism_from_militarism,
    republicanism:
      science * weights.republicanism_from_science +
      stability * weights.republicanism_from_stability +
      industry * weights.republicanism_from_industry,
    cultism:
      instability * weights.cultism_from_instability +
      lowScience * weights.cultism_from_low_science +
      militarism * weights.cultism_from_militarism,
  });
}

function getStoredOrBaseIdeology(country: IdeologyCountryInput, config: IdeologyConfig): IdeologyScores {
  const maybeStored = normalizeIdeologyScores({
    monarchism: country.ideology_monarchism ?? 0,
    republicanism: country.ideology_republicanism ?? 0,
    cultism: country.ideology_cultism ?? 0,
  });
  const hasStored =
    country.ideology_monarchism != null &&
    country.ideology_republicanism != null &&
    country.ideology_cultism != null;
  return hasStored ? maybeStored : deriveBaseIdeology(country, config);
}

export function getIdeologyEffectTotals(
  effects: Array<{ effect_kind: string; value: number; duration_kind?: string; duration_remaining?: number }>
): IdeologyEffectTotals {
  const totals: IdeologyEffectTotals = { drift: createZeroScores(), snap: createZeroScores() };
  for (const effect of effects) {
    const active = effect.duration_kind === "permanent" || (effect.duration_remaining ?? 0) > 0;
    if (!active) continue;
    const value = num(effect.value, 0);
    if (effect.effect_kind === "ideology_drift_monarchism") totals.drift.monarchism += value;
    if (effect.effect_kind === "ideology_drift_republicanism") totals.drift.republicanism += value;
    if (effect.effect_kind === "ideology_drift_cultism") totals.drift.cultism += value;
    if (effect.effect_kind === "ideology_snap_monarchism") totals.snap.monarchism += value;
    if (effect.effect_kind === "ideology_snap_republicanism") totals.snap.republicanism += value;
    if (effect.effect_kind === "ideology_snap_cultism") totals.snap.cultism += value;
  }
  return totals;
}

export function buildNeighborIdsByCountry(
  regionCountries: Array<{ region_id: string; country_id: string }>,
  regionNeighbors: Array<{ region_a_id: string; region_b_id: string }>
): Map<string, string[]> {
  const regionToCountries = new Map<string, Set<string>>();
  const countryToRegions = new Map<string, Set<string>>();
  for (const row of regionCountries) {
    if (!regionToCountries.has(row.region_id)) regionToCountries.set(row.region_id, new Set());
    regionToCountries.get(row.region_id)!.add(row.country_id);
    if (!countryToRegions.has(row.country_id)) countryToRegions.set(row.country_id, new Set());
    countryToRegions.get(row.country_id)!.add(row.region_id);
  }

  const regionToNeighbors = new Map<string, Set<string>>();
  for (const row of regionNeighbors) {
    if (!regionToNeighbors.has(row.region_a_id)) regionToNeighbors.set(row.region_a_id, new Set());
    if (!regionToNeighbors.has(row.region_b_id)) regionToNeighbors.set(row.region_b_id, new Set());
    regionToNeighbors.get(row.region_a_id)!.add(row.region_b_id);
    regionToNeighbors.get(row.region_b_id)!.add(row.region_a_id);
  }

  const out = new Map<string, string[]>();
  for (const [countryId, regionIds] of countryToRegions.entries()) {
    const neighbors = new Set<string>();
    for (const regionId of regionIds) {
      for (const neighborRegionId of regionToNeighbors.get(regionId) ?? []) {
        for (const neighborCountryId of regionToCountries.get(neighborRegionId) ?? []) {
          if (neighborCountryId !== countryId) neighbors.add(neighborCountryId);
        }
      }
    }
    out.set(countryId, [...neighbors]);
  }
  return out;
}

export function computeWorldIdeologies(params: {
  countries: IdeologyCountryInput[];
  config?: IdeologyConfig;
  relationMap?: Map<string, number>;
  influenceByCountry?: Map<string, number>;
  neighborIdsByCountry?: Map<string, string[]>;
  controlRows?: IdeologyControlRow[];
  effectsByCountry?: Map<string, IdeologyEffectTotals>;
}): Map<string, IdeologyCountryResult> {
  const config = params.config ?? DEFAULT_IDEOLOGY_CONFIG;
  const relationMap = params.relationMap ?? new Map<string, number>();
  const influenceByCountry = params.influenceByCountry ?? new Map<string, number>();
  const neighborIdsByCountry = params.neighborIdsByCountry ?? new Map<string, string[]>();
  const controlRows = params.controlRows ?? [];
  const effectsByCountry = params.effectsByCountry ?? new Map<string, IdeologyEffectTotals>();

  const countriesById = new Map(params.countries.map((country) => [country.id, country]));
  const priorByCountry = new Map(params.countries.map((country) => [country.id, getStoredOrBaseIdeology(country, config)]));
  const maxInfluence = Math.max(1, ...params.countries.map((country) => num(influenceByCountry.get(country.id), 0)));

  const controllersByCountry = new Map<string, IdeologyControlRow[]>();
  for (const row of controlRows) {
    const list = controllersByCountry.get(row.country_id) ?? [];
    list.push(row);
    controllersByCountry.set(row.country_id, list);
  }

  const out = new Map<string, IdeologyCountryResult>();

  for (const country of params.countries) {
    const prior = priorByCountry.get(country.id) ?? normalizeIdeologyScores({});
    const base = deriveBaseIdeology(country, config);
    const effectTotals = effectsByCountry.get(country.id) ?? { drift: createZeroScores(), snap: createZeroScores() };
    const neighbors = neighborIdsByCountry.get(country.id) ?? [];
    let neighborWeightSum = 0;
    let neighborAccum = createZeroScores();

    for (const neighborId of neighbors) {
      const neighbor = countriesById.get(neighborId);
      if (!neighbor) continue;
      const relation = relationMap.get(relationKey(country.id, neighborId)) ?? 0;
      const relationFactor = 1 + (relation / 100) * config.relation_pull_weight;
      const influenceFactor = 1 + (num(influenceByCountry.get(neighborId), 0) / maxInfluence) * config.influence_pull_weight;
      const controlRow = (controllersByCountry.get(country.id) ?? []).find((row) => row.controller_country_id === neighborId);
      const controlFactor = controlRow
        ? 1 + ((controlRow.is_annexed ? 100 : num(controlRow.share_pct, 0)) / 100) * config.control_pull_weight
        : 1;
      const totalWeight = Math.max(0.05, relationFactor * influenceFactor * controlFactor);
      neighborWeightSum += totalWeight;
      neighborAccum = addScores(neighborAccum, scaleScores(priorByCountry.get(neighborId) ?? base, totalWeight));
    }

    const neighborScores =
      neighborWeightSum > 0
        ? scaleScores(neighborAccum, 1 / neighborWeightSum)
        : normalizeIdeologyScores({ monarchism: 33.3333, republicanism: 33.3333, cultism: 33.3334 });

    const effectsVector = scaleScores(effectTotals.drift, config.effect_pull_weight);
    const snapVector = scaleScores(effectTotals.snap, config.snap_strength);
    const target = normalizeIdeologyScores(
      addScores(
        addScores(scaleScores(base, config.base_pull_weight), scaleScores(neighborScores, config.neighbor_pull_weight)),
        addScores(effectsVector, snapVector)
      )
    );

    const drift = {
      monarchism: (target.monarchism - prior.monarchism) * config.daily_step,
      republicanism: (target.republicanism - prior.republicanism) * config.daily_step,
      cultism: (target.cultism - prior.cultism) * config.daily_step,
    };
    const scores = normalizeIdeologyScores({
      monarchism: prior.monarchism + drift.monarchism,
      republicanism: prior.republicanism + drift.republicanism,
      cultism: prior.cultism + drift.cultism,
    });
    const dominant = dominantIdeology(scores);
    const topFactors = [
      { label: "Socle interne", ideology: dominantIdeology(base), value: Math.max(...Object.values(base)) },
      { label: "Voisins", ideology: dominantIdeology(neighborScores), value: Math.max(...Object.values(neighborScores)) },
      { label: "Effets actifs", ideology: dominantIdeology(addScores(effectTotals.drift, snapVector)), value: Math.max(...Object.values(addScores(effectTotals.drift, snapVector))) },
    ].sort((a, b) => b.value - a.value);

    out.set(country.id, {
      countryId: country.id,
      scores,
      drift,
      dominant,
      centerDistance: ideologyCenterDistance(scores),
      point: ideologyPointFromScores(scores),
      breakdown: {
        base,
        neighbors: neighborScores,
        effects: addScores(effectTotals.drift, snapVector),
        topFactors,
      },
    });
  }

  return out;
}

export function relationKey(countryAId: string, countryBId: string): string {
  const [a, b] = normalizePair(countryAId, countryBId);
  return `${a}|${b}`;
}
