import type { MilitaryRosterUnit, CountryMilitaryUnit } from "@/types/database";

export type RosterRowByBranch = {
  unit: MilitaryRosterUnit;
  countryState: CountryMilitaryUnit | null;
  levels: {
    level: number;
    manpower: number;
    hard_power: number;
    mobilization_cost?: number;
    science_required?: number;
  }[];
};
