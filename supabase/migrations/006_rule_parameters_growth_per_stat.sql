-- Paramètres de croissance par stat (PIB et démographie) + mise à jour du cron.
-- Base + pondération par Militarisme, Industrie, Science, Stabilité (affichage FR : Croissance économique/démographique basique, puis par stat).

INSERT INTO public.rule_parameters (key, value, description)
VALUES
  ('gdp_growth_base_rate', '0.0005'::jsonb, 'Taux de base pour la croissance du PIB'),
  ('population_growth_base_rate', '0.001'::jsonb, 'Taux de base pour la croissance démographique')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.rule_parameters (key, value, description)
VALUES
  ('gdp_growth_per_militarism', '0'::jsonb, 'Coefficient croissance PIB par point de Militarisme (0-10)'),
  ('gdp_growth_per_industry', '0'::jsonb, 'Coefficient croissance PIB par point d''Industrie (0-10)'),
  ('gdp_growth_per_science', '0'::jsonb, 'Coefficient croissance PIB par point de Science (0-10)'),
  ('gdp_growth_per_stability', '0'::jsonb, 'Coefficient croissance PIB par point de Stabilité (-3 à 3)'),
  ('population_growth_per_militarism', '0'::jsonb, 'Coefficient croissance démographique par point de Militarisme'),
  ('population_growth_per_industry', '0'::jsonb, 'Coefficient croissance démographique par point d''Industrie'),
  ('population_growth_per_science', '0'::jsonb, 'Coefficient croissance démographique par point de Science'),
  ('population_growth_per_stability', '0'::jsonb, 'Coefficient croissance démographique par point de Stabilité')
ON CONFLICT (key) DO NOTHING;

-- Cron : formule = base + (militarism * param_mil) + (industry * param_ind) + (science * param_sci) + (stability * param_stab)
CREATE OR REPLACE FUNCTION public.run_daily_country_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pop_base numeric;
  gdp_base numeric;
  gdp_per_mil numeric;
  gdp_per_ind numeric;
  gdp_per_sci numeric;
  gdp_per_stab numeric;
  pop_per_mil numeric;
  pop_per_ind numeric;
  pop_per_sci numeric;
  pop_per_stab numeric;
BEGIN
  -- 1) Snapshot : enregistrer l'état actuel dans country_history (date = aujourd'hui)
  INSERT INTO public.country_history (
    country_id,
    date,
    population,
    gdp,
    militarism,
    industry,
    science,
    stability
  )
  SELECT
    c.id,
    current_date,
    c.population,
    c.gdp,
    c.militarism,
    c.industry,
    c.science,
    c.stability
  FROM public.countries c
  ON CONFLICT (country_id, date)
  DO UPDATE SET
    population = EXCLUDED.population,
    gdp = EXCLUDED.gdp,
    militarism = EXCLUDED.militarism,
    industry = EXCLUDED.industry,
    science = EXCLUDED.science,
    stability = EXCLUDED.stability;

  -- 2) Lire tous les paramètres de croissance
  SELECT COALESCE((value #>> '{}')::numeric, 0.001) INTO pop_base
  FROM public.rule_parameters WHERE key = 'population_growth_base_rate' LIMIT 1;
  SELECT COALESCE((value #>> '{}')::numeric, 0.0005) INTO gdp_base
  FROM public.rule_parameters WHERE key = 'gdp_growth_base_rate' LIMIT 1;

  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO gdp_per_mil FROM public.rule_parameters WHERE key = 'gdp_growth_per_militarism' LIMIT 1;
  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO gdp_per_ind FROM public.rule_parameters WHERE key = 'gdp_growth_per_industry' LIMIT 1;
  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO gdp_per_sci FROM public.rule_parameters WHERE key = 'gdp_growth_per_science' LIMIT 1;
  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO gdp_per_stab FROM public.rule_parameters WHERE key = 'gdp_growth_per_stability' LIMIT 1;

  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO pop_per_mil FROM public.rule_parameters WHERE key = 'population_growth_per_militarism' LIMIT 1;
  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO pop_per_ind FROM public.rule_parameters WHERE key = 'population_growth_per_industry' LIMIT 1;
  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO pop_per_sci FROM public.rule_parameters WHERE key = 'population_growth_per_science' LIMIT 1;
  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO pop_per_stab FROM public.rule_parameters WHERE key = 'population_growth_per_stability' LIMIT 1;

  -- 3) Mise à jour des pays : taux = base + (militarism * param_mil) + (industry * param_ind) + (science * param_sci) + (stability * param_stab)
  UPDATE public.countries c
  SET
    population = GREATEST(0, (
      c.population + c.population * (
        pop_base
        + COALESCE(c.militarism, 0) * pop_per_mil
        + COALESCE(c.industry, 0) * pop_per_ind
        + COALESCE(c.science, 0) * pop_per_sci
        + COALESCE(c.stability, 0) * pop_per_stab
      )
    )::bigint),
    gdp = GREATEST(0, (
      c.gdp + c.gdp * (
        gdp_base
        + COALESCE(c.militarism, 0) * gdp_per_mil
        + COALESCE(c.industry, 0) * gdp_per_ind
        + COALESCE(c.science, 0) * gdp_per_sci
        + COALESCE(c.stability, 0) * gdp_per_stab
      )
    )),
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.run_daily_country_update() IS
  'Cron quotidien : snapshot country_history puis mise à jour population/PIB avec croissance de base + pondération par stats (militarisme, industrie, science, stabilité).';
