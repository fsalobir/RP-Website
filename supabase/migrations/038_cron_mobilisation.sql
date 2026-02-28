-- Cron : faire évoluer le score de mobilisation vers la cible et appliquer les effets du palier de mobilisation.

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
  mobilisation_daily_step integer;
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

  -- 2) Mobilisation : faire évoluer score vers target_score (au plus daily_step par jour)
  SELECT COALESCE((value->'daily_step')::text::integer, 20) INTO mobilisation_daily_step
  FROM public.rule_parameters WHERE key = 'mobilisation_config' LIMIT 1;

  UPDATE public.country_mobilisation cm
  SET
    score = LEAST(500, GREATEST(0,
      cm.score + SIGN(cm.target_score - cm.score) * LEAST(mobilisation_daily_step, ABS(cm.target_score - cm.score))
    )),
    updated_at = now();

  -- 3) Lire les paramètres de croissance (rule_parameters)
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

  -- 4) Mise à jour des pays : country_effects + bonus budget + effets du palier de mobilisation
  WITH
  -- Niveau de mobilisation par pays (plus grand seuil <= score)
  mobilisation_levels AS (
    SELECT
      cm.country_id,
      cm.score,
      (
        SELECT j.key
        FROM rule_parameters r,
             LATERAL jsonb_each_text(r.value->'level_thresholds') AS j(key, val)
        WHERE r.key = 'mobilisation_config'
          AND (val::numeric) <= COALESCE(cm.score, 0)
        ORDER BY (val::numeric) DESC
        LIMIT 1
      ) AS level_key
    FROM country_mobilisation cm
  ),
  -- Effets mobilisation : lignes (country_id, effect_kind, effect_target, value) pour chaque pays à partir du niveau
  mobilisation_effects AS (
    SELECT
      ml.country_id,
      (e->>'effect_kind') AS effect_kind,
      (e->>'effect_target') AS effect_target,
      (e->>'value')::numeric AS value
    FROM mobilisation_levels ml,
         rule_parameters r,
         LATERAL jsonb_array_elements(r.value) AS e
    WHERE r.key = 'mobilisation_level_effects'
      AND (e->>'level') = ml.level_key
  ),
  pop_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat') AND duration_remaining > 0
    GROUP BY country_id
  ),
  pop_effects_mob AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM mobilisation_effects
    WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
    GROUP BY country_id
  ),
  gdp_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat') AND duration_remaining > 0
    GROUP BY country_id
  ),
  gdp_effects_mob AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM mobilisation_effects
    WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
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
  stat_effects_mob AS (
    SELECT
      country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM mobilisation_effects
    WHERE effect_kind = 'stat_delta'
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
      COALESCE(pe.rate, 0) + COALESCE(pem.rate, 0) AS pop_effect_rate,
      COALESCE(ge.rate, 0) + COALESCE(gem.rate, 0) AS gdp_effect_rate,
      COALESCE(se.delta_mil, 0) + COALESCE(sem.delta_mil, 0) AS delta_mil,
      COALESCE(se.delta_ind, 0) + COALESCE(sem.delta_ind, 0) AS delta_ind,
      COALESCE(se.delta_sci, 0) + COALESCE(sem.delta_sci, 0) AS delta_sci,
      COALESCE(se.delta_stab, 0) + COALESCE(sem.delta_stab, 0) AS delta_stab,
      COALESCE(bb.pop_rate, 0) AS budget_pop_rate,
      COALESCE(bb.gdp_rate, 0) AS budget_gdp_rate,
      COALESCE(bb.mil_delta, 0) AS budget_mil,
      COALESCE(bb.ind_delta, 0) AS budget_ind,
      COALESCE(bb.sci_delta, 0) AS budget_sci,
      COALESCE(bb.stab_delta, 0) AS budget_stab
    FROM public.countries c
    LEFT JOIN pop_effects pe ON pe.country_id = c.id
    LEFT JOIN pop_effects_mob pem ON pem.country_id = c.id
    LEFT JOIN gdp_effects ge ON ge.country_id = c.id
    LEFT JOIN gdp_effects_mob gem ON gem.country_id = c.id
    LEFT JOIN stat_effects se ON se.country_id = c.id
    LEFT JOIN stat_effects_mob sem ON sem.country_id = c.id
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
    militarism = LEAST(10, GREATEST(0, ROUND((COALESCE(c.militarism, 0) + u.delta_mil + u.budget_mil * 50.0)::numeric, 0)))::smallint,
    industry   = LEAST(10, GREATEST(0, ROUND((COALESCE(c.industry, 0)   + u.delta_ind + u.budget_ind * 50.0)::numeric, 0)))::smallint,
    science    = LEAST(10, GREATEST(0, ROUND((COALESCE(c.science, 0)    + u.delta_sci + u.budget_sci * 50.0)::numeric, 0)))::smallint,
    stability  = LEAST(3, GREATEST(-3, ROUND((COALESCE(c.stability, 0) + u.delta_stab + u.budget_stab * 50.0)::numeric, 0)))::smallint,
    updated_at = now()
  FROM country_updates u
  WHERE c.id = u.country_id;

  -- 5) Effets : décrémenter la durée restante, supprimer si <= 0
  UPDATE public.country_effects SET duration_remaining = duration_remaining - 1 WHERE duration_remaining > 0;
  DELETE FROM public.country_effects WHERE duration_remaining <= 0;
END;
$$;

COMMENT ON FUNCTION public.run_daily_country_update() IS
  'Cron quotidien : snapshot country_history, évolution score mobilisation, mise à jour pays (rule_parameters + country_effects + mobilisation + bonus budget), décrément country_effects.';
