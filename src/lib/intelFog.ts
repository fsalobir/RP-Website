/**
 * Brouillard de guerre : transforme le roster militaire réel en estimations
 * floues proportionnelles au niveau d'intel, avec fourchettes non-réversibles.
 *
 * Le display_seed (entier renouvelé par le cron) sert de graine à un PRNG
 * déterministe pour décaler le centre des fourchettes et moduler leur largeur,
 * empêchant le joueur de déduire la valeur réelle.
 */

import type { MilitaryBranch } from "@/types/database";
import type { RosterRowByBranch } from "@/app/(public)/pays/[slug]/countryTabsTypes";

// ─── PRNG déterministe (Mulberry32) ──────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Types exportés ──────────────────────────────────────────────────

export type FoggedBranchEstimate = {
  branch: MilitaryBranch;
  unitCountRange: { min: number; max: number };
  personnelRange: { min: number; max: number };
  techLevel: string | null;
};

export type FoggedUnitEstimate = {
  unitId: string;
  unitName: string;
  iconUrl: string | null;
  branch: MilitaryBranch;
  subType: string | null;
  countRange: { min: number; max: number };
  personnelRange: { min: number; max: number };
  techLevel: string | null;
};

export type FoggedRoster =
  | { type: "none" }
  | { type: "branch"; branches: FoggedBranchEstimate[] }
  | { type: "unit"; units: FoggedUnitEstimate[] };

// ─── Helpers internes ────────────────────────────────────────────────

function fogRange(
  realValue: number,
  intelLevel: number,
  rng: () => number,
): { min: number; max: number } {
  if (realValue <= 0) return { min: 0, max: 0 };

  const t = Math.max(0, Math.min(100, intelLevel)) / 100;
  const spreadFactor = 1.5 * (1 - t) + 0.05 * t;
  const widthBase = Math.max(1, Math.round(realValue * spreadFactor));
  const widthMod = 1 + (rng() - 0.5) * 0.4;
  const halfWidth = Math.max(1, Math.round((widthBase * widthMod) / 2));
  const offset = Math.round((rng() - 0.5) * halfWidth * 1.2);
  const center = realValue + offset;
  const rawMin = Math.max(0, center - halfWidth);
  const rawMax = Math.max(rawMin + 1, center + halfWidth);
  const roundTo = rawMax > 100 ? 10 : rawMax > 20 ? 5 : 1;
  const min = Math.max(0, Math.floor(rawMin / roundTo) * roundTo);
  const max = Math.max(min + roundTo, Math.ceil(rawMax / roundTo) * roundTo);
  return { min, max };
}

function qualitativeTech(
  points: number,
  levelCount: number,
  intelLevel: number,
  rng: () => number,
): string | null {
  if (levelCount === 0) return null;
  const ratio = Math.max(0, points) / (levelCount * 100);
  const noise = (rng() - 0.5) * (0.6 * (1 - intelLevel / 100));
  const perceived = Math.max(0, Math.min(1, ratio + noise));

  if (intelLevel < 50) {
    if (perceived < 0.3) return "Faible";
    if (perceived < 0.7) return "Moyen";
    return "Avancé";
  }
  if (intelLevel < 75) {
    if (perceived < 0.2) return "Très faible";
    if (perceived < 0.4) return "Faible";
    if (perceived < 0.6) return "Moyen";
    if (perceived < 0.8) return "Avancé";
    return "Très avancé";
  }
  const level = Math.floor(perceived * levelCount);
  return `Niv. ~${Math.max(0, level)}`;
}

// ─── Fonction principale ─────────────────────────────────────────────

export function computeFoggedRoster(
  rosterByBranch: Record<MilitaryBranch, RosterRowByBranch[]>,
  intelLevel: number,
  displaySeed: number,
): FoggedRoster {
  const intel = Math.max(0, Math.min(100, Math.round(intelLevel)));

  if (intel === 0) return { type: "none" };

  const rng = mulberry32(displaySeed);

  if (intel < 50) {
    const branches: FoggedBranchEstimate[] = [];
    for (const branch of ["terre", "air", "mer", "strategique"] as const) {
      const rows = rosterByBranch[branch];
      if (rows.length === 0) continue;

      let totalUnits = 0;
      let totalPersonnel = 0;
      let maxPoints = 0;
      let maxLevelCount = 0;
      for (const row of rows) {
        const extra = Math.max(0, row.countryState?.extra_count ?? 0);
        const count = row.unit.base_count + extra;
        const points = Math.max(0, row.countryState?.current_level ?? 0);
        const unlockedLevel = Math.max(0, Math.min(row.unit.level_count, Math.floor(points / 100)));
        const manpower = unlockedLevel > 0
          ? (row.levels.find((l) => l.level === unlockedLevel)?.manpower ?? 0)
          : 0;
        totalUnits += count;
        totalPersonnel += count * manpower;
        if (points > maxPoints) {
          maxPoints = points;
          maxLevelCount = row.unit.level_count;
        }
      }

      branches.push({
        branch,
        unitCountRange: fogRange(totalUnits, intel, rng),
        personnelRange: fogRange(totalPersonnel, intel, rng),
        techLevel: qualitativeTech(maxPoints, maxLevelCount, intel, rng),
      });
    }
    return { type: "branch", branches };
  }

  const units: FoggedUnitEstimate[] = [];
  for (const branch of ["terre", "air", "mer", "strategique"] as const) {
    for (const row of rosterByBranch[branch]) {
      const extra = Math.max(0, row.countryState?.extra_count ?? 0);
      const count = row.unit.base_count + extra;
      const points = Math.max(0, row.countryState?.current_level ?? 0);
      const unlockedLevel = Math.max(0, Math.min(row.unit.level_count, Math.floor(points / 100)));
      const manpower = unlockedLevel > 0
        ? (row.levels.find((l) => l.level === unlockedLevel)?.manpower ?? 0)
        : 0;
      const personnel = count * manpower;

      if (intel >= 100) {
        units.push({
          unitId: row.unit.id,
          unitName: row.unit.name_fr,
          iconUrl: row.unit.icon_url,
          branch,
          subType: row.unit.sub_type,
          countRange: { min: count, max: count },
          personnelRange: { min: personnel, max: personnel },
          techLevel: `Niv. ${unlockedLevel}/${row.unit.level_count}`,
        });
      } else {
        units.push({
          unitId: row.unit.id,
          unitName: row.unit.name_fr,
          iconUrl: row.unit.icon_url,
          branch,
          subType: row.unit.sub_type,
          countRange: fogRange(count, intel, rng),
          personnelRange: fogRange(personnel, intel, rng),
          techLevel: qualitativeTech(points, row.unit.level_count, intel, rng),
        });
      }
    }
  }
  return { type: "unit", units };
}
