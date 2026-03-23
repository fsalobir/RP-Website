-- Étend run_daily_country_update pour inclure les effets IA, idéologie et avantages (perk_effects)
-- dans les calculs croissance/stats, avec garde sur countries.ai_status.
-- Les effets globaux MJ (global_growth_effects) étaient déjà pris en compte.

CREATE OR REPLACE FUNCTION public.run_daily_country_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_at timestamptz;
  v_month int;
  v_year int;
  v_advance int;
  v_intel_config jsonb;
  v_decay_mode text;
  v_decay_flat numeric;
  v_decay_pct numeric;
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

  UPDATE public.country_laws cl
  SET
    score = LEAST(500, GREATEST(0,
      cl.score + SIGN(cl.target_score - cl.score) * LEAST(
        COALESCE(
          (SELECT (rp.value->>'daily_step')::int
           FROM public.rule_parameters rp
           WHERE rp.key = CASE cl.law_key
             WHEN 'mobilisation' THEN 'mobilisation_config'
             WHEN 'auto_industry' THEN 'law_auto_industry_config'
             WHEN 'air_industry' THEN 'law_air_industry_config'
             WHEN 'naval_industry' THEN 'law_naval_industry_config'
             WHEN 'research' THEN 'law_research_config'
           END
           LIMIT 1),
          20),
        ABS(cl.target_score - cl.score)
      )
    )),
    updated_at = now()
  WHERE cl.score != cl.target_score;

  WITH
  law_levels AS (
    SELECT cl.country_id, cl.law_key, cl.score,
      (SELECT j.key
       FROM public.rule_parameters rp,
            LATERAL jsonb_each_text(rp.value->'level_thresholds') AS j(key, val)
       WHERE rp.key = CASE cl.law_key
         WHEN 'mobilisation' THEN 'mobilisation_config'
         WHEN 'auto_industry' THEN 'law_auto_industry_config'
         WHEN 'air_industry' THEN 'law_air_industry_config'
         WHEN 'naval_industry' THEN 'law_naval_industry_config'
         WHEN 'research' THEN 'law_research_config'
       END
         AND (val::numeric) <= COALESCE(cl.score, 0)
       ORDER BY (val::numeric) DESC
       LIMIT 1
      ) AS level_key
    FROM public.country_laws cl
  ),
  law_effects AS (
    SELECT ll.country_id,
           (e->>'effect_kind') AS effect_kind,
           (e->>'effect_target') AS effect_target,
           public.parse_effect_value(e) AS value
    FROM law_levels ll,
         public.rule_parameters rp,
         LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(rp.value) = 'array' THEN rp.value ELSE rp.value->'value' END, '[]'::jsonb)) AS e
    WHERE rp.key = CASE ll.law_key
      WHEN 'mobilisation' THEN 'mobilisation_level_effects'
      WHEN 'auto_industry' THEN 'law_auto_industry_level_effects'
      WHEN 'air_industry' THEN 'law_air_industry_level_effects'
      WHEN 'naval_industry' THEN 'law_naval_industry_level_effects'
      WHEN 'research' THEN 'law_research_level_effects'
    END
      AND (e->>'level') = ll.level_key
  ),
  ai_effects AS (
    SELECT
      c.id AS country_id,
      (e->>'effect_kind') AS effect_kind,
      (e->>'effect_target') AS effect_target,
      public.parse_effect_value(e) AS value
    FROM public.countries c
    JOIN public.rule_parameters rp
      ON rp.key = CASE
        WHEN c.ai_status = 'major' THEN 'ai_major_effects'
        WHEN c.ai_status = 'minor' THEN 'ai_minor_effects'
        ELSE NULL
      END
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(rp.value) = 'array' THEN rp.value ELSE rp.value->'value' END, '[]'::jsonb)) AS e
    WHERE c.ai_status IN ('major', 'minor')
  ),
  ideology_effects AS (
    SELECT
      c.id AS country_id,
      (e->>'effect_kind') AS effect_kind,
      (e->>'effect_target') AS effect_target,
      public.parse_effect_value(e)
      * (
        CASE (e->>'ideology_id')
          WHEN 'germanic_monarchy' THEN COALESCE(c.ideology_germanic_monarchy, 0)
          WHEN 'merina_monarchy' THEN COALESCE(c.ideology_merina_monarchy, 0)
          WHEN 'french_republicanism' THEN COALESCE(c.ideology_french_republicanism, 0)
          WHEN 'mughal_republicanism' THEN COALESCE(c.ideology_mughal_republicanism, 0)
          WHEN 'nilotique_cultism' THEN COALESCE(c.ideology_nilotique_cultism, 0)
          WHEN 'satoiste_cultism' THEN COALESCE(c.ideology_satoiste_cultism, 0)
          ELSE 0
        END
      ) / 100.0 AS value
    FROM public.countries c
    CROSS JOIN public.rule_parameters rp
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(rp.value) = 'array' THEN rp.value ELSE rp.value->'value' END, '[]'::jsonb)) AS e
    WHERE rp.key = 'ideology_effects'
  ),
  active_perk_effects AS (
    SELECT
      c.id AS country_id,
      pe.effect_kind,
      pe.effect_target,
      pe.value
    FROM public.countries c
    INNER JOIN public.perks p ON true
    INNER JOIN public.perk_effects pe ON pe.perk_id = p.id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.perk_requirements pr
      WHERE pr.perk_id = p.id
        AND (
          (pr.requirement_kind = 'stat' AND pr.requirement_target = 'militarism' AND COALESCE(c.militarism, 0) < pr.value)
          OR (pr.requirement_kind = 'stat' AND pr.requirement_target = 'industry' AND COALESCE(c.industry, 0) < pr.value)
          OR (pr.requirement_kind = 'stat' AND pr.requirement_target = 'science' AND COALESCE(c.science, 0) < pr.value)
          OR (pr.requirement_kind = 'stat' AND pr.requirement_target = 'stability' AND COALESCE(c.stability, 0) < pr.value)
          OR (pr.requirement_kind = 'gdp' AND COALESCE(c.gdp, 0) < pr.value)
          OR (pr.requirement_kind = 'population' AND COALESCE(c.population, 0) < pr.value)
          OR (
            pr.requirement_kind = 'law_level'
            AND COALESCE((
              SELECT COUNT(*)
              FROM public.country_laws cl
              JOIN public.rule_parameters rp2
                ON rp2.key = CASE cl.law_key
                  WHEN 'mobilisation' THEN 'mobilisation_config'
                  WHEN 'auto_industry' THEN 'law_auto_industry_config'
                  WHEN 'air_industry' THEN 'law_air_industry_config'
                  WHEN 'naval_industry' THEN 'law_naval_industry_config'
                  WHEN 'research' THEN 'law_research_config'
                  ELSE NULL
                END
              JOIN LATERAL jsonb_each_text(rp2.value->'level_thresholds') AS j2(key, val) ON true
              WHERE cl.country_id = c.id
                AND cl.law_key = pr.requirement_target
                AND (val::numeric) <= COALESCE(cl.score, 0)
            ), 0) < pr.value
          )
          OR (pr.requirement_kind = 'influence')
        )
    )
  ),
  global_growth_rates AS (
    SELECT c.id AS country_id,
      SUM(CASE WHEN e->>'effect_kind' = 'gdp_growth_base' THEN public.parse_effect_value(e)
          WHEN e->>'effect_kind' = 'gdp_growth_per_stat' THEN public.parse_effect_value(e) * CASE e->>'effect_target'
            WHEN 'militarism' THEN COALESCE(c.militarism, 0) WHEN 'industry' THEN COALESCE(c.industry, 0)
            WHEN 'science' THEN COALESCE(c.science, 0) WHEN 'stability' THEN COALESCE(c.stability, 0) ELSE 0 END
          ELSE 0 END) AS gdp_global_rate,
      SUM(CASE WHEN e->>'effect_kind' = 'population_growth_base' THEN public.parse_effect_value(e)
          WHEN e->>'effect_kind' = 'population_growth_per_stat' THEN public.parse_effect_value(e) * CASE e->>'effect_target'
            WHEN 'militarism' THEN COALESCE(c.militarism, 0) WHEN 'industry' THEN COALESCE(c.industry, 0)
            WHEN 'science' THEN COALESCE(c.science, 0) WHEN 'stability' THEN COALESCE(c.stability, 0) ELSE 0 END
          ELSE 0 END) AS pop_global_rate
    FROM public.countries c
    CROSS JOIN public.rule_parameters r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(r.value) = 'array' THEN r.value ELSE r.value->'value' END, '[]'::jsonb)) AS e
    WHERE r.key = 'global_growth_effects'
    GROUP BY c.id
  ),
  pop_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat') AND (duration_kind = 'permanent' OR duration_remaining > 0)
    GROUP BY country_id
  ),
  pop_effects_law AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM law_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
    GROUP BY country_id
  ),
  pop_effects_ai AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM ai_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
    GROUP BY country_id
  ),
  pop_effects_ideology AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM ideology_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
    GROUP BY country_id
  ),
  pop_effects_perk AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM active_perk_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
    GROUP BY country_id
  ),
  gdp_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat') AND (duration_kind = 'permanent' OR duration_remaining > 0)
    GROUP BY country_id
  ),
  gdp_effects_law AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM law_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  gdp_effects_ai AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM ai_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  gdp_effects_ideology AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM ideology_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  gdp_effects_perk AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM active_perk_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  stat_effects AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM public.country_effects
    WHERE effect_kind = 'stat_delta' AND (duration_kind = 'permanent' OR duration_remaining > 0) AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_law AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM law_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_ai AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM ai_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_ideology AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM ideology_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_perk AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM active_perk_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  global_stat_effects AS (
    SELECT c.id AS country_id, (e->>'effect_target') AS effect_target, public.parse_effect_value(e) AS value
    FROM public.countries c
    CROSS JOIN public.rule_parameters r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(r.value) = 'array' THEN r.value ELSE r.value->'value' END, '[]'::jsonb)) AS e
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
    SELECT * FROM public.cron_budget_bonuses
  ),
  country_updates AS (
    SELECT c.id AS country_id,
      COALESCE(ggr.pop_global_rate, 0) AS pop_global_rate,
      COALESCE(ggr.gdp_global_rate, 0) AS gdp_global_rate,
      COALESCE(pe.rate, 0) + COALESCE(pel.rate, 0) + COALESCE(pea.rate, 0) + COALESCE(pei.rate, 0) + COALESCE(pep.rate, 0) AS pop_effect_rate,
      COALESCE(ge.rate, 0) + COALESCE(gel.rate, 0) + COALESCE(gea.rate, 0) + COALESCE(gei.rate, 0) + COALESCE(gep.rate, 0) AS gdp_effect_rate,
      COALESCE(se.delta_mil, 0) + COALESCE(sel.delta_mil, 0) + COALESCE(sea.delta_mil, 0) + COALESCE(sei.delta_mil, 0) + COALESCE(sep.delta_mil, 0) + COALESCE(seg.delta_mil, 0) AS delta_mil,
      COALESCE(se.delta_ind, 0) + COALESCE(sel.delta_ind, 0) + COALESCE(sea.delta_ind, 0) + COALESCE(sei.delta_ind, 0) + COALESCE(sep.delta_ind, 0) + COALESCE(seg.delta_ind, 0) AS delta_ind,
      COALESCE(se.delta_sci, 0) + COALESCE(sel.delta_sci, 0) + COALESCE(sea.delta_sci, 0) + COALESCE(sei.delta_sci, 0) + COALESCE(sep.delta_sci, 0) + COALESCE(seg.delta_sci, 0) AS delta_sci,
      COALESCE(se.delta_stab, 0) + COALESCE(sel.delta_stab, 0) + COALESCE(sea.delta_stab, 0) + COALESCE(sei.delta_stab, 0) + COALESCE(sep.delta_stab, 0) + COALESCE(seg.delta_stab, 0) AS delta_stab,
      COALESCE(bb.pop_rate, 0) AS budget_pop_rate, COALESCE(bb.gdp_rate, 0) AS budget_gdp_rate,
      COALESCE(bb.mil_delta, 0) AS budget_mil, COALESCE(bb.ind_delta, 0) AS budget_ind,
      COALESCE(bb.sci_delta, 0) AS budget_sci, COALESCE(bb.stab_delta, 0) AS budget_stab
    FROM public.countries c
    LEFT JOIN global_growth_rates ggr ON ggr.country_id = c.id
    LEFT JOIN pop_effects pe ON pe.country_id = c.id
    LEFT JOIN pop_effects_law pel ON pel.country_id = c.id
    LEFT JOIN pop_effects_ai pea ON pea.country_id = c.id
    LEFT JOIN pop_effects_ideology pei ON pei.country_id = c.id
    LEFT JOIN pop_effects_perk pep ON pep.country_id = c.id
    LEFT JOIN gdp_effects ge ON ge.country_id = c.id
    LEFT JOIN gdp_effects_law gel ON gel.country_id = c.id
    LEFT JOIN gdp_effects_ai gea ON gea.country_id = c.id
    LEFT JOIN gdp_effects_ideology gei ON gei.country_id = c.id
    LEFT JOIN gdp_effects_perk gep ON gep.country_id = c.id
    LEFT JOIN stat_effects se ON se.country_id = c.id
    LEFT JOIN stat_effects_law sel ON sel.country_id = c.id
    LEFT JOIN stat_effects_ai sea ON sea.country_id = c.id
    LEFT JOIN stat_effects_ideology sei ON sei.country_id = c.id
    LEFT JOIN stat_effects_perk sep ON sep.country_id = c.id
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
      'pop_total_rate', u.pop_global_rate + u.pop_effect_rate + u.budget_pop_rate,
      'gdp_total_rate', u.gdp_global_rate + u.gdp_effect_rate + u.budget_gdp_rate,
      'budget_mil', u.budget_mil, 'budget_ind', u.budget_ind, 'budget_sci', u.budget_sci, 'budget_stab', u.budget_stab
    ),
    c.population, c.gdp, c.militarism, c.industry, c.science, c.stability
  FROM public.countries c
  JOIN country_updates u ON u.country_id = c.id;

  WITH
  law_levels AS (
    SELECT cl.country_id, cl.law_key, cl.score,
      (SELECT j.key
       FROM public.rule_parameters rp,
            LATERAL jsonb_each_text(rp.value->'level_thresholds') AS j(key, val)
       WHERE rp.key = CASE cl.law_key
         WHEN 'mobilisation' THEN 'mobilisation_config'
         WHEN 'auto_industry' THEN 'law_auto_industry_config'
         WHEN 'air_industry' THEN 'law_air_industry_config'
         WHEN 'naval_industry' THEN 'law_naval_industry_config'
         WHEN 'research' THEN 'law_research_config'
       END
         AND (val::numeric) <= COALESCE(cl.score, 0)
       ORDER BY (val::numeric) DESC
       LIMIT 1
      ) AS level_key
    FROM public.country_laws cl
  ),
  law_effects AS (
    SELECT ll.country_id,
           (e->>'effect_kind') AS effect_kind,
           (e->>'effect_target') AS effect_target,
           public.parse_effect_value(e) AS value
    FROM law_levels ll,
         public.rule_parameters rp,
         LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(rp.value) = 'array' THEN rp.value ELSE rp.value->'value' END, '[]'::jsonb)) AS e
    WHERE rp.key = CASE ll.law_key
      WHEN 'mobilisation' THEN 'mobilisation_level_effects'
      WHEN 'auto_industry' THEN 'law_auto_industry_level_effects'
      WHEN 'air_industry' THEN 'law_air_industry_level_effects'
      WHEN 'naval_industry' THEN 'law_naval_industry_level_effects'
      WHEN 'research' THEN 'law_research_level_effects'
    END
      AND (e->>'level') = ll.level_key
  ),
  ai_effects AS (
    SELECT
      c.id AS country_id,
      (e->>'effect_kind') AS effect_kind,
      (e->>'effect_target') AS effect_target,
      public.parse_effect_value(e) AS value
    FROM public.countries c
    JOIN public.rule_parameters rp
      ON rp.key = CASE
        WHEN c.ai_status = 'major' THEN 'ai_major_effects'
        WHEN c.ai_status = 'minor' THEN 'ai_minor_effects'
        ELSE NULL
      END
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(rp.value) = 'array' THEN rp.value ELSE rp.value->'value' END, '[]'::jsonb)) AS e
    WHERE c.ai_status IN ('major', 'minor')
  ),
  ideology_effects AS (
    SELECT
      c.id AS country_id,
      (e->>'effect_kind') AS effect_kind,
      (e->>'effect_target') AS effect_target,
      public.parse_effect_value(e)
      * (
        CASE (e->>'ideology_id')
          WHEN 'germanic_monarchy' THEN COALESCE(c.ideology_germanic_monarchy, 0)
          WHEN 'merina_monarchy' THEN COALESCE(c.ideology_merina_monarchy, 0)
          WHEN 'french_republicanism' THEN COALESCE(c.ideology_french_republicanism, 0)
          WHEN 'mughal_republicanism' THEN COALESCE(c.ideology_mughal_republicanism, 0)
          WHEN 'nilotique_cultism' THEN COALESCE(c.ideology_nilotique_cultism, 0)
          WHEN 'satoiste_cultism' THEN COALESCE(c.ideology_satoiste_cultism, 0)
          ELSE 0
        END
      ) / 100.0 AS value
    FROM public.countries c
    CROSS JOIN public.rule_parameters rp
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(rp.value) = 'array' THEN rp.value ELSE rp.value->'value' END, '[]'::jsonb)) AS e
    WHERE rp.key = 'ideology_effects'
  ),
  active_perk_effects AS (
    SELECT
      c.id AS country_id,
      pe.effect_kind,
      pe.effect_target,
      pe.value
    FROM public.countries c
    INNER JOIN public.perks p ON true
    INNER JOIN public.perk_effects pe ON pe.perk_id = p.id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.perk_requirements pr
      WHERE pr.perk_id = p.id
        AND (
          (pr.requirement_kind = 'stat' AND pr.requirement_target = 'militarism' AND COALESCE(c.militarism, 0) < pr.value)
          OR (pr.requirement_kind = 'stat' AND pr.requirement_target = 'industry' AND COALESCE(c.industry, 0) < pr.value)
          OR (pr.requirement_kind = 'stat' AND pr.requirement_target = 'science' AND COALESCE(c.science, 0) < pr.value)
          OR (pr.requirement_kind = 'stat' AND pr.requirement_target = 'stability' AND COALESCE(c.stability, 0) < pr.value)
          OR (pr.requirement_kind = 'gdp' AND COALESCE(c.gdp, 0) < pr.value)
          OR (pr.requirement_kind = 'population' AND COALESCE(c.population, 0) < pr.value)
          OR (
            pr.requirement_kind = 'law_level'
            AND COALESCE((
              SELECT COUNT(*)
              FROM public.country_laws cl
              JOIN public.rule_parameters rp2
                ON rp2.key = CASE cl.law_key
                  WHEN 'mobilisation' THEN 'mobilisation_config'
                  WHEN 'auto_industry' THEN 'law_auto_industry_config'
                  WHEN 'air_industry' THEN 'law_air_industry_config'
                  WHEN 'naval_industry' THEN 'law_naval_industry_config'
                  WHEN 'research' THEN 'law_research_config'
                  ELSE NULL
                END
              JOIN LATERAL jsonb_each_text(rp2.value->'level_thresholds') AS j2(key, val) ON true
              WHERE cl.country_id = c.id
                AND cl.law_key = pr.requirement_target
                AND (val::numeric) <= COALESCE(cl.score, 0)
            ), 0) < pr.value
          )
          OR (pr.requirement_kind = 'influence')
        )
    )
  ),
  global_growth_rates AS (
    SELECT c.id AS country_id,
      SUM(CASE WHEN e->>'effect_kind' = 'gdp_growth_base' THEN public.parse_effect_value(e)
          WHEN e->>'effect_kind' = 'gdp_growth_per_stat' THEN public.parse_effect_value(e) * CASE e->>'effect_target'
            WHEN 'militarism' THEN COALESCE(c.militarism, 0) WHEN 'industry' THEN COALESCE(c.industry, 0)
            WHEN 'science' THEN COALESCE(c.science, 0) WHEN 'stability' THEN COALESCE(c.stability, 0) ELSE 0 END
          ELSE 0 END) AS gdp_global_rate,
      SUM(CASE WHEN e->>'effect_kind' = 'population_growth_base' THEN public.parse_effect_value(e)
          WHEN e->>'effect_kind' = 'population_growth_per_stat' THEN public.parse_effect_value(e) * CASE e->>'effect_target'
            WHEN 'militarism' THEN COALESCE(c.militarism, 0) WHEN 'industry' THEN COALESCE(c.industry, 0)
            WHEN 'science' THEN COALESCE(c.science, 0) WHEN 'stability' THEN COALESCE(c.stability, 0) ELSE 0 END
          ELSE 0 END) AS pop_global_rate
    FROM public.countries c
    CROSS JOIN public.rule_parameters r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(r.value) = 'array' THEN r.value ELSE r.value->'value' END, '[]'::jsonb)) AS e
    WHERE r.key = 'global_growth_effects'
    GROUP BY c.id
  ),
  pop_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat') AND (duration_kind = 'permanent' OR duration_remaining > 0)
    GROUP BY country_id
  ),
  pop_effects_law AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM law_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
    GROUP BY country_id
  ),
  pop_effects_ai AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM ai_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
    GROUP BY country_id
  ),
  pop_effects_ideology AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM ideology_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
    GROUP BY country_id
  ),
  pop_effects_perk AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM active_perk_effects WHERE effect_kind IN ('population_growth_base', 'population_growth_per_stat')
    GROUP BY country_id
  ),
  gdp_effects AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM public.country_effects
    WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat') AND (duration_kind = 'permanent' OR duration_remaining > 0)
    GROUP BY country_id
  ),
  gdp_effects_law AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM law_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  gdp_effects_ai AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM ai_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  gdp_effects_ideology AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM ideology_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  gdp_effects_perk AS (
    SELECT country_id, SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END) AS rate
    FROM active_perk_effects WHERE effect_kind IN ('gdp_growth_base', 'gdp_growth_per_stat')
    GROUP BY country_id
  ),
  stat_effects AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM public.country_effects
    WHERE effect_kind = 'stat_delta' AND (duration_kind = 'permanent' OR duration_remaining > 0) AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_law AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM law_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_ai AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM ai_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_ideology AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM ideology_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  stat_effects_perk AS (
    SELECT country_id,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'militarism'), 0) AS delta_mil,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'industry'), 0) AS delta_ind,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'science'), 0) AS delta_sci,
      COALESCE(SUM(value) FILTER (WHERE effect_target = 'stability'), 0) AS delta_stab
    FROM active_perk_effects
    WHERE effect_kind = 'stat_delta' AND effect_target IN ('militarism', 'industry', 'science', 'stability')
    GROUP BY country_id
  ),
  global_stat_effects AS (
    SELECT c.id AS country_id, (e->>'effect_target') AS effect_target, public.parse_effect_value(e) AS value
    FROM public.countries c
    CROSS JOIN public.rule_parameters r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(r.value) = 'array' THEN r.value ELSE r.value->'value' END, '[]'::jsonb)) AS e
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
    SELECT * FROM public.cron_budget_bonuses
  ),
  country_updates AS (
    SELECT c.id AS country_id,
      COALESCE(ggr.pop_global_rate, 0) AS pop_global_rate,
      COALESCE(ggr.gdp_global_rate, 0) AS gdp_global_rate,
      COALESCE(pe.rate, 0) + COALESCE(pel.rate, 0) + COALESCE(pea.rate, 0) + COALESCE(pei.rate, 0) + COALESCE(pep.rate, 0) AS pop_effect_rate,
      COALESCE(ge.rate, 0) + COALESCE(gel.rate, 0) + COALESCE(gea.rate, 0) + COALESCE(gei.rate, 0) + COALESCE(gep.rate, 0) AS gdp_effect_rate,
      COALESCE(se.delta_mil, 0) + COALESCE(sel.delta_mil, 0) + COALESCE(sea.delta_mil, 0) + COALESCE(sei.delta_mil, 0) + COALESCE(sep.delta_mil, 0) + COALESCE(seg.delta_mil, 0) AS delta_mil,
      COALESCE(se.delta_ind, 0) + COALESCE(sel.delta_ind, 0) + COALESCE(sea.delta_ind, 0) + COALESCE(sei.delta_ind, 0) + COALESCE(sep.delta_ind, 0) + COALESCE(seg.delta_ind, 0) AS delta_ind,
      COALESCE(se.delta_sci, 0) + COALESCE(sel.delta_sci, 0) + COALESCE(sea.delta_sci, 0) + COALESCE(sei.delta_sci, 0) + COALESCE(sep.delta_sci, 0) + COALESCE(seg.delta_sci, 0) AS delta_sci,
      COALESCE(se.delta_stab, 0) + COALESCE(sel.delta_stab, 0) + COALESCE(sea.delta_stab, 0) + COALESCE(sei.delta_stab, 0) + COALESCE(sep.delta_stab, 0) + COALESCE(seg.delta_stab, 0) AS delta_stab,
      COALESCE(bb.pop_rate, 0) AS budget_pop_rate, COALESCE(bb.gdp_rate, 0) AS budget_gdp_rate,
      COALESCE(bb.mil_delta, 0) AS budget_mil, COALESCE(bb.ind_delta, 0) AS budget_ind,
      COALESCE(bb.sci_delta, 0) AS budget_sci, COALESCE(bb.stab_delta, 0) AS budget_stab
    FROM public.countries c
    LEFT JOIN global_growth_rates ggr ON ggr.country_id = c.id
    LEFT JOIN pop_effects pe ON pe.country_id = c.id
    LEFT JOIN pop_effects_law pel ON pel.country_id = c.id
    LEFT JOIN pop_effects_ai pea ON pea.country_id = c.id
    LEFT JOIN pop_effects_ideology pei ON pei.country_id = c.id
    LEFT JOIN pop_effects_perk pep ON pep.country_id = c.id
    LEFT JOIN gdp_effects ge ON ge.country_id = c.id
    LEFT JOIN gdp_effects_law gel ON gel.country_id = c.id
    LEFT JOIN gdp_effects_ai gea ON gea.country_id = c.id
    LEFT JOIN gdp_effects_ideology gei ON gei.country_id = c.id
    LEFT JOIN gdp_effects_perk gep ON gep.country_id = c.id
    LEFT JOIN stat_effects se ON se.country_id = c.id
    LEFT JOIN stat_effects_law sel ON sel.country_id = c.id
    LEFT JOIN stat_effects_ai sea ON sea.country_id = c.id
    LEFT JOIN stat_effects_ideology sei ON sei.country_id = c.id
    LEFT JOIN stat_effects_perk sep ON sep.country_id = c.id
    LEFT JOIN stat_effects_global seg ON seg.country_id = c.id
    LEFT JOIN budget_bonuses bb ON bb.country_id = c.id
  )
  UPDATE public.countries c
  SET
    population = GREATEST(0, (c.population + c.population * (u.pop_global_rate + u.pop_effect_rate + u.budget_pop_rate))::bigint),
    gdp = GREATEST(0, ROUND((c.gdp + c.gdp * (u.gdp_global_rate + u.gdp_effect_rate + u.budget_gdp_rate))::numeric, 2)),
    militarism = LEAST(10, GREATEST(0, ROUND((COALESCE(c.militarism, 0) + u.delta_mil + u.budget_mil)::numeric, 2))),
    industry   = LEAST(10, GREATEST(0, ROUND((COALESCE(c.industry, 0)   + u.delta_ind + u.budget_ind)::numeric, 2))),
    science    = LEAST(10, GREATEST(0, ROUND((COALESCE(c.science, 0)    + u.delta_sci + u.budget_sci)::numeric, 2))),
    stability  = LEAST(3, GREATEST(-3, ROUND((COALESCE(c.stability, 0) + u.delta_stab + u.budget_stab)::numeric, 2))),
    updated_at = now()
  FROM country_updates u
  WHERE c.id = u.country_id;

  UPDATE public.country_update_logs l SET
    population_after = c.population, gdp_after = c.gdp,
    militarism_after = c.militarism, industry_after = c.industry, science_after = c.science, stability_after = c.stability
  FROM public.countries c WHERE l.country_id = c.id AND l.run_at = v_run_at;

  PERFORM public.run_etat_major_tick();

  PERFORM public.add_state_actions_from_effects();
  PERFORM public.apply_relation_delta_effects();

  UPDATE public.country_effects SET duration_remaining = duration_remaining - 1
  WHERE duration_kind != 'permanent' AND duration_remaining > 0;
  DELETE FROM public.country_effects
  WHERE duration_remaining <= 0 AND COALESCE(duration_kind, '') != 'permanent';

  SELECT COALESCE(value, '{}'::jsonb) INTO v_intel_config
  FROM public.rule_parameters WHERE key = 'intel_config' LIMIT 1;

  v_decay_mode := COALESCE(v_intel_config->>'decay_mode', 'flat');
  v_decay_flat := COALESCE((v_intel_config->>'decay_flat_per_day')::numeric, 2);
  v_decay_pct  := COALESCE((v_intel_config->>'decay_pct_per_day')::numeric, 5);

  IF v_decay_mode = 'flat' THEN
    UPDATE public.country_intel
    SET intel_level = GREATEST(0, intel_level - v_decay_flat),
        display_seed = (random() * 2147483647)::int,
        updated_at = now()
    WHERE true;
  ELSIF v_decay_mode = 'pct' THEN
    UPDATE public.country_intel
    SET intel_level = GREATEST(0, intel_level - intel_level * v_decay_pct / 100.0),
        display_seed = (random() * 2147483647)::int,
        updated_at = now()
    WHERE true;
  ELSIF v_decay_mode = 'both' THEN
    UPDATE public.country_intel
    SET intel_level = GREATEST(0, (intel_level - v_decay_flat) - (intel_level - v_decay_flat) * v_decay_pct / 100.0),
        display_seed = (random() * 2147483647)::int,
        updated_at = now()
    WHERE intel_level > 0;
  END IF;

  DELETE FROM public.country_intel WHERE intel_level <= 0;

  SELECT
    (SELECT (value->>'month')::int FROM public.rule_parameters WHERE key = 'world_date' LIMIT 1),
    (SELECT (value->>'year')::int FROM public.rule_parameters WHERE key = 'world_date' LIMIT 1),
    (SELECT COALESCE((value)::text::int, 1) FROM public.rule_parameters WHERE key = 'world_date_advance_months' LIMIT 1)
  INTO v_month, v_year, v_advance;

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
  'Cron quotidien : snapshot, lois, logs, mise à jour pays (global + country_effects + lois + IA + idéologie + avantages), État Major, state_actions, relation_delta, effects, intel decay, date du monde.';
