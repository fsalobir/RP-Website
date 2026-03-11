-- Système de lois unifié : remplace country_mobilisation par country_laws (5 lois x 5 niveaux).
-- Lois : mobilisation, auto_industry, air_industry, naval_industry, research.

-- 1) Créer la table country_laws
CREATE TABLE IF NOT EXISTS public.country_laws (
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  law_key text NOT NULL,
  score numeric NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 500),
  target_score numeric NOT NULL DEFAULT 0 CHECK (target_score >= 0 AND target_score <= 500),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (country_id, law_key)
);

CREATE INDEX IF NOT EXISTS idx_country_laws_country ON public.country_laws(country_id);

COMMENT ON TABLE public.country_laws IS 'Score et cible par pays et par loi (mobilisation, industries, recherche). Le joueur modifie target_score ; le cron fait évoluer score vers target_score.';

ALTER TABLE public.country_laws ENABLE ROW LEVEL SECURITY;

CREATE POLICY "country_laws_select_public"
  ON public.country_laws FOR SELECT
  USING (true);

CREATE POLICY "country_laws_insert_admin_or_player"
  ON public.country_laws FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR country_id IN (SELECT cp.country_id FROM public.country_players cp WHERE cp.user_id = auth.uid())
  );

CREATE POLICY "country_laws_update_admin_or_player"
  ON public.country_laws FOR UPDATE
  USING (
    public.is_admin()
    OR country_id IN (SELECT cp.country_id FROM public.country_players cp WHERE cp.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR country_id IN (SELECT cp.country_id FROM public.country_players cp WHERE cp.user_id = auth.uid())
  );

CREATE POLICY "country_laws_delete_admin"
  ON public.country_laws FOR DELETE
  USING (public.is_admin());

-- 2) Backfill : copier country_mobilisation → country_laws (law_key = 'mobilisation')
INSERT INTO public.country_laws (country_id, law_key, score, target_score, created_at, updated_at)
SELECT cm.country_id, 'mobilisation', cm.score, cm.target_score, COALESCE(cm.updated_at, now()), now()
FROM public.country_mobilisation cm
ON CONFLICT (country_id, law_key) DO NOTHING;

-- 3) Backfill : créer les 4 nouvelles lois pour chaque pays existant (score = 0, target_score = 0)
INSERT INTO public.country_laws (country_id, law_key, score, target_score)
SELECT c.id, lk.law_key, 0, 0
FROM public.countries c
CROSS JOIN (VALUES ('mobilisation'), ('auto_industry'), ('air_industry'), ('naval_industry'), ('research')) AS lk(law_key)
ON CONFLICT (country_id, law_key) DO NOTHING;

-- 4) Trigger pour créer automatiquement les lois quand un nouveau pays est ajouté
CREATE OR REPLACE FUNCTION public.create_laws_for_new_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.country_laws (country_id, law_key, score, target_score)
  VALUES
    (NEW.id, 'mobilisation', 0, 0),
    (NEW.id, 'auto_industry', 0, 0),
    (NEW.id, 'air_industry', 0, 0),
    (NEW.id, 'naval_industry', 0, 0),
    (NEW.id, 'research', 0, 0)
  ON CONFLICT (country_id, law_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_laws_for_new_country ON public.countries;
CREATE TRIGGER trg_create_laws_for_new_country
  AFTER INSERT ON public.countries
  FOR EACH ROW
  EXECUTE FUNCTION public.create_laws_for_new_country();

-- 5) Ajouter les rule_parameters pour les 4 nouvelles lois (config + effets)
INSERT INTO public.rule_parameters (key, value, description) VALUES
  ('law_auto_industry_config',
   '{"level_thresholds": {"level_1": 0, "level_2": 100, "level_3": 200, "level_4": 300, "level_5": 400}, "daily_step": 20}'::jsonb,
   'Industrie Automobile : seuils par palier (0–500) et pas quotidien.'),
  ('law_auto_industry_level_effects',
   '[]'::jsonb,
   'Effets par palier de la loi Industrie Automobile (tableau level, effect_kind, effect_target, value).'),
  ('law_air_industry_config',
   '{"level_thresholds": {"level_1": 0, "level_2": 100, "level_3": 200, "level_4": 300, "level_5": 400}, "daily_step": 20}'::jsonb,
   'Industrie Aéronautique : seuils par palier (0–500) et pas quotidien.'),
  ('law_air_industry_level_effects',
   '[]'::jsonb,
   'Effets par palier de la loi Industrie Aéronautique (tableau level, effect_kind, effect_target, value).'),
  ('law_naval_industry_config',
   '{"level_thresholds": {"level_1": 0, "level_2": 100, "level_3": 200, "level_4": 300, "level_5": 400}, "daily_step": 20}'::jsonb,
   'Industrie Navale : seuils par palier (0–500) et pas quotidien.'),
  ('law_naval_industry_level_effects',
   '[]'::jsonb,
   'Effets par palier de la loi Industrie Navale (tableau level, effect_kind, effect_target, value).'),
  ('law_research_config',
   '{"level_thresholds": {"level_1": 0, "level_2": 100, "level_3": 200, "level_4": 300, "level_5": 400}, "daily_step": 20}'::jsonb,
   'Recherche : seuils par palier (0–500) et pas quotidien.'),
  ('law_research_level_effects',
   '[]'::jsonb,
   'Effets par palier de la loi Recherche (tableau level, effect_kind, effect_target, value).')
ON CONFLICT (key) DO NOTHING;

-- 6) Migrer mobilisation_config pour utiliser les mêmes clés level_X
-- L'ancienne config utilise des clés comme "demobilisation", "reserve_active", etc.
-- On les convertit vers "level_1"..."level_5" pour uniformité.
UPDATE public.rule_parameters
SET value = jsonb_build_object(
  'level_thresholds', jsonb_build_object(
    'level_1', COALESCE((value->'level_thresholds'->>'demobilisation')::numeric, (value->'level_thresholds'->>'level_1')::numeric, 0),
    'level_2', COALESCE((value->'level_thresholds'->>'reserve_active')::numeric, (value->'level_thresholds'->>'level_2')::numeric, 200),
    'level_3', COALESCE((value->'level_thresholds'->>'mobilisation_partielle')::numeric, (value->'level_thresholds'->>'level_3')::numeric, 300),
    'level_4', COALESCE((value->'level_thresholds'->>'mobilisation_generale')::numeric, (value->'level_thresholds'->>'level_4')::numeric, 400),
    'level_5', COALESCE((value->'level_thresholds'->>'guerre_patriotique')::numeric, (value->'level_thresholds'->>'level_5')::numeric, 500)
  ),
  'daily_step', COALESCE((value->>'daily_step')::int, 20)
)
WHERE key = 'mobilisation_config';

-- Migrate mobilisation_level_effects: rename old level keys to level_X
UPDATE public.rule_parameters
SET value = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN e->>'level' = 'demobilisation' THEN jsonb_set(e, '{level}', '"level_1"')
      WHEN e->>'level' = 'reserve_active' THEN jsonb_set(e, '{level}', '"level_2"')
      WHEN e->>'level' = 'mobilisation_partielle' THEN jsonb_set(e, '{level}', '"level_3"')
      WHEN e->>'level' = 'mobilisation_generale' THEN jsonb_set(e, '{level}', '"level_4"')
      WHEN e->>'level' = 'guerre_patriotique' THEN jsonb_set(e, '{level}', '"level_5"')
      ELSE e
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(value) AS e
)
WHERE key = 'mobilisation_level_effects' AND jsonb_typeof(value) = 'array';

-- 7) Réécriture de run_daily_country_update pour utiliser country_laws au lieu de country_mobilisation
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

  -- Snapshot history
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

  -- Evolve all law scores toward target (each law has its own daily_step from its config)
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

  -- Compute effects from all laws for each country
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
         LATERAL jsonb_array_elements(rp.value) AS e
    WHERE rp.key = CASE ll.law_key
      WHEN 'mobilisation' THEN 'mobilisation_level_effects'
      WHEN 'auto_industry' THEN 'law_auto_industry_level_effects'
      WHEN 'air_industry' THEN 'law_air_industry_level_effects'
      WHEN 'naval_industry' THEN 'law_naval_industry_level_effects'
      WHEN 'research' THEN 'law_research_level_effects'
    END
      AND (e->>'level') = ll.level_key
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
      COALESCE(pe.rate, 0) + COALESCE(pel.rate, 0) AS pop_effect_rate,
      COALESCE(ge.rate, 0) + COALESCE(gel.rate, 0) AS gdp_effect_rate,
      COALESCE(se.delta_mil, 0) + COALESCE(sel.delta_mil, 0) + COALESCE(seg.delta_mil, 0) AS delta_mil,
      COALESCE(se.delta_ind, 0) + COALESCE(sel.delta_ind, 0) + COALESCE(seg.delta_ind, 0) AS delta_ind,
      COALESCE(se.delta_sci, 0) + COALESCE(sel.delta_sci, 0) + COALESCE(seg.delta_sci, 0) AS delta_sci,
      COALESCE(se.delta_stab, 0) + COALESCE(sel.delta_stab, 0) + COALESCE(seg.delta_stab, 0) AS delta_stab,
      COALESCE(bb.pop_rate, 0) AS budget_pop_rate, COALESCE(bb.gdp_rate, 0) AS budget_gdp_rate,
      COALESCE(bb.mil_delta, 0) AS budget_mil, COALESCE(bb.ind_delta, 0) AS budget_ind,
      COALESCE(bb.sci_delta, 0) AS budget_sci, COALESCE(bb.stab_delta, 0) AS budget_stab
    FROM public.countries c
    LEFT JOIN global_growth_rates ggr ON ggr.country_id = c.id
    LEFT JOIN pop_effects pe ON pe.country_id = c.id
    LEFT JOIN pop_effects_law pel ON pel.country_id = c.id
    LEFT JOIN gdp_effects ge ON ge.country_id = c.id
    LEFT JOIN gdp_effects_law gel ON gel.country_id = c.id
    LEFT JOIN stat_effects se ON se.country_id = c.id
    LEFT JOIN stat_effects_law sel ON sel.country_id = c.id
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
         LATERAL jsonb_array_elements(rp.value) AS e
    WHERE rp.key = CASE ll.law_key
      WHEN 'mobilisation' THEN 'mobilisation_level_effects'
      WHEN 'auto_industry' THEN 'law_auto_industry_level_effects'
      WHEN 'air_industry' THEN 'law_air_industry_level_effects'
      WHEN 'naval_industry' THEN 'law_naval_industry_level_effects'
      WHEN 'research' THEN 'law_research_level_effects'
    END
      AND (e->>'level') = ll.level_key
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
      COALESCE(pe.rate, 0) + COALESCE(pel.rate, 0) AS pop_effect_rate,
      COALESCE(ge.rate, 0) + COALESCE(gel.rate, 0) AS gdp_effect_rate,
      COALESCE(se.delta_mil, 0) + COALESCE(sel.delta_mil, 0) + COALESCE(seg.delta_mil, 0) AS delta_mil,
      COALESCE(se.delta_ind, 0) + COALESCE(sel.delta_ind, 0) + COALESCE(seg.delta_ind, 0) AS delta_ind,
      COALESCE(se.delta_sci, 0) + COALESCE(sel.delta_sci, 0) + COALESCE(seg.delta_sci, 0) AS delta_sci,
      COALESCE(se.delta_stab, 0) + COALESCE(sel.delta_stab, 0) + COALESCE(seg.delta_stab, 0) AS delta_stab,
      COALESCE(bb.pop_rate, 0) AS budget_pop_rate, COALESCE(bb.gdp_rate, 0) AS budget_gdp_rate,
      COALESCE(bb.mil_delta, 0) AS budget_mil, COALESCE(bb.ind_delta, 0) AS budget_ind,
      COALESCE(bb.sci_delta, 0) AS budget_sci, COALESCE(bb.stab_delta, 0) AS budget_stab
    FROM public.countries c
    LEFT JOIN global_growth_rates ggr ON ggr.country_id = c.id
    LEFT JOIN pop_effects pe ON pe.country_id = c.id
    LEFT JOIN pop_effects_law pel ON pel.country_id = c.id
    LEFT JOIN gdp_effects ge ON ge.country_id = c.id
    LEFT JOIN gdp_effects_law gel ON gel.country_id = c.id
    LEFT JOIN stat_effects se ON se.country_id = c.id
    LEFT JOIN stat_effects_law sel ON sel.country_id = c.id
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

  PERFORM public.add_state_actions_from_effects();
  PERFORM public.apply_relation_delta_effects();

  UPDATE public.country_effects SET duration_remaining = duration_remaining - 1
  WHERE duration_kind != 'permanent' AND duration_remaining > 0;
  DELETE FROM public.country_effects
  WHERE duration_remaining <= 0 AND COALESCE(duration_kind, '') != 'permanent';

  -- Intel decay + seed renewal
  SELECT COALESCE(value, '{}'::jsonb) INTO v_intel_config
  FROM public.rule_parameters WHERE key = 'intel_config' LIMIT 1;

  v_decay_mode := COALESCE(v_intel_config->>'decay_mode', 'flat');
  v_decay_flat := COALESCE((v_intel_config->>'decay_flat_per_day')::numeric, 2);
  v_decay_pct  := COALESCE((v_intel_config->>'decay_pct_per_day')::numeric, 5);

  IF v_decay_mode = 'flat' THEN
    UPDATE public.country_intel
    SET intel_level = GREATEST(0, intel_level - v_decay_flat),
        display_seed = (random() * 2147483647)::int,
        updated_at = now();
  ELSIF v_decay_mode = 'pct' THEN
    UPDATE public.country_intel
    SET intel_level = GREATEST(0, intel_level - intel_level * v_decay_pct / 100.0),
        display_seed = (random() * 2147483647)::int,
        updated_at = now();
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
  'Cron quotidien : snapshot, lois (mobilisation + industries + recherche), logs, mise à jour pays, state_actions, relation_delta, effects, intel decay, date du monde.';
