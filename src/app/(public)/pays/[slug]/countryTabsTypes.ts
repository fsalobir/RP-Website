import type { MilitaryRosterUnit, CountryMilitaryUnit } from "@/types/database";

export type RosterRowByBranch = {
  unit: MilitaryRosterUnit;
  countryState: CountryMilitaryUnit | null;
  levels: { level: number; manpower: number }[];
};
