-- À la fin de chaque run du cron, avancer la date du monde selon world_date_advance_months.

CREATE OR REPLACE FUNCTION public.run_daily_country_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_at timestamptz;
  mobilisation_daily_step integer;
  v_month int;
  v_year int;
  v_advance int;
BEGIN
  v_run_at := now();

  INSERT INTO public.country_history (
    country_id, date, population, gdp, militarism, industry, science, stability
  )
  SELECT c.id, current_date, c.population, c.gdp, c.militarism, c.industry, c.science, c.stability
  FROM public.countries c
  ON CONFLICT (country_id, date)
  DO UPDATE SET
    population = EXCLUDED.population, gdp = EXCLUDED.gdp,
    militarism = EXCLUDED.militarism, industry = EXCLUDED.industry,
    science = EXCLUDED.science, stability = EXCLUDED.stability;

  SELECT COALESCE((value->'daily_step')::text::integer, 20) INTO mobilisation_daily_step
  FROM public.rule_parameters WHERE key = 'mobilisation_config' LIMIT 1;

  UPDATE public.country_mobilisation cm
  SET score = LEAST(500, GREATEST(0,
      cm.score + SIGN(cm.target_score - cm.score) * LEAST(mobilisation_daily_step, ABS(cm.target_score - cm.score)))),
    updated_at = now();

  WITH
  global_growth_rates AS (
    SELECT c.id AS country_id,
      SUM(CASE WHEN e->>'effect_kind' = 'gdp_growth_base' THEN (e->>'value')::numeric
          WHEN e->>'effect_kind' = 'gdp_growth_per_stat' THEN (e->>'value')::numeric * CASE e->>'effect_target'
            WHEN 'militarism' THEN COALESCE(c.militarism, 0) WHEN 'industry' THEN COALESCE(c.industry, 0)
            WHEN 'science' THEN COALESCE(c.science, 0) WHEN 'stability' THEN COALESCE(c.stability, 0) ELSE 0 END
          ELSE 0 END) AS gdp_global_rate,
      SUM(CASE WHEN e->>'effect_kind' = 'population_growth_base' THEN (e->>'value')::numeric
          WHEN e->>'effect_kind' = 'population_growth_per_stat' THEN (e->>'value')::numeric * CASE e->>'effect_target'
            WHEN 'militarism' THEN COALESCE(c.militarism, 0) WHEN 'industry' THEN COALESCE(c.industry, 0)
            WHEN 'science' THEN COALESCE(c.science, 0) WHEN 'stability' THEN COALESCE(c.stability, 0) ELSE 0 END
          ELSE 0 END) AS pop_global_rate
    FROM public.countries c
    CROSS JOIN public.rule_parameters r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.value, '[]'::jsonb)) AS e
    WHERE r.key = 'global_growth_effects'
    GROUP BY c.id
  ),
  mobilisation_levels AS (
    SELECT cm.country_id, cm.score,
      (SELECT j.key FROM rule_parameters r, LATERAL jsonb_each_text(r.value->'level_thresholds') AS j(key, val)
       WHERE r.key = 'mobilisation_config' AND (val::numeric) <= COALESCE(cm.score, 0)
       ORDER BY (val::numeric) DESC LIMIT 1) AS level_key
    FROM country_mobilisation cm
  ),
  mobilisation_effects AS (
    SELECT ml.country_id, (e->>'effect_kind') AS effect_kind, (e->>'effect_target') AS effect_target, (e->>'value')::numeric AS value
    FROM mobilisation_levels ml, rule_parameters r, LATERAL jsonb_array_elements(r.value) AS e
    WHERE r.key = 'mobilisation_level_effects' AND (e->>'level') = ml.level_key
  ),
  pop_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat') AND duration_remaining > 0
    GROUP BY country_id
  ),
  pop_effects_mob AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM mobilisation_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
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
    FROM mobilisation_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  stat_effects AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM public.country_effects
    WHERE effect_kind = 'stat_delta' AND duration_remaining > 0 AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_mob AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM mobilisation_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  global_stat_effects AS (
    SELECT c.id AS country_id, (e->>'effect_target') AS effect_target, (e->>'value')::numeric AS value
    FROM public.countries c
    CROSS JOIN public.rule_parameters r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.value, '[]'::jsonb)) AS e
    WHERE r.key = 'global_growth_effects'
      AND e->>'effect_kind' = 'stat_delta'
      AND e->>'effect_target' IN ('militarism', 'industry', 'science', 'stability')
  ),
  stat_effects_global AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM global_stat_effects
    GROUP BY country_id
  ),
  budget_bonuses AS (
    SELECT b.country_id,
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
    SELECT c.id AS country_id,
      COALESCE(ggr.pop_global_rate, 0) AS pop_global_rate,
      COALESCE(ggr.gdp_global_rate, 0) AS gdp_global_rate,
      COALESCE(pe.rate, 0) + COALESCE(pem.rate, 0) AS pop_effect_rate,
      COALESCE(ge.rate, 0) + COALESCE(gem.rate, 0) AS gdp_effect_rate,
      COALESCE(se.delta_mil, 0) + COALESCE(sem.delta_mil, 0) + COALESCE(seg.delta_mil, 0) AS delta_mil,
      COALESCE(se.delta_ind, 0) + COALESCE(sem.delta_ind, 0) + COALESCE(seg.delta_ind, 0) AS delta_ind,
      COALESCE(se.delta_sci, 0) + COALESCE(sem.delta_sci, 0) + COALESCE(seg.delta_sci, 0) AS delta_sci,
      COALESCE(se.delta_stab, 0) + COALESCE(sem.delta_stab, 0) + COALESCE(seg.delta_stab, 0) AS delta_stab,
      COALESCE(bb.pop_rate, 0) AS budget_pop_rate, COALESCE(bb.gdp_rate, 0) AS budget_gdp_rate,
      COALESCE(bb.mil_delta, 0) AS budget_mil, COALESCE(bb.ind_delta, 0) AS budget_ind,
      COALESCE(bb.sci_delta, 0) AS budget_sci, COALESCE(bb.stab_delta, 0) AS budget_stab
    FROM public.countries c
    LEFT JOIN global_growth_rates ggr ON ggr.country_id = c.id
    LEFT JOIN pop_effects pe ON pe.country_id = c.id
    LEFT JOIN pop_effects_mob pem ON pem.country_id = c.id
    LEFT JOIN gdp_effects ge ON ge.country_id = c.id
    LEFT JOIN gdp_effects_mob gem ON gem.country_id = c.id
    LEFT JOIN stat_effects se ON se.country_id = c.id
    LEFT JOIN stat_effects_mob sem ON sem.country_id = c.id
    LEFT JOIN stat_effects_global seg ON seg.country_id = c.id
    LEFT JOIN budget_bonuses bb ON bb.country_id = c.id
  )
  INSERT INTO public.country_update_logs (country_id, run_at, inputs, population_before, gdp_before, militarism_before, industry_before, science_before, stability_before)
  SELECT c.id, v_run_at,
    jsonb_build_object(
      'pop_global_rate', u.pop_global_rate, 'gdp_global_rate', u.gdp_global_rate,
      'pop_effect_rate', u.pop_effect_rate, 'gdp_effect_rate', u.gdp_effect_rate,
      'delta_mil', u.delta_mil, 'delta_ind', u.delta_ind, 'delta_sci', u.delta_sci, 'delta_stab', u.delta_stab,
      'budget_pop_rate', u.budget_pop_rate, 'budget_gdp_rate', u.budget_gdp_rate,
      'budget_mil', u.budget_mil, 'budget_ind', u.budget_ind, 'budget_sci', u.budget_sci, 'budget_stab', u.budget_stab
    ),
    c.population, c.gdp, c.militarism, c.industry, c.science, c.stability
  FROM public.countries c
  JOIN country_updates u ON u.country_id = c.id;

  WITH
  global_growth_rates AS (
    SELECT c.id AS country_id,
      SUM(CASE WHEN e->>'effect_kind' = 'gdp_growth_base' THEN (e->>'value')::numeric
          WHEN e->>'effect_kind' = 'gdp_growth_per_stat' THEN (e->>'value')::numeric * CASE e->>'effect_target'
            WHEN 'militarism' THEN COALESCE(c.militarism, 0) WHEN 'industry' THEN COALESCE(c.industry, 0)
            WHEN 'science' THEN COALESCE(c.science, 0) WHEN 'stability' THEN COALESCE(c.stability, 0) ELSE 0 END
          ELSE 0 END) AS gdp_global_rate,
      SUM(CASE WHEN e->>'effect_kind' = 'population_growth_base' THEN (e->>'value')::numeric
          WHEN e->>'effect_kind' = 'population_growth_per_stat' THEN (e->>'value')::numeric * CASE e->>'effect_target'
            WHEN 'militarism' THEN COALESCE(c.militarism, 0) WHEN 'industry' THEN COALESCE(c.industry, 0)
            WHEN 'science' THEN COALESCE(c.science, 0) WHEN 'stability' THEN COALESCE(c.stability, 0) ELSE 0 END
          ELSE 0 END) AS pop_global_rate
    FROM public.countries c
    CROSS JOIN public.rule_parameters r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.value, '[]'::jsonb)) AS e
    WHERE r.key = 'global_growth_effects'
    GROUP BY c.id
  ),
  mobilisation_levels AS (
    SELECT cm.country_id, cm.score,
      (SELECT j.key FROM rule_parameters r, LATERAL jsonb_each_text(r.value->'level_thresholds') AS j(key, val)
       WHERE r.key = 'mobilisation_config' AND (val::numeric) <= COALESCE(cm.score, 0)
       ORDER BY (val::numeric) DESC LIMIT 1) AS level_key
    FROM country_mobilisation cm
  ),
  mobilisation_effects AS (
    SELECT ml.country_id, (e->>'effect_kind') AS effect_kind, (e->>'effect_target') AS effect_target, (e->>'value')::numeric AS value
    FROM mobilisation_levels ml, rule_parameters r, LATERAL jsonb_array_elements(r.value) AS e
    WHERE r.key = 'mobilisation_level_effects' AND (e->>'level') = ml.level_key
  ),
  pop_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat') AND duration_remaining > 0
    GROUP BY country_id
  ),
  pop_effects_mob AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM mobilisation_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
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
    FROM mobilisation_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  stat_effects AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM public.country_effects
    WHERE effect_kind = 'stat_delta' AND duration_remaining > 0 AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_mob AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM mobilisation_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  global_stat_effects AS (
    SELECT c.id AS country_id, (e->>'effect_target') AS effect_target, (e->>'value')::numeric AS value
    FROM public.countries c
    CROSS JOIN public.rule_parameters r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.value, '[]'::jsonb)) AS e
    WHERE r.key = 'global_growth_effects'
      AND e->>'effect_kind' = 'stat_delta'
      AND e->>'effect_target' IN ('militarism', 'industry', 'science', 'stability')
  ),
  stat_effects_global AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM global_stat_effects
    GROUP BY country_id
  ),
  budget_bonuses AS (
    SELECT b.country_id,
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
    SELECT c.id AS country_id,
      COALESCE(ggr.pop_global_rate, 0) AS pop_global_rate,
      COALESCE(ggr.gdp_global_rate, 0) AS gdp_global_rate,
      COALESCE(pe.rate, 0) + COALESCE(pem.rate, 0) AS pop_effect_rate,
      COALESCE(ge.rate, 0) + COALESCE(gem.rate, 0) AS gdp_effect_rate,
      COALESCE(se.delta_mil, 0) + COALESCE(sem.delta_mil, 0) + COALESCE(seg.delta_mil, 0) AS delta_mil,
      COALESCE(se.delta_ind, 0) + COALESCE(sem.delta_ind, 0) + COALESCE(seg.delta_ind, 0) AS delta_ind,
      COALESCE(se.delta_sci, 0) + COALESCE(sem.delta_sci, 0) + COALESCE(seg.delta_sci, 0) AS delta_sci,
      COALESCE(se.delta_stab, 0) + COALESCE(sem.delta_stab, 0) + COALESCE(seg.delta_stab, 0) AS delta_stab,
      COALESCE(bb.pop_rate, 0) AS budget_pop_rate, COALESCE(bb.gdp_rate, 0) AS budget_gdp_rate,
      COALESCE(bb.mil_delta, 0) AS budget_mil, COALESCE(bb.ind_delta, 0) AS budget_ind,
      COALESCE(bb.sci_delta, 0) AS budget_sci, COALESCE(bb.stab_delta, 0) AS budget_stab
    FROM public.countries c
    LEFT JOIN global_growth_rates ggr ON ggr.country_id = c.id
    LEFT JOIN pop_effects pe ON pe.country_id = c.id
    LEFT JOIN pop_effects_mob pem ON pem.country_id = c.id
    LEFT JOIN gdp_effects ge ON ge.country_id = c.id
    LEFT JOIN gdp_effects_mob gem ON gem.country_id = c.id
    LEFT JOIN stat_effects se ON se.country_id = c.id
    LEFT JOIN stat_effects_mob sem ON sem.country_id = c.id
    LEFT JOIN stat_effects_global seg ON seg.country_id = c.id
    LEFT JOIN budget_bonuses bb ON bb.country_id = c.id
  )
  UPDATE public.countries c
  SET
    population = GREATEST(0, (c.population + c.population * (u.pop_global_rate + u.pop_effect_rate + u.budget_pop_rate))::bigint),
    gdp = GREATEST(0, (c.gdp + c.gdp * (u.gdp_global_rate + u.gdp_effect_rate + u.budget_gdp_rate))),
    militarism = LEAST(10, GREATEST(0, ROUND((COALESCE(c.militarism, 0) + u.delta_mil + u.budget_mil * 50.0)::numeric, 0)))::smallint,
    industry   = LEAST(10, GREATEST(0, ROUND((COALESCE(c.industry, 0)   + u.delta_ind + u.budget_ind * 50.0)::numeric, 0)))::smallint,
    science    = LEAST(10, GREATEST(0, ROUND((COALESCE(c.science, 0)    + u.delta_sci + u.budget_sci * 50.0)::numeric, 0)))::smallint,
    stability  = LEAST(3, GREATEST(-3, ROUND((COALESCE(c.stability, 0) + u.delta_stab + u.budget_stab * 50.0)::numeric, 0)))::smallint,
    updated_at = now()
  FROM country_updates u
  WHERE c.id = u.country_id;

  UPDATE public.country_update_logs l SET
    population_after = c.population, gdp_after = c.gdp,
    militarism_after = c.militarism, industry_after = c.industry, science_after = c.science, stability_after = c.stability
  FROM public.countries c WHERE l.country_id = c.id AND l.run_at = v_run_at;

  UPDATE public.country_effects SET duration_remaining = duration_remaining - 1 WHERE duration_remaining > 0;
  DELETE FROM public.country_effects WHERE duration_remaining <= 0;

  -- Avancer la date du monde selon world_date_advance_months
  SELECT (value->>'month')::int, (value->>'year')::int INTO v_month, v_year
  FROM public.rule_parameters WHERE key = 'world_date' LIMIT 1;
  SELECT COALESCE((value)::text::int, 1) INTO v_advance
  FROM public.rule_parameters WHERE key = 'world_date_advance_months' LIMIT 1;

  IF v_month IS NOT NULL AND v_year IS NOT NULL AND v_advance IS NOT NULL THEN
    v_month := v_month + v_advance;
    WHILE v_month > 12 LOOP v_month := v_month - 12; v_year := v_year + 1; END LOOP;
    WHILE v_month < 1 LOOP v_month := v_month + 12; v_year := v_year - 1; END LOOP;
    UPDATE public.rule_parameters
    SET value = jsonb_build_object('month', v_month, 'year', v_year), updated_at = now()
    WHERE key = 'world_date';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.run_daily_country_update() IS
  'Cron quotidien : snapshot country_history, évolution score mobilisation, logs country_update_logs (inputs + avant/après), mise à jour pays, décrément country_effects, avancement date du monde.';
