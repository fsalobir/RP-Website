import type { Effect, EffectTargetType, UUID, Json } from "@/types/fantasy";

export type EffectTargetRef = {
  type: EffectTargetType;
  id: UUID;
  /**
   * Sous-cible facultative (slot, ressource, attribut, etc.).
   * Correspond à `effects.target_subkey`.
   */
  subkey?: string;
};

export type CombinationMode = "sum" | "product" | "max";

export interface ResolvedEffect {
  effect_kind: string;
  /**
   * Cible logique (agrégée) pour laquelle la valeur a été calculée.
   */
  target: EffectTargetRef;
  /**
   * Valeur numérique agrégée (après somme/produit/max).
   */
  value: number;
  /**
   * Mode d’agrégation utilisé (somme, produit, max).
   */
  mode: CombinationMode;
  /**
   * Effets bruts ayant contribué à ce résultat.
   */
  sources: Effect[];
}

export interface ResolvedEffects {
  target: EffectTargetRef;
  /**
   * Regroupe les effets par `effect_kind` (et éventuellement `subkey`).
   */
  byKind: Record<string, ResolvedEffect>;
}

/**
 * Options de résolution, permettant d’injecter la hiérarchie déjà connue
 * (ex: Provinces et Items d’un Royaume) sans lier ce module au transport (DB/Supabase).
 */
export interface ResolveEffectsOptions {
  /**
   * Cibles supplémentaires à inclure lorsqu’on résout pour un Realm.
   * Exemple typique :
   * - toutes les Provinces du royaume
   * - les Items non équipés du trésor du royaume
   */
  relatedTargetsForRealm?: EffectTargetRef[];
}

/**
 * Fonction pure de résolution : à partir d’une liste d’effets bruts (tels que lus en DB),
 * calcule les effets agrégés applicables à une cible Fantasy (Realm, Province, Character, etc.).
 *
 * Hiérarchie d’agrégation :
 * - Si la cible est un Realm :
 *   - on agrège les effets dont (target_type,target_id) == (realm, realm.id)
 *   - plus tous les effets ciblant les `relatedTargetsForRealm` fournis dans les options
 *     (ex: provinces du royaume, items de la salle du trésor).
 * - Sinon :
 *   - on agrège uniquement les effets ciblant directement la cible donnée.
 *
 * Logique mathématique générique (peut être affinée par la suite) :
 * - Somme pour la plupart des bonus numériques.
 * - Produit pour les multiplicateurs (`*_multiplier`, `mult_*`).
 * - Max pour les seuils / minimums (`*_min_*`).
 */
export function resolveEffectsForTarget(
  target: EffectTargetRef,
  allEffects: Effect[],
  options: ResolveEffectsOptions = {},
): ResolvedEffects {
  const relevantTargets = computeRelevantTargets(target, options);

  const relevantEffects = allEffects.filter((effect) =>
    relevantTargets.some((t) => matchesTarget(effect, t)),
  );

  const grouped = new Map<string, Effect[]>();

  for (const effect of relevantEffects) {
    const key = buildGroupKey(effect, target);
    const arr = grouped.get(key) ?? [];
    arr.push(effect);
    grouped.set(key, arr);
  }

  const byKind: Record<string, ResolvedEffect> = {};

  for (const [groupKey, effects] of grouped.entries()) {
    if (!effects.length) continue;
    const effect_kind = effects[0].effect_kind;
    const mode = inferCombinationMode(effect_kind);
    const values = effects.map((e) => coerceNumeric(e.value));
    const aggregated = combine(values, mode);

    byKind[groupKey] = {
      effect_kind,
      target,
      value: aggregated,
      mode,
      sources: effects,
    };
  }

  return { target, byKind };
}

/**
 * Détermine quelles cibles doivent être prises en compte pour la résolution.
 * Pour un Realm, on inclut :
 * - le Realm lui-même
 * - toutes les cibles supplémentaires fournies via `relatedTargetsForRealm`.
 * Pour les autres types, uniquement la cible elle-même.
 *
 * Cette fonction est volontairement simple : la construction de `relatedTargetsForRealm`
 * (en interrogeant Supabase, en lisant le cache, etc.) est à faire à l’extérieur de ce module.
 */
function computeRelevantTargets(
  target: EffectTargetRef,
  options: ResolveEffectsOptions,
): EffectTargetRef[] {
  if (target.type === "realm") {
    const related = options.relatedTargetsForRealm ?? [];
    // On force la présence de la cible elle-même.
    return [target, ...related];
  }
  return [target];
}

function matchesTarget(effect: Effect, target: EffectTargetRef): boolean {
  if (effect.target_type !== target.type) return false;
  if (effect.target_id !== target.id) return false;
  if (target.subkey == null) return true;
  return effect.target_subkey === target.subkey;
}

/**
 * Construit une clé de groupe pour agréger les effets.
 * Par défaut : `effect_kind` seul.
 * Si un sous-slot est pertinent, on pourrait étendre à `effect_kind|subkey`.
 */
function buildGroupKey(effect: Effect, _target: EffectTargetRef): string {
  if (effect.target_subkey && effect.target_subkey.length > 0) {
    return `${effect.effect_kind}|${effect.target_subkey}`;
  }
  return effect.effect_kind;
}

function coerceNumeric(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function combine(values: number[], mode: CombinationMode): number {
  if (!values.length) return 0;
  switch (mode) {
    case "sum":
      return values.reduce((acc, v) => acc + v, 0);
    case "product":
      return values.reduce((acc, v) => acc * v, 1);
    case "max":
      return values.reduce((acc, v) => (v > acc ? v : acc), values[0]);
    default:
      return values.reduce((acc, v) => acc + v, 0);
  }
}

/**
 * Heuristique générique pour déterminer le mode d’agrégation :
 * - `*_multiplier` ou `mult_*` → produit
 * - `*_min_*` → max
 * - sinon → somme
 *
 * On pourra raffiner cette logique plus tard avec un registre explicite par `effect_kind`.
 */
function inferCombinationMode(effectKind: string): CombinationMode {
  const k = effectKind.toLowerCase();

  if (k.endsWith("_multiplier") || k.startsWith("mult_")) {
    return "product";
  }

  if (k.includes("_min_")) {
    return "max";
  }

  return "sum";
}

