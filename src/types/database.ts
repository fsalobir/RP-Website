export type MilitaryBranch = 'terre' | 'air' | 'mer'

export interface Country {
  id: string
  name: string
  slug: string
  regime: string | null
  flag_url: string | null
  militarism: number
  industry: number
  science: number
  stability: number
  population: number
  gdp: number
  growth: number
  created_at: string
  updated_at: string
}

export interface CountryMacro {
  id: string
  country_id: string
  key: string
  value: number
}

export interface RuleParameter {
  id: string
  key: string
  value: unknown
  description: string | null
}

export interface MilitaryUnitType {
  id: string
  branch: MilitaryBranch
  name_fr: string
  sort_order: number
}

export interface CountryMilitaryLimit {
  id: string
  country_id: string
  unit_type_id: string
  limit_value: number
}

export interface Perk {
  id: string
  name_fr: string
  description_fr: string | null
  modifier: string | null
  min_militarism: number | null
  min_industry: number | null
  min_science: number | null
  min_stability: number | null
  sort_order: number
}

export interface CountryPerk {
  id: string
  country_id: string
  perk_id: string
  unlocked_at: string
}
