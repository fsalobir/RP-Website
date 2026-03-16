import { normalizePair } from "@/lib/relations";

/** 6 idéologies (ordre = sommets de l'hexagone, sens horaire à partir du haut). Cohérent avec la géométrie des drifts. */
export const IDEOLOGY_IDS = [
  "germanic_monarchy",     /* sommet 0 : haut (Monarchisme Germanique) */
  "satoiste_cultism",      /* sommet 1 : haut-droite (Cultisme Satoiste) */
  "nilotique_cultism",     /* sommet 2 : bas-droite (Cultisme Nilotique) */
  "mughal_republicanism",  /* sommet 3 : bas (Républicanisme Moghol) */
  "french_republicanism",  /* sommet 4 : bas-gauche (Républicanisme Français) */
  "merina_monarchy",       /* sommet 5 : haut-gauche (Monarchisme Mérinais) */
] as const;
export type IdeologyId = (typeof IDEOLOGY_IDS)[number];

export const IDEOLOGY_LABELS: Record<IdeologyId, string> = {
  germanic_monarchy: "Monarchisme Germanique",
  merina_monarchy: "Monarchisme Mérinais",
  french_republicanism: "Républicanisme Français",
  mughal_republicanism: "Républicanisme Moghol",
  nilotique_cultism: "Cultisme Nilotique",
  satoiste_cultism: "Cultisme Satoiste",
};

/** Courtes descriptions pour l’infobox au survol des pôles (hexagone). */
export const IDEOLOGY_DESCRIPTIONS: Record<IdeologyId, string> = {
  germanic_monarchy: "Pôle monarchiste d’inspiration germanique : ordre, tradition, hiérarchie.",
  merina_monarchy: "Pôle monarchiste d’inspiration mérina : légitimité dynastique, centralité du souverain.",
  french_republicanism: "Pôle républicain d’inspiration française : laïcité, droits civiques, souveraineté du peuple.",
  mughal_republicanism: "Pôle républicain d’inspiration moghole : pluralité, équilibre des pouvoirs.",
  nilotique_cultism: "Pôle cultuel nilotique : primat du religieux et du sacré dans l’ordre politique.",
  satoiste_cultism: "Pôle cultuel satoiste : rites, symboles et autorité spirituelle au cœur du pouvoir.",
};

/** Image d’en-tête optionnelle pour l’infobox au survol (hexagone). */
export const IDEOLOGY_INFOBOX_HEADER_IMAGE: Record<IdeologyId, string | null> = {
  germanic_monarchy: null,
  merina_monarchy: "/images/ideology/merina_monarchy.png",
  french_republicanism: "/images/ideology/french_republicanism.png",
  mughal_republicanism: null,
  nilotique_cultism: "/images/ideology/nilotique_cultism.png",
  satoiste_cultism: "/images/ideology/satoiste.png",
};

/** Description longue optionnelle pour l’infobox (hexagone). */
export const IDEOLOGY_INFOBOX_LONG_DESCRIPTION: Record<IdeologyId, string | null> = {
  germanic_monarchy: null,
  merina_monarchy:
    "Fort de sa splendide isolation, l'île de Madagascar a lentement évolué vers un niveau de développement où le Roi a du partager le poids de diriger. Le Roi pousse le profit individuel, le parlement pousse les réformes sociales.",
  french_republicanism:
    "Né des guerres successives avec les monarchies, le Républicanisme français est un rejet radical des élites, et de l'oppression royale-capitaliste. La société doit être fondée sur l'équité radicale : la liberté collective est le fruit du sacrifice individuel.",
  mughal_republicanism: null,
  nilotique_cultism:
    "Idéologie forgée sur les rives du plus long fleuve du monde. Sous l'apparence d'un État décentralisé, le pouvoir reste fermement concentré entre les mains d'une élite tentaculaire. De manière purement cynique, cette oligarchie n'hésite pas à instrumentaliser la foi pour galvaniser les foules, sans pour autant nécessairement adhérer aux croyances qu'elle prêche.",
  satoiste_cultism:
    "Nommé du nom du premier ministre japonais éponyme, le Satoisme mêle une croyance mystique à un culte féroce du chef. La divinité du leader fort qui dirige l'état fort est le socle de la politique gouvernementale. La politique totalitaire et nationaliste appliquée par l'état sert les ambitions agressives définies par le Guide.",
};

/** Calque optionnel (image de fond) par secteur de l’hexagone, même ordre que IDEOLOGY_IDS. */
export const IDEOLOGY_HEX_LAYER_IMAGE: Record<IdeologyId, string | null> = {
  germanic_monarchy: null,
  merina_monarchy: "/images/ideology/merina_monarchy.png",
  french_republicanism: "/images/ideology/french_republicanism.png",
  mughal_republicanism: null,
  nilotique_cultism: "/images/ideology/nilotique_cultism.png",
  satoiste_cultism: "/images/ideology/satoiste.png",
};

/** Nom de la colonne DB pour le score ou le drift d'une idéologie (ex. ideology_germanic_monarchy). */
export function ideologyColumnName(id: IdeologyId, prefix: "ideology" | "ideology_drift" = "ideology"): string {
  return prefix === "ideology_drift" ? `ideology_drift_${id}` : `ideology_${id}`;
}

/** Paires d’idéologies antithétiques (axiomes) : avoir un score élevé sur l’une décourage l’autre. */
export const IDEOLOGY_ANTITHETICAL_PAIRS: [IdeologyId, IdeologyId][] = [
  ["germanic_monarchy", "mughal_republicanism"],
  ["french_republicanism", "satoiste_cultism"],
  ["nilotique_cultism", "merina_monarchy"],
];

/** Retourne l’idéologie antithétique de `id`, ou null si aucune. */
export function getAntitheticalId(id: IdeologyId): IdeologyId | null {
  for (const [a, b] of IDEOLOGY_ANTITHETICAL_PAIRS) {
    if (a === id) return b;
    if (b === id) return a;
  }
  return null;
}

export type IdeologyScores = Record<IdeologyId, number>;

export type IdeologyConfig = {
  daily_step: number;
  neighbor_pull_weight: number;
  relation_pull_weight: number;
  influence_pull_weight: number;
  control_pull_weight: number;
  effect_pull_weight: number;
  snap_strength: number;
};

export const DEFAULT_IDEOLOGY_CONFIG: IdeologyConfig = {
  daily_step: 0.18,
  neighbor_pull_weight: 0.8,
  relation_pull_weight: 0.35,
  influence_pull_weight: 0.45,
  control_pull_weight: 1.1,
  effect_pull_weight: 1,
  snap_strength: 16,
};

const CENTER_VALUE = 100 / 6;

type PartialIdeologyConfig = Partial<IdeologyConfig>;

export function getIdeologyConfig(raw: unknown): IdeologyConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_IDEOLOGY_CONFIG;
  const cfg = raw as PartialIdeologyConfig;
  return {
    daily_step: num(cfg.daily_step, DEFAULT_IDEOLOGY_CONFIG.daily_step),
    neighbor_pull_weight: num(cfg.neighbor_pull_weight, DEFAULT_IDEOLOGY_CONFIG.neighbor_pull_weight),
    relation_pull_weight: num(cfg.relation_pull_weight, DEFAULT_IDEOLOGY_CONFIG.relation_pull_weight),
    influence_pull_weight: num(cfg.influence_pull_weight, DEFAULT_IDEOLOGY_CONFIG.influence_pull_weight),
    control_pull_weight: num(cfg.control_pull_weight, DEFAULT_IDEOLOGY_CONFIG.control_pull_weight),
    effect_pull_weight: num(cfg.effect_pull_weight, DEFAULT_IDEOLOGY_CONFIG.effect_pull_weight),
    snap_strength: num(cfg.snap_strength, DEFAULT_IDEOLOGY_CONFIG.snap_strength),
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
} & Partial<Record<string, number>>;

export type IdeologyControlRow = {
  country_id: string;
  controller_country_id: string;
  share_pct: number;
  is_annexed: boolean;
};

/** Pourcentages d'influence attribués à l'overlord par statut (règle sphere_influence_pct). */
export type SphereInfluencePct = { contested?: number; occupied?: number; annexed?: number };

const DEFAULT_SPHERE_PCT: Required<SphereInfluencePct> = { contested: 50, occupied: 80, annexed: 100 };

/** Retourne le % d'influence effectif pour le facteur de contrôle (Contesté / Occupé / Annexé). */
export function getEffectiveSpherePct(
  controlRow: IdeologyControlRow,
  sphereInfluencePct?: SphereInfluencePct | null
): number {
  const pct = sphereInfluencePct ?? DEFAULT_SPHERE_PCT;
  if (controlRow.is_annexed) return num(pct.annexed, DEFAULT_SPHERE_PCT.annexed);
  const share = num(controlRow.share_pct, 0);
  if (share >= 100) return num(pct.occupied, DEFAULT_SPHERE_PCT.occupied);
  return num(pct.contested, DEFAULT_SPHERE_PCT.contested);
}

export type IdeologyCountryResult = {
  countryId: string;
  scores: IdeologyScores;
  drift: IdeologyScores;
  dominant: IdeologyId;
  centerDistance: number;
  /** Repère unitaire : hexagone régulier, sommets sur le cercle unité, x et y dans environ [-1, 1]. */
  point: { x: number; y: number };
  breakdown: {
    neighbors: IdeologyScores;
    effects: IdeologyScores;
    neighborContributors: Array<{
      countryId: string;
      name: string;
      slug: string;
      flag_url: string | null;
      ideology: IdeologyId;
      value: number;
      weight: number;
    }>;
  };
};

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createZeroScores(): IdeologyScores {
  const out = {} as IdeologyScores;
  for (const id of IDEOLOGY_IDS) out[id] = 0;
  return out;
}

function createNeutralScores(): IdeologyScores {
  const out = {} as IdeologyScores;
  for (const id of IDEOLOGY_IDS) out[id] = CENTER_VALUE;
  return out;
}

export function normalizeIdeologyScores(scores: Partial<IdeologyScores>): IdeologyScores {
  const raw = createZeroScores();
  for (const id of IDEOLOGY_IDS) {
    raw[id] = Math.max(0, num((scores as Record<string, number>)[id], 0));
  }
  const sum = IDEOLOGY_IDS.reduce((s, id) => s + raw[id], 0);
  if (sum <= 0) return createNeutralScores();
  const out = {} as IdeologyScores;
  for (const id of IDEOLOGY_IDS) {
    out[id] = (raw[id] / sum) * 100;
  }
  return out;
}

/** Applique la tension axiomatique par paire antithétique : dans chaque paire, le gagnant prend tout, le perdant passe à 0 (on a donc exactement 3 scores non nuls). Puis renormalise à 100. */
export function normalizeIdeologyScoresWithAxioms(scores: Partial<IdeologyScores>): IdeologyScores {
  const raw = createZeroScores();
  for (const id of IDEOLOGY_IDS) {
    raw[id] = Math.max(0, num((scores as Record<string, number>)[id], 0));
  }
  const sum = IDEOLOGY_IDS.reduce((s, id) => s + raw[id], 0);
  if (sum <= 0) return createNeutralScores();
  const snapped = { ...raw } as IdeologyScores;
  for (const [a, b] of IDEOLOGY_ANTITHETICAL_PAIRS) {
    const total = snapped[a] + snapped[b];
    if (total <= 0) continue;
    if (snapped[a] >= snapped[b]) {
      snapped[a] = total;
      snapped[b] = 0;
    } else {
      snapped[b] = total;
      snapped[a] = 0;
    }
  }
  const sumAfter = IDEOLOGY_IDS.reduce((s, id) => s + snapped[id], 0);
  if (sumAfter <= 0) return createNeutralScores();
  const out = {} as IdeologyScores;
  for (const id of IDEOLOGY_IDS) {
    out[id] = (snapped[id] / sumAfter) * 100;
  }
  return out;
}

function addScores(a: IdeologyScores, b: IdeologyScores): IdeologyScores {
  const out = {} as IdeologyScores;
  for (const id of IDEOLOGY_IDS) out[id] = a[id] + b[id];
  return out;
}

function scaleScores(scores: IdeologyScores, factor: number): IdeologyScores {
  const out = {} as IdeologyScores;
  for (const id of IDEOLOGY_IDS) out[id] = scores[id] * factor;
  return out;
}

function dominantIdeology(scores: IdeologyScores): IdeologyId {
  return IDEOLOGY_IDS.reduce((best, current) => (scores[current] > scores[best] ? current : best), IDEOLOGY_IDS[0]);
}

/** Norme max depuis le centre (100/6,...,100/6) vers un sommet (100,0,0,0,0,0) = 100*sqrt(30)/6. */
const CENTER_DISTANCE_NORM_FACTOR = (100 * Math.sqrt(30)) / 6;

function ideologyCenterDistance(scores: IdeologyScores): number {
  let sumSq = 0;
  for (const id of IDEOLOGY_IDS) {
    const d = scores[id] - CENTER_VALUE;
    sumSq += d * d;
  }
  const magnitude = Math.sqrt(sumSq);
  return clamp(magnitude / CENTER_DISTANCE_NORM_FACTOR, 0, 1);
}

/** Sommets de l'hexagone régulier (pointy-top), angle 90° - k*60° pour k=0..5, rayon 1. */
const HEX_VERTICES: Array<{ x: number; y: number }> = [];
for (let k = 0; k < 6; k++) {
  const angle = Math.PI / 2 - (k * Math.PI) / 3;
  HEX_VERTICES.push({ x: Math.cos(angle), y: Math.sin(angle) });
}

/**
 * Position (x, y) dans l'hexagone unitaire (sommets sur le cercle unité).
 * Repère : x et y dans environ [-1, 1]. Barycentre des 6 sommets pondérés par les scores.
 */
export function ideologyPointFromScores(scores: IdeologyScores): { x: number; y: number } {
  const normalized = normalizeIdeologyScores(scores);
  let x = 0;
  let y = 0;
  for (let k = 0; k < 6; k++) {
    const w = normalized[IDEOLOGY_IDS[k]] / 100;
    x += w * HEX_VERTICES[k].x;
    y += w * HEX_VERTICES[k].y;
  }
  return { x, y };
}

function getStoredOrNeutralIdeology(country: IdeologyCountryInput): IdeologyScores {
  const raw: Partial<IdeologyScores> = {};
  let hasAny = false;
  for (const id of IDEOLOGY_IDS) {
    const v = country[ideologyColumnName(id)];
    raw[id] = num(v, 0);
    if (v != null && Number.isFinite(Number(v))) hasAny = true;
  }
  if (!hasAny) return createNeutralScores();
  return normalizeIdeologyScores(raw);
}

export function getIdeologyEffectTotals(
  effects: Array<{ effect_kind: string; value: number; duration_kind?: string; duration_remaining?: number }>
): IdeologyEffectTotals {
  const totals: IdeologyEffectTotals = { drift: createZeroScores(), snap: createZeroScores() };
  for (const effect of effects) {
    const active = effect.duration_kind === "permanent" || (effect.duration_remaining ?? 0) > 0;
    if (!active) continue;
    const value = num(effect.value, 0);
    for (const id of IDEOLOGY_IDS) {
      if (effect.effect_kind === `ideology_drift_${id}`) totals.drift[id] += value;
      if (effect.effect_kind === `ideology_snap_${id}`) totals.snap[id] += value;
    }
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
  sphereInfluencePct?: SphereInfluencePct | null;
}): Map<string, IdeologyCountryResult> {
  const config = params.config ?? DEFAULT_IDEOLOGY_CONFIG;
  const relationMap = params.relationMap ?? new Map<string, number>();
  const influenceByCountry = params.influenceByCountry ?? new Map<string, number>();
  const neighborIdsByCountry = params.neighborIdsByCountry ?? new Map<string, string[]>();
  const controlRows = params.controlRows ?? [];
  const effectsByCountry = params.effectsByCountry ?? new Map<string, IdeologyEffectTotals>();
  const sphereInfluencePct = params.sphereInfluencePct ?? null;

  const countriesById = new Map(params.countries.map((country) => [country.id, country]));
  const priorByCountry = new Map(params.countries.map((country) => [country.id, getStoredOrNeutralIdeology(country)]));
  const maxInfluence = Math.max(1, ...params.countries.map((country) => num(influenceByCountry.get(country.id), 0)));

  const controllersByCountry = new Map<string, IdeologyControlRow[]>();
  for (const row of controlRows) {
    const list = controllersByCountry.get(row.country_id) ?? [];
    list.push(row);
    controllersByCountry.set(row.country_id, list);
  }

  const out = new Map<string, IdeologyCountryResult>();

  for (const country of params.countries) {
    const prior = priorByCountry.get(country.id) ?? createNeutralScores();
    const effectTotals = effectsByCountry.get(country.id) ?? { drift: createZeroScores(), snap: createZeroScores() };
    const neighbors = neighborIdsByCountry.get(country.id) ?? [];
    let neighborWeightSum = 0;
    let neighborAccum = createZeroScores();
    const neighborContributors: IdeologyCountryResult["breakdown"]["neighborContributors"] = [];

    for (const neighborId of neighbors) {
      const neighbor = countriesById.get(neighborId);
      if (!neighbor) continue;
      const relation = relationMap.get(relationKey(country.id, neighborId)) ?? 0;
      const relationFactor = 1 + (relation / 100) * config.relation_pull_weight;
      const influenceFactor = 1 + (num(influenceByCountry.get(neighborId), 0) / maxInfluence) * config.influence_pull_weight;
      const controlRow = (controllersByCountry.get(country.id) ?? []).find((row) => row.controller_country_id === neighborId);
      const effectivePct = controlRow ? getEffectiveSpherePct(controlRow, sphereInfluencePct) : 0;
      const controlFactor = controlRow ? 1 + (effectivePct / 100) * config.control_pull_weight : 1;
      const totalWeight = Math.max(0.05, relationFactor * influenceFactor * controlFactor);
      const neighborScoresRaw = priorByCountry.get(neighborId) ?? createNeutralScores();
      const weightedPull = scaleScores(neighborScoresRaw, totalWeight);
      neighborWeightSum += totalWeight;
      neighborAccum = addScores(neighborAccum, weightedPull);
      neighborContributors.push({
        countryId: neighbor.id,
        name: neighbor.name,
        slug: neighbor.slug,
        flag_url: neighbor.flag_url,
        ideology: dominantIdeology(neighborScoresRaw),
        value: Math.max(...Object.values(weightedPull)),
        weight: totalWeight,
      });
    }

    const neighborScores =
      neighborWeightSum > 0
        ? scaleScores(neighborAccum, 1 / neighborWeightSum)
        : createNeutralScores();

    const effectsVector = scaleScores(effectTotals.drift, config.effect_pull_weight);
    const snapVector = scaleScores(effectTotals.snap, config.snap_strength);
    const effectBreakdown = addScores(effectTotals.drift, snapVector);
    const sourceVector = addScores(
      neighborWeightSum > 0 ? scaleScores(neighborScores, config.neighbor_pull_weight) : createZeroScores(),
      addScores(effectsVector, snapVector)
    );
    const hasDirectionalSource = Math.max(...Object.values(sourceVector)) > 0;
    const target = hasDirectionalSource ? normalizeIdeologyScores(sourceVector) : prior;

    const drift = {} as IdeologyScores;
    for (const id of IDEOLOGY_IDS) {
      drift[id] = (target[id] - prior[id]) * config.daily_step;
    }
    const scoresRaw = {} as IdeologyScores;
    for (const id of IDEOLOGY_IDS) {
      scoresRaw[id] = prior[id] + drift[id];
    }
    const scores = normalizeIdeologyScoresWithAxioms(scoresRaw);
    const dominant = dominantIdeology(scores);

    out.set(country.id, {
      countryId: country.id,
      scores,
      drift,
      dominant,
      centerDistance: ideologyCenterDistance(scores),
      point: ideologyPointFromScores(scores),
      breakdown: {
        neighbors: neighborScores,
        effects: effectBreakdown,
        neighborContributors: neighborContributors.sort((a, b) => b.value - a.value),
      },
    });
  }

  return out;
}

export function relationKey(countryAId: string, countryBId: string): string {
  const [a, b] = normalizePair(countryAId, countryBId);
  return `${a}|${b}`;
}
