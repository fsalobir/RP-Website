-- Appliquer les country_effects (croissance PIB/population, stat_delta) et les bonus budget
-- dans le cron quotidien. Sans cela, les effets actifs ne modifiaient pas les pays.

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

  -- 2) Lire les paramètres de croissance (rule_parameters)
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

  -- 3) Mise à jour des pays : tous les taux (PIB, population) sont ADDITIFS :
  --    taux_final = base (rule_parameters) + contribution des stats + somme des effets actifs + bonus budget.
  --    Ex. base +2% et effet actif -95% => -93% de croissance ce jour-là.
  WITH
  -- Effets croissance : value peut être en % (ex. -95) ou en décimal (ex. -0.95). Si |value| > 1 on traite comme %.
  pop_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat') AND duration_remaining > 0
    GROUP BY country_id
  ),
  gdp_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat') AND duration_remaining > 0
    GROUP BY country_id
  ),
  stat_effects AS (
    SELECT
      country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM public.country_effects
    WHERE effect_kind = 'stat_delta' AND duration_remaining > 0
      AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  budget_bonuses AS (
    SELECT
      b.country_id,
      (b.pct_sante / 100.0) * COALESCE((SELECT (value->'bonuses'->>'population')::numeric FROM public.rule_parameters WHERE key = 'budget_sante' LIMIT 1), 0) AS pop_rate,
      (b.pct_infrastructure / 100.0) * COALESCE((SELECT (value->'bonuses'->>'gdp')::numeric FROM public.rule_parameters WHERE key = 'budget_infrastructure' LIMIT 1), 0)
        + (b.pct_affaires_etrangeres / 100.0) * COALESCE((SELECT (value->'bonuses'->>'gdp')::numeric FROM public.rule_parameters WHERE key = 'budget_affaires_etrangeres' LIMIT 1), 0) AS gdp_rate,
      (b.pct_defense / 100.0) * COALESCE((SELECT (value->'bonuses'->>'militarism')::numeric FROM public.rule_parameters WHERE key = 'budget_defense' LIMIT 1), 0) AS mil_delta,
      (b.pct_infrastructure / 100.0) * COALESCE((SELECT (value->'bonuses'->>'industry')::numeric FROM public.rule_parameters WHERE key = 'budget_infrastructure' LIMIT 1), 0)
        + (b.pct_industrie / 100.0) * COALESCE((SELECT (value->'bonuses'->>'industry')::numeric FROM public.rule_parameters WHERE key = 'budget_industrie' LIMIT 1), 0) AS ind_delta,
      (b.pct_education / 100.0) * COALESCE((SELECT (value->'bonuses'->>'science')::numeric FROM public.rule_parameters WHERE key = 'budget_education' LIMIT 1), 0)
        + (b.pct_recherche / 100.0) * COALESCE((SELECT (value->'bonuses'->>'science')::numeric FROM public.rule_parameters WHERE key = 'budget_recherche' LIMIT 1), 0) AS sci_delta,
      (b.pct_education / 100.0) * COALESCE((SELECT (value->'bonuses'->>'stability')::numeric FROM public.rule_parameters WHERE key = 'budget_education' LIMIT 1), 0)
        + (b.pct_interieur / 100.0) * COALESCE((SELECT (value->'bonuses'->>'stability')::numeric FROM public.rule_parameters WHERE key = 'budget_interieur' LIMIT 1), 0)
        + (b.pct_affaires_etrangeres / 100.0) * COALESCE((SELECT (value->'bonuses'->>'stability')::numeric FROM public.rule_parameters WHERE key = 'budget_affaires_etrangeres' LIMIT 1), 0) AS stab_delta
    FROM public.country_budget b
  ),
  country_updates AS (
    SELECT
      c.id AS country_id,
      COALESCE(pe.rate, 0) AS pop_effect_rate,
      COALESCE(ge.rate, 0) AS gdp_effect_rate,
      COALESCE(se.delta_mil, 0) AS delta_mil,
      COALESCE(se.delta_ind, 0) AS delta_ind,
      COALESCE(se.delta_sci, 0) AS delta_sci,
      COALESCE(se.delta_stab, 0) AS delta_stab,
      COALESCE(bb.pop_rate, 0) AS budget_pop_rate,
      COALESCE(bb.gdp_rate, 0) AS budget_gdp_rate,
      COALESCE(bb.mil_delta, 0) AS budget_mil,
      COALESCE(bb.ind_delta, 0) AS budget_ind,
      COALESCE(bb.sci_delta, 0) AS budget_sci,
      COALESCE(bb.stab_delta, 0) AS budget_stab
    FROM public.countries c
    LEFT JOIN pop_effects pe ON pe.country_id = c.id
    LEFT JOIN gdp_effects ge ON ge.country_id = c.id
    LEFT JOIN stat_effects se ON se.country_id = c.id
    LEFT JOIN budget_bonuses bb ON bb.country_id = c.id
  )
  UPDATE public.countries c
  SET
    population = GREATEST(0, (
      c.population + c.population * (
        pop_base
        + COALESCE(c.militarism, 0) * pop_per_mil
        + COALESCE(c.industry, 0) * pop_per_ind
        + COALESCE(c.science, 0) * pop_per_sci
        + COALESCE(c.stability, 0) * pop_per_stab
        + u.pop_effect_rate
        + u.budget_pop_rate
      )
    )::bigint),
    gdp = GREATEST(0, (
      c.gdp + c.gdp * (
        gdp_base
        + COALESCE(c.militarism, 0) * gdp_per_mil
        + COALESCE(c.industry, 0) * gdp_per_ind
        + COALESCE(c.science, 0) * gdp_per_sci
        + COALESCE(c.stability, 0) * gdp_per_stab
        + u.gdp_effect_rate
        + u.budget_gdp_rate
      )
    )),
    -- Bonus budget stats sont en "delta/jour" très petits (ex. 0.05×10%=0.005) ; on scale ×50 pour avoir un impact visible après arrondi (ex. 20% Intérieur → +1 stabilité/jour).
    militarism = LEAST(10, GREATEST(0, ROUND((COALESCE(c.militarism, 0) + u.delta_mil + u.budget_mil * 50.0)::numeric, 0)))::smallint,
    industry   = LEAST(10, GREATEST(0, ROUND((COALESCE(c.industry, 0)   + u.delta_ind + u.budget_ind * 50.0)::numeric, 0)))::smallint,
    science    = LEAST(10, GREATEST(0, ROUND((COALESCE(c.science, 0)    + u.delta_sci + u.budget_sci * 50.0)::numeric, 0)))::smallint,
    stability  = LEAST(3, GREATEST(-3, ROUND((COALESCE(c.stability, 0) + u.delta_stab + u.budget_stab * 50.0)::numeric, 0)))::smallint,
    updated_at = now()
  FROM country_updates u
  WHERE c.id = u.country_id;

  -- 4) Effets : décrémenter la durée restante, supprimer si <= 0
  UPDATE public.country_effects SET duration_remaining = duration_remaining - 1 WHERE duration_remaining > 0;
  DELETE FROM public.country_effects WHERE duration_remaining <= 0;
END;
$$;

COMMENT ON FUNCTION public.run_daily_country_update() IS
  'Cron quotidien : snapshot country_history, mise à jour population/PIB/stats (rule_parameters + country_effects + bonus budget), puis décrément/suppression des country_effects.';
