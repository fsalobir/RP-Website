import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildAuthorizedMilitaryRows, type CountrySummary } from "./playerContext";
import type { CountryMilitaryUnit, MilitaryRosterUnit, MilitaryRosterUnitLevel } from "@/types/database";

const ownId = "11111111-1111-4111-8111-111111111111";
const foreignId = "22222222-2222-4222-8222-222222222222";
const unitId = "33333333-3333-4333-8333-333333333333";
const now = "2026-01-01T00:00:00.000Z";

const countries: CountrySummary[] = [
  { id: ownId, name: "Pays joueur", slug: "joueur", regime: null, militarism: 5, industry: 5, science: 5, stability: 0, population: 1, gdp: 1, growth: 0 },
  { id: foreignId, name: "Pays étranger", slug: "etranger", regime: null, militarism: 5, industry: 5, science: 5, stability: 0, population: 1, gdp: 1, growth: 0 },
];
const units: MilitaryRosterUnit[] = [{ id: unitId, branch: "terre", sub_type: "Blindé", name_fr: "Chars", icon_url: null, level_count: 6, base_count: 10, sort_order: 0, created_at: now, updated_at: now }];
const levels: MilitaryRosterUnitLevel[] = Array.from({ length: 6 }, (_, index) => ({
  id: `44444444-4444-4444-8444-44444444444${index}`,
  unit_id: unitId,
  level: index + 1,
  manpower: 100 * (index + 1),
  hard_power: 10,
  mobilization_cost: 100,
  science_required: 0,
  created_at: now,
}));
const states: CountryMilitaryUnit[] = [ownId, foreignId].map((countryId) => ({
  id: countryId,
  country_id: countryId,
  roster_unit_id: unitId,
  current_level: countryId === ownId ? 321 : 873,
  extra_count: countryId === ownId ? 4 : 19,
  recrutement_points: 11,
  procuration_points: 22,
  stock_points: 33,
  created_at: now,
  updated_at: now,
}));

function rows(intelLevel: number) {
  return buildAuthorizedMilitaryRows({
    observerCountryId: ownId,
    countries,
    units,
    levels,
    states,
    intelRows: [{ target_country_id: foreignId, intel_level: intelLevel, display_seed: 42 }],
    effectRows: [],
  });
}

describe("frontière militaire du Secrétaire", () => {
  it("transmet les données exactes du pays du joueur", () => {
    expect(rows(0)[0]).toMatchObject({
      visibilite: "exacte — pays du joueur",
      unites: [{ niveau_points: 321, nombre_supplementaire: 4 }],
    });
  });

  it("ne transmet aucune valeur militaire réelle étrangère sans renseignement", () => {
    const foreign = rows(0)[1];
    expect(foreign).toMatchObject({ niveau_renseignement: 0, militaire: { type: "none" } });
    expect(JSON.stringify(foreign)).not.toMatch(/current_level|extra_count|873|recrutement_points|stock_points/);
  });

  it("ne transmet que le résultat brouillé en renseignement partiel ou complet", () => {
    const partial = rows(40)[1] as { militaire: { type: string } };
    const full = rows(100)[1] as { militaire: { type: string; units: Array<{ countRange: { min: number; max: number } }> } };
    expect(partial.militaire.type).toBe("branch");
    expect(full.militaire.type).toBe("unit");
    expect(full.militaire.units[0].countRange).toEqual({ min: 29, max: 29 });
    expect(JSON.stringify([partial, full])).not.toMatch(/current_level|extra_count|recrutement_points|stock_points/);
  });
});
