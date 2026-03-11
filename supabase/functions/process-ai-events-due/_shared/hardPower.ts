import type { MilitaryBranch } from "./types.ts";

export type HardPowerByBranch = {
  terre: number;
  air: number;
  mer: number;
  strategique: number;
  total: number;
};

type RosterUnit = { id: string; branch: MilitaryBranch; base_count: number };
type RosterLevel = { unit_id: string; level: number; hard_power: number };
type CountryUnit = { country_id: string; roster_unit_id: string; current_level: number; extra_count: number };

function unlockedLevelFromPoints(currentLevel: number): number {
  return Math.max(0, Math.floor(Number(currentLevel) / 100));
}

export function computeHardPowerByCountry(
  countryMilitaryUnits: CountryUnit[],
  rosterUnits: RosterUnit[],
  rosterLevels: RosterLevel[]
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
    for (const cmu of units) {
      const rosterUnit = unitById.get(cmu.roster_unit_id);
      if (!rosterUnit) continue;
      const levels = levelsByUnit.get(cmu.roster_unit_id);
      if (!levels || levels.length === 0) continue;
      const unlockedLevel = unlockedLevelFromPoints(cmu.current_level);
      const levelRow = levels.find((l) => l.level === unlockedLevel) ?? null;
      const hardPowerPerUnit = levelRow ? Number(levelRow.hard_power) || 0 : 0;
      const count = (rosterUnit.base_count ?? 0) + (cmu.extra_count ?? 0);
      const contrib = count * hardPowerPerUnit;
      const b = rosterUnit.branch;
      if (b in branchSums) (branchSums as Record<string, number>)[b] += contrib;
      branchSums.total += contrib;
    }
    result.set(countryId, branchSums);
  }

  for (const cid of byCountry.keys()) {
    if (!result.has(cid)) result.set(cid, { ...empty });
  }
  return result;
}
