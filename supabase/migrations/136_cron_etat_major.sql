-- État Major : progression Design, Recrutement, Procuration, Stock dans le cron quotidien.

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
  v_stock_min numeric;
  v_stock_max numeric;
  v_procuration_base numeric;
  v_procuration_per_pct numeric;
  v_country_id uuid;
  v_roster_unit_id uuid;
  v_industry numeric;
  v_militarism numeric;
  v_science numeric;
  v_pct_proc numeric;
  v_gdp numeric;
  v_design_bonus numeric;
  v_rec_bonus numeric;
  v_proc_bonus numeric;
  v_proc_points_per_day numeric;
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
  v_stock_min  := COALESCE((v_config->'stock'->>'min_points_per_tick')::numeric, 1);
  v_stock_max  := COALESCE((v_config->'stock'->>'max_points_per_tick')::numeric, 10);
  v_procuration_base   := COALESCE((v_config->'procuration'->>'base_points_per_tick')::numeric, 0);
  v_procuration_per_pct := COALESCE((v_config->'procuration'->>'points_per_pct_budget')::numeric, 0.5);

  -- Design : pour chaque pays avec design_roster_unit_id
  FOR v_country_id, v_roster_unit_id IN
    SELECT f.country_id, f.design_roster_unit_id
    FROM public.country_etat_major_focus f
    WHERE f.design_roster_unit_id IS NOT NULL
  LOOP
    SELECT COALESCE(c.industry, 0) INTO v_industry FROM public.countries c WHERE c.id = v_country_id;
    SELECT COALESCE(SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END), 0) INTO v_design_bonus
      FROM public.country_effects
      WHERE country_id = v_country_id AND effect_kind = 'design_bonus_percent' AND (duration_kind = 'permanent' OR duration_remaining > 0);

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

  -- Recrutement : points + overflow vers extra_count
  FOR v_country_id, v_roster_unit_id IN
    SELECT f.country_id, f.recrutement_roster_unit_id
    FROM public.country_etat_major_focus f
    WHERE f.recrutement_roster_unit_id IS NOT NULL
  LOOP
    SELECT COALESCE(c.militarism, 0) INTO v_militarism FROM public.countries c WHERE c.id = v_country_id;
    SELECT COALESCE(SUM(CASE WHEN ABS(value) > 1 THEN value / 100.0 ELSE value END), 0) INTO v_rec_bonus
      FROM public.country_effects
      WHERE country_id = v_country_id AND effect_kind = 'recrutement_bonus_percent' AND (duration_kind = 'permanent' OR duration_remaining > 0);

    v_pts := (v_rec_min + (v_rec_max - v_rec_min) * LEAST(10, GREATEST(0, v_militarism)) / 10.0) * (1 + v_rec_bonus);
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

  -- Procuration : budget-based points + effet points/jour + overflow
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

  -- Stock stratégique
  FOR v_country_id, v_roster_unit_id IN
    SELECT f.country_id, f.stock_roster_unit_id
    FROM public.country_etat_major_focus f
    WHERE f.stock_roster_unit_id IS NOT NULL
  LOOP
    SELECT COALESCE(c.science, 0) INTO v_science FROM public.countries c WHERE c.id = v_country_id;

    v_pts := (v_stock_min + (v_stock_max - v_stock_min) * LEAST(10, GREATEST(0, v_science)) / 10.0);
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

COMMENT ON FUNCTION public.run_etat_major_tick() IS 'Applique la progression État Major (Design, Recrutement, Procuration, Stock) pour tous les pays ayant un focus défini.';

-- Intégration dans run_daily_country_update : voir 137_cron_call_etat_major_tick.sql
