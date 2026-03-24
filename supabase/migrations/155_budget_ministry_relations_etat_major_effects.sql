-- Effets ministère étendus : relations bilatérales (portée + plage) et bonus vitesse État-major.
-- Étend cron_budget_bonuses_bwg / cron_budget_bonuses, vue cron_budget_effect_final,
-- apply_budget_ministry_bilateral_relations(), run_etat_major_tick (bonus budget EM + stock), run_daily.

-- CREATE OR REPLACE VIEW ne peut pas réordonner / renommer les colonnes de cron_budget_bonuses_bwg
-- (l’ancienne vue exposait effect_type en 2e colonne, sans ministry_key).
DROP VIEW IF EXISTS public.cron_budget_bonuses CASCADE;
DROP VIEW IF EXISTS public.cron_budget_effect_final CASCADE;
DROP VIEW IF EXISTS public.cron_budget_bonuses_bwg CASCADE;

CREATE VIEW public.cron_budget_bonuses_bwg AS
WITH wa AS (
  SELECT avg(population)::numeric AS pop_avg, avg(gdp)::numeric AS gdp_avg, avg(militarism)::numeric AS mil_avg,
         avg(industry)::numeric AS ind_avg, avg(science)::numeric AS sci_avg, avg(stability)::numeric AS stab_avg
  FROM public.countries
),
bmp AS (
  SELECT c.id AS country_id, r.key AS ministry_key,
    CASE r.key
      WHEN 'budget_etat' THEN COALESCE(b.pct_etat, 0)
      WHEN 'budget_education' THEN COALESCE(b.pct_education, 0)
      WHEN 'budget_recherche' THEN COALESCE(b.pct_recherche, 0)
      WHEN 'budget_infrastructure' THEN COALESCE(b.pct_infrastructure, 0)
      WHEN 'budget_sante' THEN COALESCE(b.pct_sante, 0)
      WHEN 'budget_industrie' THEN COALESCE(b.pct_industrie, 0)
      WHEN 'budget_defense' THEN COALESCE(b.pct_defense, 0)
      WHEN 'budget_interieur' THEN COALESCE(b.pct_interieur, 0)
      WHEN 'budget_affaires_etrangeres' THEN COALESCE(b.pct_affaires_etrangeres, 0)
      ELSE 0
    END AS pct,
    COALESCE((r.value->>'min_pct')::numeric, 5) AS min_pct,
    COALESCE((r.value->>'gravity_pct')::numeric, 50) AS gravity_pct,
    r.value AS rule_value
  FROM public.countries c
  LEFT JOIN public.country_budget b ON b.country_id = c.id
  CROSS JOIN public.rule_parameters r
  WHERE r.key IN (
    'budget_etat', 'budget_education', 'budget_recherche', 'budget_infrastructure', 'budget_sante',
    'budget_industrie', 'budget_defense', 'budget_interieur', 'budget_affaires_etrangeres'
  )
),
bea_std AS (
  SELECT mp.country_id, mp.ministry_key, mp.pct, mp.min_pct, mp.gravity_pct,
    e->>'effect_type' AS effect_type,
    COALESCE((e->>'bonus')::numeric, 0) AS bonus,
    COALESCE((e->>'malus')::numeric, -0.05) AS malus,
    COALESCE((e->>'gravity_applies')::boolean, (e->>'effect_type') IN ('militarism', 'industry', 'science', 'stability')) AS gravity_applies,
    NULL::text AS relation_scope,
    NULL::smallint AS relation_band_min,
    NULL::smallint AS relation_band_max
  FROM bmp mp,
  LATERAL jsonb_array_elements(mp.rule_value->'effects') AS e
  WHERE jsonb_typeof(mp.rule_value->'effects') = 'array'
    AND jsonb_array_length(mp.rule_value->'effects') > 0
    AND (e->>'effect_type') IN ('population', 'gdp', 'militarism', 'industry', 'science', 'stability')
),
bea_ext AS (
  SELECT mp.country_id, mp.ministry_key, mp.pct, mp.min_pct, mp.gravity_pct,
    e->>'effect_type' AS effect_type,
    COALESCE((e->>'bonus')::numeric, 0) AS bonus,
    COALESCE((e->>'malus')::numeric, -0.05) AS malus,
    COALESCE((e->>'gravity_applies')::boolean, LEFT(COALESCE(e->>'effect_type', ''), 12) = 'etat_major_') AS gravity_applies,
    CASE WHEN e->>'effect_type' = 'bilateral_relations' THEN COALESCE(NULLIF(TRIM(e->>'relation_scope'), ''), 'world') ELSE NULL END AS relation_scope,
    CASE WHEN e->>'effect_type' = 'bilateral_relations' THEN COALESCE((e->>'relation_band_min')::smallint, (-100)::smallint) ELSE NULL END AS relation_band_min,
    CASE WHEN e->>'effect_type' = 'bilateral_relations' THEN COALESCE((e->>'relation_band_max')::smallint, 100::smallint) ELSE NULL END AS relation_band_max
  FROM bmp mp,
  LATERAL jsonb_array_elements(mp.rule_value->'effects') AS e
  WHERE jsonb_typeof(mp.rule_value->'effects') = 'array'
    AND jsonb_array_length(mp.rule_value->'effects') > 0
    AND (e->>'effect_type') IN (
      'bilateral_relations', 'etat_major_design', 'etat_major_recrutement', 'etat_major_procuration', 'etat_major_stock'
    )
),
bea AS (SELECT * FROM bea_std UNION ALL SELECT * FROM bea_ext),
beb AS (
  SELECT mp.country_id, mp.ministry_key, mp.pct, mp.min_pct, mp.gravity_pct,
    ek.key AS effect_type,
    (ek.value)::numeric AS bonus,
    COALESCE((mp.rule_value->'maluses'->>ek.key)::numeric, -0.05) AS malus,
    (ek.key IN ('militarism', 'industry', 'science', 'stability')) AS gravity_applies,
    NULL::text AS relation_scope,
    NULL::smallint AS relation_band_min,
    NULL::smallint AS relation_band_max
  FROM bmp mp,
  LATERAL jsonb_each_text(COALESCE(mp.rule_value->'bonuses', '{}'::jsonb)) AS ek
  WHERE (mp.rule_value->'effects' IS NULL OR jsonb_array_length(COALESCE(mp.rule_value->'effects', '[]'::jsonb)) = 0)
    AND ek.key IN ('population', 'gdp', 'militarism', 'industry', 'science', 'stability')
),
ber AS (SELECT * FROM bea UNION ALL SELECT * FROM beb),
bc AS (
  SELECT country_id, ministry_key, effect_type, gravity_pct, gravity_applies, bonus, malus,
    relation_scope, relation_band_min, relation_band_max,
    CASE WHEN pct >= min_pct THEN (pct / 100.0) * bonus ELSE ((min_pct - pct) / NULLIF(min_pct, 0)) * malus END AS contrib
  FROM ber
),
bwg AS (
  SELECT bc.country_id, bc.ministry_key, bc.effect_type, bc.contrib, bc.gravity_applies, bc.gravity_pct,
    bc.relation_scope, bc.relation_band_min, bc.relation_band_max,
    c.population AS country_pop, c.gdp AS country_gdp, c.militarism AS country_mil, c.industry AS country_ind,
    c.science AS country_sci, c.stability AS country_stab,
    wa.pop_avg, wa.gdp_avg, wa.mil_avg, wa.ind_avg, wa.sci_avg, wa.stab_avg
  FROM bc
  JOIN public.countries c ON c.id = bc.country_id
  CROSS JOIN wa
)
SELECT * FROM bwg;

CREATE OR REPLACE VIEW public.cron_budget_effect_final AS
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.pop_avg, bwg.country_pop) AS final_contrib
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'population'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.gdp_avg, bwg.country_gdp)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'gdp'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.mil_avg, bwg.country_mil)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'militarism'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.ind_avg, bwg.country_ind)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'industry'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.sci_avg, bwg.country_sci)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'science'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.stab_avg, bwg.country_stab)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'stability'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.gdp_avg, bwg.country_gdp)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'bilateral_relations'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.ind_avg, bwg.country_ind)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'etat_major_design'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.mil_avg, bwg.country_mil)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'etat_major_recrutement'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.gdp_avg, bwg.country_gdp)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'etat_major_procuration'
UNION ALL
SELECT bwg.country_id, bwg.ministry_key, bwg.effect_type, bwg.relation_scope, bwg.relation_band_min, bwg.relation_band_max,
  public.cron_gravity_factor(bwg.contrib, bwg.gravity_applies, bwg.gravity_pct, bwg.sci_avg, bwg.country_sci)
FROM public.cron_budget_bonuses_bwg bwg
WHERE bwg.effect_type = 'etat_major_stock';

COMMENT ON VIEW public.cron_budget_effect_final IS 'Contributions budget ministères après gravité (tous effect_type, y compris relations et État-major).';

CREATE OR REPLACE VIEW public.cron_budget_bonuses AS
WITH bgf AS (SELECT * FROM public.cron_budget_effect_final)
SELECT country_id,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'population'), 0) AS pop_rate,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'gdp'), 0) AS gdp_rate,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'militarism'), 0) AS mil_delta,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'industry'), 0) AS ind_delta,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'science'), 0) AS sci_delta,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'stability'), 0) AS stab_delta,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'etat_major_design'), 0) AS em_design_bonus,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'etat_major_recrutement'), 0) AS em_rec_bonus,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'etat_major_procuration'), 0) AS em_proc_bonus,
  COALESCE(SUM(final_contrib) FILTER (WHERE effect_type = 'etat_major_stock'), 0) AS em_stock_bonus
FROM bgf
GROUP BY country_id;

COMMENT ON VIEW public.cron_budget_bonuses IS 'Agrégat budget par pays : stats + bonus fractionnaires État-major (em_*). Les relations bilatérales sont dans cron_budget_effect_final.';

CREATE OR REPLACE FUNCTION public.apply_budget_ministry_bilateral_relations()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
INSERT INTO public.country_relations (country_a_id, country_b_id, value, updated_at)
WITH
lines AS (
  SELECT * FROM public.cron_budget_effect_final WHERE effect_type = 'bilateral_relations'
),
line_targets AS (
  SELECT
    l.country_id AS src,
    t.id AS tgt,
    l.final_contrib,
    COALESCE(l.relation_band_min, (-100)::smallint) AS band_min,
    COALESCE(l.relation_band_max, 100::smallint) AS band_max
  FROM lines l
  JOIN public.countries t ON t.id <> l.country_id
  JOIN public.countries src_c ON src_c.id = l.country_id
  WHERE
    COALESCE(NULLIF(TRIM(l.relation_scope), ''), 'world') = 'world'
    OR (
      COALESCE(NULLIF(TRIM(l.relation_scope), ''), 'world') = 'same_continent'
      AND src_c.continent_id IS NOT NULL
      AND t.continent_id IS NOT NULL
      AND t.continent_id = src_c.continent_id
    )
    OR (
      COALESCE(NULLIF(TRIM(l.relation_scope), ''), 'world') = 'neighbors'
      AND t.id IN (
        SELECT mrc.country_id
        FROM public.map_region_countries mrc
        WHERE mrc.region_id IN (
          SELECT CASE WHEN mrn.region_a_id = er.region_id THEN mrn.region_b_id ELSE mrn.region_a_id END
          FROM public.map_region_neighbors mrn
          CROSS JOIN (SELECT region_id FROM public.map_region_countries WHERE country_id = l.country_id LIMIT 1) er
          WHERE mrn.region_a_id = er.region_id OR mrn.region_b_id = er.region_id
        )
        AND mrc.country_id <> l.country_id
      )
    )
),
with_rel AS (
  SELECT
    lt.src,
    lt.tgt,
    ROUND(lt.final_contrib)::integer AS dlt,
    lt.band_min,
    lt.band_max
  FROM line_targets lt
  LEFT JOIN public.country_relations cr
    ON cr.country_a_id = LEAST(lt.src, lt.tgt) AND cr.country_b_id = GREATEST(lt.src, lt.tgt)
  WHERE COALESCE(cr.value, 0)::smallint >= lt.band_min
    AND COALESCE(cr.value, 0)::smallint <= lt.band_max
),
agg AS (
  SELECT LEAST(src, tgt) AS a, GREATEST(src, tgt) AS b, SUM(dlt) AS total_d
  FROM with_rel
  GROUP BY 1, 2
)
SELECT agg.a, agg.b,
  GREATEST(-100, LEAST(100, COALESCE(cr.value, 0) + agg.total_d))::smallint,
  now()
FROM agg
LEFT JOIN public.country_relations cr ON cr.country_a_id = agg.a AND cr.country_b_id = agg.b
ON CONFLICT (country_a_id, country_b_id) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;
$$;

COMMENT ON FUNCTION public.apply_budget_ministry_bilateral_relations() IS
  'Applique les effets budget bilateral_relations (delta/jour, portée, plage de relation). Après relation_delta dans le cron.';

CREATE OR REPLACE FUNCTION public.run_etat_major_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jsonb;
  v_design_min numeric;
  v_design_max numeric;
  v_rec_min numeric;
  v_rec_max numeric;
  v_rec_def_per_pct numeric;
  v_stock_min numeric;
  v_stock_max numeric;
  v_procuration_base numeric;
  v_procuration_per_pct numeric;
  v_country_id uuid;
  v_roster_unit_id uuid;
  v_industry numeric;
  v_militarism numeric;
  v_pct_def numeric;
  v_science numeric;
  v_pct_proc numeric;
  v_gdp numeric;
  v_design_bonus numeric;
  v_rec_bonus numeric;
  v_proc_bonus numeric;
  v_proc_points_per_day numeric;
  v_em_budget numeric;
  v_pts numeric;
  v_cap_science int;
  v_level_count int;
  v_cost int;
  v_unlocked_level int;
  v_cur_level int;
  v_extra int;
  v_rec_pts int;
  v_proc_pts int;
  v_stock_pts int;
BEGIN
  SELECT COALESCE(value, '{}'::jsonb) INTO v_config FROM public.rule_parameters WHERE key = 'etat_major_config' LIMIT 1;

  v_design_min := COALESCE((v_config->'design'->>'min_points_per_tick')::numeric, 1);
  v_design_max := COALESCE((v_config->'design'->>'max_points_per_tick')::numeric, 10);
  v_rec_min    := COALESCE((v_config->'recrutement'->>'min_points_per_tick')::numeric, 1);
  v_rec_max    := COALESCE((v_config->'recrutement'->>'max_points_per_tick')::numeric, 10);
  v_rec_def_per_pct := COALESCE((v_config->'recrutement'->>'points_per_pct_defense')::numeric, 0);
  v_stock_min  := COALESCE((v_config->'stock'->>'min_points_per_tick')::numeric, 1);
  v_stock_max  := COALESCE((v_config->'stock'->>'max_points_per_tick')::numeric, 10);
  v_procuration_base   := COALESCE((v_config->'procuration'->>'base_points_per_tick')::numeric, 0);
  v_procuration_per_pct := COALESCE((v_config->'procuration'->>'points_per_pct_budget')::numeric, 0.5);

  FOR v_country_id, v_roster_unit_id IN
    SELECT f.country_id, f.design_roster_unit_id
    FROM public.country_etat_major_focus f
    WHERE f.design_roster_unit_id IS NOT NULL
  LOOP
    SELECT COALESCE(c.industry, 0) INTO v_industry FROM public.countries c WHERE c.id = v_country_id;
    SELECT COALESCE(SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END), 0) INTO v_design_bonus
      FROM public.country_effects
      WHERE country_id = v_country_id AND effect_kind = 'design_bonus_percent' AND (duration_kind = 'permanent' OR duration_remaining > 0);
    SELECT COALESCE(bb.em_design_bonus, 0) INTO v_em_budget FROM public.cron_budget_bonuses bb WHERE bb.country_id = v_country_id;
    v_design_bonus := v_design_bonus + COALESCE(v_em_budget, 0);

    v_pts := (v_design_min + (v_design_max - v_design_min) * LEAST(10, GREATEST(0, v_industry)) / 10.0) * (1 + v_design_bonus);
    v_pts := ROUND(v_pts);

    SELECT r.level_count INTO v_level_count FROM public.military_roster_units r WHERE r.id = v_roster_unit_id;
    SELECT COALESCE(MAX(lvl.level), 0) INTO v_cap_science
      FROM public.military_roster_unit_levels lvl
      JOIN public.countries c ON c.id = v_country_id
      WHERE lvl.unit_id = v_roster_unit_id AND (lvl.science_required IS NULL OR lvl.science_required <= COALESCE(c.science, 0));

    INSERT INTO public.country_military_units (country_id, roster_unit_id, current_level, extra_count, recrutement_points, procuration_points, stock_points)
    SELECT v_country_id, v_roster_unit_id, 0, 0, 0, 0, 0
    WHERE NOT EXISTS (SELECT 1 FROM public.country_military_units cmu WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id);

    UPDATE public.country_military_units cmu
    SET current_level = LEAST(
        cmu.current_level + GREATEST(0, v_pts)::int,
        (v_cap_science * 100),
        COALESCE(v_level_count, 10) * 100
      ),
      updated_at = now()
    WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id;
  END LOOP;

  FOR v_country_id, v_roster_unit_id IN
    SELECT f.country_id, f.recrutement_roster_unit_id
    FROM public.country_etat_major_focus f
    WHERE f.recrutement_roster_unit_id IS NOT NULL
  LOOP
    SELECT COALESCE(c.militarism, 0), COALESCE(b.pct_defense, 0) INTO v_militarism, v_pct_def
      FROM public.countries c
      LEFT JOIN public.country_budget b ON b.country_id = c.id
      WHERE c.id = v_country_id;
    SELECT COALESCE(SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END), 0) INTO v_rec_bonus
      FROM public.country_effects
      WHERE country_id = v_country_id AND effect_kind = 'recrutement_bonus_percent' AND (duration_kind = 'permanent' OR duration_remaining > 0);
    SELECT COALESCE(bb.em_rec_bonus, 0) INTO v_em_budget FROM public.cron_budget_bonuses bb WHERE bb.country_id = v_country_id;
    v_rec_bonus := v_rec_bonus + COALESCE(v_em_budget, 0);

    v_pts := (
      v_rec_min + (v_rec_max - v_rec_min) * LEAST(10, GREATEST(0, v_militarism)) / 10.0
      + v_rec_def_per_pct * LEAST(100, GREATEST(0, v_pct_def))
    ) * (1 + v_rec_bonus);
    v_pts := ROUND(v_pts);

    INSERT INTO public.country_military_units (country_id, roster_unit_id, current_level, extra_count, recrutement_points, procuration_points, stock_points)
    SELECT v_country_id, v_roster_unit_id, 0, 0, 0, 0, 0
    WHERE NOT EXISTS (SELECT 1 FROM public.country_military_units cmu WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id);

    UPDATE public.country_military_units cmu
    SET recrutement_points = cmu.recrutement_points + GREATEST(0, v_pts)::int,
        updated_at = now()
    WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id;

    LOOP
      SELECT cmu.current_level, cmu.extra_count, cmu.recrutement_points, r.level_count
        INTO v_cur_level, v_extra, v_rec_pts, v_level_count
      FROM public.country_military_units cmu
      JOIN public.military_roster_units r ON r.id = cmu.roster_unit_id
      WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id;
      EXIT WHEN NOT FOUND;

      v_unlocked_level := GREATEST(1, LEAST(COALESCE(v_level_count, 10), (v_cur_level / 100)));
      SELECT COALESCE(lvl.mobilization_cost, 100) INTO v_cost
        FROM public.military_roster_unit_levels lvl
        WHERE lvl.unit_id = v_roster_unit_id AND lvl.level = v_unlocked_level
        LIMIT 1;
      v_cost := GREATEST(1, COALESCE(v_cost, 100));

      EXIT WHEN v_rec_pts < v_cost;

      UPDATE public.country_military_units
      SET extra_count = extra_count + 1,
          recrutement_points = recrutement_points - v_cost,
          updated_at = now()
      WHERE country_id = v_country_id AND roster_unit_id = v_roster_unit_id;
    END LOOP;
  END LOOP;

  FOR v_country_id, v_roster_unit_id IN
    SELECT f.country_id, f.procuration_roster_unit_id
    FROM public.country_etat_major_focus f
    WHERE f.procuration_roster_unit_id IS NOT NULL
  LOOP
    SELECT COALESCE(b.pct_procuration_militaire, 0), COALESCE(c.gdp, 0) INTO v_pct_proc, v_gdp
      FROM public.countries c
      LEFT JOIN public.country_budget b ON b.country_id = c.id
      WHERE c.id = v_country_id;
    SELECT COALESCE(SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END), 0) INTO v_proc_bonus
      FROM public.country_effects
      WHERE country_id = v_country_id AND effect_kind = 'procuration_bonus_percent' AND (duration_kind = 'permanent' OR duration_remaining > 0);
    SELECT COALESCE(SUM((value)::int), 0) INTO v_proc_points_per_day
      FROM public.country_effects
      WHERE country_id = v_country_id AND effect_kind = 'procuration_points_per_day' AND (duration_kind = 'permanent' OR duration_remaining > 0);
    SELECT COALESCE(bb.em_proc_bonus, 0) INTO v_em_budget FROM public.cron_budget_bonuses bb WHERE bb.country_id = v_country_id;
    v_proc_bonus := v_proc_bonus + COALESCE(v_em_budget, 0);

    v_pts := v_procuration_base + (v_pct_proc * v_procuration_per_pct) + v_proc_points_per_day;
    v_pts := v_pts * (1 + v_proc_bonus);
    v_pts := ROUND(v_pts);

    INSERT INTO public.country_military_units (country_id, roster_unit_id, current_level, extra_count, recrutement_points, procuration_points, stock_points)
    SELECT v_country_id, v_roster_unit_id, 0, 0, 0, 0, 0
    WHERE NOT EXISTS (SELECT 1 FROM public.country_military_units cmu WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id);

    UPDATE public.country_military_units cmu
    SET procuration_points = cmu.procuration_points + GREATEST(0, v_pts)::int,
        updated_at = now()
    WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id;

    LOOP
      SELECT cmu.current_level, cmu.extra_count, cmu.procuration_points, r.level_count
        INTO v_cur_level, v_extra, v_proc_pts, v_level_count
      FROM public.country_military_units cmu
      JOIN public.military_roster_units r ON r.id = cmu.roster_unit_id
      WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id;
      EXIT WHEN NOT FOUND;

      v_unlocked_level := GREATEST(1, LEAST(COALESCE(v_level_count, 10), (v_cur_level / 100)));
      SELECT COALESCE(lvl.mobilization_cost, 100) INTO v_cost
        FROM public.military_roster_unit_levels lvl
        WHERE lvl.unit_id = v_roster_unit_id AND lvl.level = v_unlocked_level
        LIMIT 1;
      v_cost := GREATEST(1, COALESCE(v_cost, 100));

      EXIT WHEN v_proc_pts < v_cost;

      UPDATE public.country_military_units
      SET extra_count = extra_count + 1,
          procuration_points = procuration_points - v_cost,
          updated_at = now()
      WHERE country_id = v_country_id AND roster_unit_id = v_roster_unit_id;
    END LOOP;
  END LOOP;

  FOR v_country_id, v_roster_unit_id IN
    SELECT f.country_id, f.stock_roster_unit_id
    FROM public.country_etat_major_focus f
    WHERE f.stock_roster_unit_id IS NOT NULL
  LOOP
    SELECT COALESCE(c.science, 0) INTO v_science FROM public.countries c WHERE c.id = v_country_id;
    SELECT COALESCE(bb.em_stock_bonus, 0) INTO v_em_budget FROM public.cron_budget_bonuses bb WHERE bb.country_id = v_country_id;

    v_pts := (v_stock_min + (v_stock_max - v_stock_min) * LEAST(10, GREATEST(0, v_science)) / 10.0) * (1 + COALESCE(v_em_budget, 0));
    v_pts := ROUND(v_pts);

    INSERT INTO public.country_military_units (country_id, roster_unit_id, current_level, extra_count, recrutement_points, procuration_points, stock_points)
    SELECT v_country_id, v_roster_unit_id, 0, 0, 0, 0, 0
    WHERE NOT EXISTS (SELECT 1 FROM public.country_military_units cmu WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id);

    UPDATE public.country_military_units cmu
    SET stock_points = cmu.stock_points + GREATEST(0, v_pts)::int,
        updated_at = now()
    WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id;

    LOOP
      SELECT cmu.current_level, cmu.extra_count, cmu.stock_points, r.level_count
        INTO v_cur_level, v_extra, v_stock_pts, v_level_count
      FROM public.country_military_units cmu
      JOIN public.military_roster_units r ON r.id = cmu.roster_unit_id
      WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id;
      EXIT WHEN NOT FOUND;

      v_unlocked_level := GREATEST(1, LEAST(COALESCE(v_level_count, 10), (v_cur_level / 100)));
      SELECT COALESCE(lvl.mobilization_cost, 100) INTO v_cost
        FROM public.military_roster_unit_levels lvl
        WHERE lvl.unit_id = v_roster_unit_id AND lvl.level = v_unlocked_level
        LIMIT 1;
      v_cost := GREATEST(1, COALESCE(v_cost, 100));

      EXIT WHEN v_stock_pts < v_cost;

      UPDATE public.country_military_units
      SET extra_count = extra_count + 1,
          stock_points = stock_points - v_cost,
          updated_at = now()
      WHERE country_id = v_country_id AND roster_unit_id = v_roster_unit_id;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.run_etat_major_tick() IS 'État Major : design, recrutement (budget Défense), procuration, stock ; bonus budget ministères (em_* dans cron_budget_bonuses).';

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
          OR (pr.requirement_kind = 'influence' AND COALESCE(public.compute_country_influence_for_perk(c.id), 0) < pr.value)
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
          OR (pr.requirement_kind = 'influence' AND COALESCE(public.compute_country_influence_for_perk(c.id), 0) < pr.value)
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
  PERFORM public.apply_budget_ministry_bilateral_relations();

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
  'Cron quotidien : snapshot, lois, logs, mise à jour pays (global + effets + lois + IA + idéologie + perks), État Major, state_actions, relation_delta, budget relations bilatérales, décrément effets, intel, date du monde.';