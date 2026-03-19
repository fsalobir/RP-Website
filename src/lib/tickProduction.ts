import type { UUID } from "@/types/fantasy";

/** Suffixe des clés d'attrs qui représentent une production par tour. */
export const PRODUCTION_ATTR_SUFFIX = "_production";

/**
 * Extrait la production par ressource à partir des valeurs finales d'attrs (après effets).
 * Convention : toute clé se terminant par "_production" donne une production pour la ressource
 * dont resource_kinds.key = clé sans le suffixe (ex. "or_production" → "or").
 */
export function extractProductionFromFinalAttrs(
  attrsFinal: Record<string, number>,
  resourceIdByKey: Map<string, UUID>,
): Map<UUID, number> {
  const productionByResourceId = new Map<UUID, number>();
  if (!PRODUCTION_ATTR_SUFFIX.length) return productionByResourceId;

  for (const [attrKey, value] of Object.entries(attrsFinal)) {
    if (!attrKey.endsWith(PRODUCTION_ATTR_SUFFIX) || typeof value !== "number") continue;
    const resourceKey = attrKey.slice(0, -PRODUCTION_ATTR_SUFFIX.length);
    if (!resourceKey) continue;
    const resourceId = resourceIdByKey.get(resourceKey);
    if (!resourceId) continue;
    const current = productionByResourceId.get(resourceId) ?? 0;
    productionByResourceId.set(resourceId, current + value);
  }
  return productionByResourceId;
}

/**
 * Construit un Map resource_kind_id → key à partir d'une liste de resource_kinds.
 */
export function buildResourceKeyById(resourceKinds: Array<{ id: UUID; key: string }>): Map<UUID, string> {
  const map = new Map<UUID, string>();
  for (const rk of resourceKinds) {
    map.set(rk.id, rk.key);
  }
  return map;
}

/**
 * key → id, pour résoudre rapidement un resource_kind_id à partir de la clé d'attrs.
 */
export function buildResourceIdByKey(resourceKinds: Array<{ id: UUID; key: string }>): Map<string, UUID> {
  const map = new Map<string, UUID>();
  for (const rk of resourceKinds) {
    map.set(rk.key, rk.id);
  }
  return map;
}
