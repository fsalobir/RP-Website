export type MilitaryBranch = 'terre' | 'air' | 'mer' | 'strategique'

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

export interface MilitaryRosterUnit {
  id: string
  branch: MilitaryBranch
  sub_type: string | null
  name_fr: string
  icon_url: string | null
  level_count: number
  base_count: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface MilitaryRosterUnitLevel {
  id: string
  unit_id: string
  level: number
  manpower: number
  created_at: string
}

export interface CountryMilitaryUnit {
  id: string
  country_id: string
  roster_unit_id: string
  current_level: number
  extra_count: number
  created_at: string
  updated_at: string
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

export interface CountryBudget {
  id: string
  country_id: string
  budget_fraction: number
  pct_etat: number
  pct_education: number
  pct_recherche: number
  pct_infrastructure: number
  pct_sante: number
  pct_industrie: number
  pct_defense: number
  pct_interieur: number
  pct_affaires_etrangeres: number
  created_at: string
  updated_at: string
}

export interface CountryMobilisation {
  country_id: string
  score: number
  target_score: number
  updated_at: string
}

export interface CountryEffect {
  id: string
  country_id: string
  name: string
  effect_kind: string
  effect_target: string | null
  effect_subtype: string | null
  value: number
  duration_kind: string
  duration_remaining: number
  created_at: string
  updated_at: string
}

/** Log d’un passage du cron pour un pays (inputs + avant/après). */
export interface CountryUpdateLog {
  id: string
  country_id: string
  run_at: string
  /** Taux et deltas utilisés par le cron (jsonb en base). */
  inputs: Record<string, number | undefined> | null
  population_before: number | null
  gdp_before: number | null
  militarism_before: number | null
  industry_before: number | null
  science_before: number | null
  stability_before: number | null
  population_after: number | null
  gdp_after: number | null
  militarism_after: number | null
  industry_after: number | null
  science_after: number | null
  stability_after: number | null
  created_at: string
}
