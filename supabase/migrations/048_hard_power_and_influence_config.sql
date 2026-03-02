-- Hard Power par niveau d'unité (roster) + paramètres Influence (rule_parameters).

-- 1) Colonne hard_power sur military_roster_unit_levels
ALTER TABLE public.military_roster_unit_levels
  ADD COLUMN IF NOT EXISTS hard_power integer NOT NULL DEFAULT 0 CHECK (hard_power >= 0);

COMMENT ON COLUMN public.military_roster_unit_levels.hard_power IS 'Valeur Hard Power de ce niveau d''unité (utilisée dans le calcul Influence et classements militaires).';

-- 2) Paramètre influence_config (multiplicateurs, stabilité en intervalle, gravités par paramètre)
INSERT INTO public.rule_parameters (key, value, description) VALUES
  (
    'influence_config',
    '{
      "mult_gdp": 1e-9,
      "mult_population": 1e-7,
      "mult_military": 0.01,
      "stability_modifier_min": 0,
      "stability_modifier_max": 1,
      "gravity_pct_gdp": 50,
      "gravity_pct_population": 50,
      "gravity_pct_military": 50
    }'::jsonb,
    'Config Influence : mult_gdp, mult_population, mult_military ; stability_modifier_min/max (échelle -3 à +3) ; gravity_pct_gdp, gravity_pct_population, gravity_pct_military (0-100).'
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;
