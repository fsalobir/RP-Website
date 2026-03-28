/**
 * Calcul du Hard Power par pays et par branche (terre, air, mer, strategique).
 * Hard Power = somme sur les unités de (nombre d'unités effectif × hard_power du niveau débloqué).
 * Nombre effectif = aligné fiche militaire si `effectsByCountry` est fourni (extras + % limites).
 */

import type { MilitaryBranch } from "@/types/database";
import { getEffectiveMilitaryUnitCount, getUnitExtraEffectSum } from "@/lib/countryEffects";

export type HardPowerByBranch = {
  terre: number;
  air: number;
  mer: number;
  strategique: number;
  total: number;
};

export type HardPowerRosterUnit = {
  id: string;
  branch: MilitaryBranch;
  base_count: number;
  sub_type?: string | null;
};

/** Effets résolus (ou tranche compatible) pour recalcul du nombre d’unités. */
export type HardPowerEffectSlice = {
  effect_kind: string;
  effect_target: string | null;
  value: number;
  duration_remaining?: number;
  duration_kind?: string;
};

type RosterLevel = { unit_id: string; level: number; hard_power: number };
type CountryUnit = { country_id: string; roster_unit_id: string; current_level: number; extra_count: number };

/**
 * Niveau débloqué à partir des points (current_level) : 0 pts = 0, 100 = 1, 200 = 2, etc.
 * Aligné avec CountryTabMilitary (floor(points/100) pour unlockedLevel).
 */
function unlockedLevelFromPoints(currentLevel: number): number {
  return Math.max(0, Math.floor(Number(currentLevel) / 100));
}

/**
 * Calcule le Hard Power par pays et par branche.
 * @param countryMilitaryUnits - Toutes les lignes country_military_units (tous pays)
 * @param rosterUnits - Unités du roster (id, branch, base_count)
 * @param rosterLevels - Niveaux avec hard_power (unit_id, level, hard_power)
 * @param effectsByCountry - Si défini : pour chaque pays, effets agrégés (lois cible, pays, global, IA, avantages…).
 */
export function computeHardPowerByCountry(
  countryMilitaryUnits: CountryUnit[],
  rosterUnits: HardPowerRosterUnit[],
  rosterLevels: RosterLevel[],
  effectsByCountry?: Map<string, HardPowerEffectSlice[]>
): Map<string, HardPowerByBranch> {
  const unitById = new Map(rosterUnits.map((u) => [u.id, u]));
  const levelsByUnit = new Map<string, RosterLevel[]>();
  for (const l of rosterLevels) {
    if (!levelsByUnit.has(l.unit_id)) levelsByUnit.set(l.unit_id, []);
    levelsByUnit.get(l.unit_id)!.push(l);
  }
  for (const arr of levelsByUnit.values()) arr.sort((a, b) => a.level - b.level);

  const result = new Map<string, HardPowerByBranch>();

  const byCountry = new Map<string, CountryUnit[]>();
  for (const cmu of countryMilitaryUnits) {
    if (!byCountry.has(cmu.country_id)) byCountry.set(cmu.country_id, []);
    byCountry.get(cmu.country_id)!.push(cmu);
  }

  const empty: HardPowerByBranch = { terre: 0, air: 0, mer: 0, strategique: 0, total: 0 };

  for (const [countryId, units] of byCountry) {
    const branchSums: HardPowerByBranch = { ...empty };
    const effects = effectsByCountry?.get(countryId) ?? null;

    for (const cmu of units) {
      const rosterUnit = unitById.get(cmu.roster_unit_id);
      if (!rosterUnit) continue;
      const levels = levelsByUnit.get(cmu.roster_unit_id);
      if (!levels || levels.length === 0) continue;

      const unlockedLevel = unlockedLevelFromPoints(cmu.current_level);
      const levelRow = levels.find((l) => l.level === unlockedLevel) ?? null;
      const hardPowerPerUnit = levelRow ? Number(levelRow.hard_power) || 0 : 0;
      const basePlusExtra = (rosterUnit.base_count ?? 0) + (cmu.extra_count ?? 0);
      const count =
        effects != null
          ? getEffectiveMilitaryUnitCount(
              effects,
              cmu.roster_unit_id,
              rosterUnit.branch,
              rosterUnit.sub_type ?? null,
              basePlusExtra + getUnitExtraEffectSum(effects, cmu.roster_unit_id)
            )
          : basePlusExtra;
      const contrib = count * hardPowerPerUnit;

      const b = rosterUnit.branch;
      if (b in branchSums) {
        (branchSums as Record<string, number>)[b] += contrib;
      }
      branchSums.total += contrib;
    }

    result.set(countryId, branchSums);
  }

  // Pays sans aucune unité militaire : 0 partout
  for (const cid of byCountry.keys()) {
    if (!result.has(cid)) result.set(cid, { ...empty });
  }

  return result;
}
