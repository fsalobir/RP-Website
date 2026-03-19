import type { Json } from "@/types/fantasy";
import type { ResolvedEffects } from "@/lib/effects/engine";

function isPlainObject(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceNumber(value: Json): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type EffectBucket = {
  sums: number;
  product: number;
  maxes: number[];
};

function bucketEffectsForSubkey(resolved: ResolvedEffects, subkey: string): EffectBucket {
  const bucket: EffectBucket = { sums: 0, product: 1, maxes: [] };

  for (const [groupKey, eff] of Object.entries(resolved.byKind)) {
    const parts = groupKey.split("|");
    const groupSubkey = parts.length >= 2 ? parts.slice(1).join("|") : null;
    if (groupSubkey !== subkey) continue;

    switch (eff.mode) {
      case "sum":
        bucket.sums += eff.value;
        break;
      case "product":
        bucket.product *= eff.value;
        break;
      case "max":
        bucket.maxes.push(eff.value);
        break;
      default:
        bucket.sums += eff.value;
        break;
    }
  }

  return bucket;
}

/**
 * Prend un JSONB brut (ex: `provinces.attrs` ou `realms.settings`) et applique les effets résolus
 * sur toutes les clés numériques présentes.
 *
 * Convention:
 * - Un effet s’applique à une clé `k` si sa clé de groupe est `effect_kind|k`
 *   (i.e. `effects.target_subkey = k`).
 * - Formule (ordre stable):
 *   - multiplicateurs (`mode=product`) : \(base * product\)
 *   - bonus (`mode=sum`)              : \(+ sums\)
 *   - minimums/seuils (`mode=max`)    : \(max(base, ...maxes)\)
 */
export function mapFinalNumbersFromAttrs(
  attrsOrSettings: Json,
  resolvedEffects: ResolvedEffects,
): Record<string, number> {
  if (!isPlainObject(attrsOrSettings)) return {};

  const out: Record<string, number> = {};

  for (const [key, raw] of Object.entries(attrsOrSettings)) {
    const base = raw === undefined ? null : coerceNumber(raw);
    if (base == null) continue;

    const bucket = bucketEffectsForSubkey(resolvedEffects, key);
    let v = base * bucket.product + bucket.sums;
    if (bucket.maxes.length) {
      v = Math.max(v, ...bucket.maxes);
    }

    out[key] = v;
  }

  return out;
}

