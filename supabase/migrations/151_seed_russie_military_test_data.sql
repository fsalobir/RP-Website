-- Donnees de test militaires:
-- 1) Russie: repartition cible des unites + niveaux techno aleatoires (1..5)
-- 2) Global roster: placeholders manpower / hard_power coherents sur niveaux 1..7

DO $$
DECLARE
  v_russia_id uuid;
BEGIN
  SELECT id
  INTO v_russia_id
  FROM public.countries
  WHERE slug = 'russie'
  LIMIT 1;

  IF v_russia_id IS NULL THEN
    RAISE NOTICE 'Pays "russie" introuvable, migration ignoree.';
    RETURN;
  END IF;

  -- S'assure que toutes les unites roster ont bien 7 niveaux.
  UPDATE public.military_roster_units
  SET level_count = 7,
      updated_at = now()
  WHERE level_count <> 7;

  -- Nettoie d'eventuels niveaux > 7 pour garder une echelle homogene.
  DELETE FROM public.military_roster_unit_levels l
  USING public.military_roster_units u
  WHERE l.unit_id = u.id
    AND l.level > 7;

  WITH unit_roles AS (
    SELECT
      u.id AS unit_id,
      u.branch,
      COALESCE(u.sub_type, '') AS sub_type,
      u.name_fr,
      CASE
        WHEN u.branch = 'terre' AND COALESCE(u.sub_type, '') = 'Infanterie' THEN 'infanterie'
        WHEN u.branch = 'terre' AND COALESCE(u.sub_type, '') = 'Blindés' THEN 'blindes'
        WHEN u.branch = 'terre' AND COALESCE(u.sub_type, '') = 'Soutien' THEN 'soutien'
        WHEN u.branch = 'air' THEN 'air'
        WHEN u.branch = 'mer' THEN 'naval'
        ELSE 'hors_cible'
      END AS allocation_bucket,
      CASE
        WHEN u.branch = 'mer' AND lower(u.name_fr) LIKE '%porte-avions%' THEN 'carrier'
        WHEN u.branch = 'mer' AND lower(u.name_fr) LIKE '%croiseur%' THEN 'heavy_surface'
        WHEN u.branch = 'mer' AND lower(u.name_fr) LIKE '%destroyer%' THEN 'heavy_surface'
        WHEN u.branch = 'mer' AND lower(u.name_fr) LIKE '%frégate%' THEN 'mid_surface'
        WHEN u.branch = 'mer' AND lower(u.name_fr) LIKE '%corvette%' THEN 'light_surface'
        WHEN u.branch = 'mer' AND lower(u.name_fr) LIKE '%patrouilleur%' THEN 'light_surface'
        WHEN u.branch = 'mer' AND lower(u.name_fr) LIKE '%sous-marin%' THEN 'submarine'
        WHEN u.branch = 'mer' THEN 'naval_generic'
        WHEN u.branch = 'air' AND lower(u.name_fr) LIKE '%awacs%' THEN 'awacs'
        WHEN u.branch = 'air' AND lower(u.name_fr) LIKE '%drone%' THEN 'drone'
        WHEN u.branch = 'air' AND lower(u.name_fr) LIKE '%bombardier%' THEN 'bomber'
        WHEN u.branch = 'air' AND lower(u.name_fr) LIKE '%chasseur%' THEN 'fighter'
        WHEN u.branch = 'air' AND lower(u.name_fr) LIKE '%hélicoptère%' THEN 'helicopter'
        WHEN u.branch = 'air' THEN 'air_support'
        WHEN u.branch = 'terre' AND COALESCE(u.sub_type, '') = 'Infanterie' THEN 'infantry'
        WHEN u.branch = 'terre' AND COALESCE(u.sub_type, '') = 'Blindés' THEN 'armor'
        WHEN u.branch = 'terre' AND COALESCE(u.sub_type, '') = 'Soutien' THEN 'artillery_support'
        WHEN u.branch = 'strategique' AND lower(u.name_fr) LIKE '%nuclé%' THEN 'strategic_nuclear'
        WHEN u.branch = 'strategique' AND lower(u.name_fr) LIKE '%missile%' THEN 'strategic_missile'
        WHEN u.branch = 'strategique' THEN 'strategic_stock'
        ELSE 'generic'
      END AS power_role
    FROM public.military_roster_units u
  ),
  category_targets AS (
    -- Repartition demandee (35/20/10/10/15 = 180) + reliquat 20 non specifie verse en soutien.
    SELECT 'infanterie'::text AS allocation_bucket, 70::integer AS target_count
    UNION ALL SELECT 'blindes', 40
    UNION ALL SELECT 'soutien', 40
    UNION ALL SELECT 'air', 20
    UNION ALL SELECT 'naval', 30
  ),
  category_units AS (
    SELECT
      ur.unit_id,
      ur.allocation_bucket,
      COALESCE(u.base_count, 0) AS base_count,
      COALESCE(ct.target_count, 0) AS target_count,
      row_number() OVER (
        PARTITION BY ur.allocation_bucket
        ORDER BY ur.branch, ur.sub_type, ur.name_fr
      ) AS rn,
      count(*) OVER (PARTITION BY ur.allocation_bucket) AS cnt
    FROM unit_roles ur
    JOIN public.military_roster_units u ON u.id = ur.unit_id
    LEFT JOIN category_targets ct ON ct.allocation_bucket = ur.allocation_bucket
    WHERE ur.allocation_bucket <> 'hors_cible'
  ),
  category_extra_needs AS (
    SELECT
      allocation_bucket,
      GREATEST(MAX(target_count) - SUM(base_count), 0) AS extra_needed
    FROM category_units
    GROUP BY allocation_bucket
  ),
  desired_country_counts_with_base AS (
    SELECT
      cu.unit_id,
      cu.base_count,
      GREATEST(
        (cen.extra_needed / cu.cnt)
        + CASE WHEN cu.rn <= (cen.extra_needed % cu.cnt) THEN 1 ELSE 0 END,
        0
      ) AS desired_extra_count
    FROM category_units cu
    JOIN category_extra_needs cen ON cen.allocation_bucket = cu.allocation_bucket
  ),
  purge_non_target AS (
    DELETE FROM public.country_military_units cmu
    USING public.military_roster_units u
    WHERE cmu.country_id = v_russia_id
      AND cmu.roster_unit_id = u.id
      AND (
        u.branch = 'strategique'
        OR (u.branch = 'terre' AND COALESCE(u.sub_type, '') NOT IN ('Infanterie', 'Blindés', 'Soutien'))
      )
    RETURNING 1
  ),
  upsert_country AS (
    INSERT INTO public.country_military_units (
      country_id,
      roster_unit_id,
      current_level,
      extra_count,
      recrutement_points,
      procuration_points,
      stock_points
    )
    SELECT
      v_russia_id,
      d.unit_id,
      ((1 + floor(random() * 5))::integer * 100) AS current_level,
      d.desired_extra_count,
      0,
      0,
      0
    FROM desired_country_counts_with_base d
    ON CONFLICT (country_id, roster_unit_id) DO UPDATE
    SET
      current_level = EXCLUDED.current_level,
      extra_count = EXCLUDED.extra_count,
      recrutement_points = 0,
      procuration_points = 0,
      stock_points = 0,
      updated_at = now()
    RETURNING 1
  ),
  role_scale AS (
    SELECT 'infantry'::text AS power_role, 22::int AS manpower_l1, 140::int AS manpower_l7, 10::int AS hard_l1, 20::int AS hard_l7
    UNION ALL SELECT 'armor', 70, 90, 45, 120
    UNION ALL SELECT 'artillery_support', 55, 80, 35, 95
    UNION ALL SELECT 'fighter', 20, 30, 90, 220
    UNION ALL SELECT 'bomber', 24, 36, 130, 320
    UNION ALL SELECT 'awacs', 35, 55, 25, 65
    UNION ALL SELECT 'drone', 8, 16, 45, 120
    UNION ALL SELECT 'helicopter', 18, 28, 60, 150
    UNION ALL SELECT 'air_support', 26, 40, 40, 100
    UNION ALL SELECT 'carrier', 320, 500, 200, 500
    UNION ALL SELECT 'heavy_surface', 180, 280, 130, 320
    UNION ALL SELECT 'mid_surface', 130, 210, 90, 240
    UNION ALL SELECT 'light_surface', 90, 160, 55, 150
    UNION ALL SELECT 'submarine', 95, 150, 110, 290
    UNION ALL SELECT 'naval_generic', 120, 180, 80, 200
    UNION ALL SELECT 'strategic_nuclear', 12, 20, 220, 460
    UNION ALL SELECT 'strategic_missile', 10, 18, 140, 320
    UNION ALL SELECT 'strategic_stock', 30, 50, 10, 40
    UNION ALL SELECT 'generic', 60, 100, 30, 90
  ),
  levels AS (
    SELECT generate_series(1, 7)::smallint AS level
  ),
  level_values AS (
    SELECT
      ur.unit_id,
      lv.level,
      GREATEST(
        round(
          rs.manpower_l1
          + (rs.manpower_l7 - rs.manpower_l1) * ((lv.level - 1)::numeric / 6.0)
        )::integer,
        0
      ) AS manpower,
      GREATEST(
        round(
          rs.hard_l1
          + (rs.hard_l7 - rs.hard_l1) * ((lv.level - 1)::numeric / 6.0)
        )::integer,
        0
      ) AS hard_power
    FROM unit_roles ur
    JOIN role_scale rs ON rs.power_role = ur.power_role
    CROSS JOIN levels lv
  )
  INSERT INTO public.military_roster_unit_levels (
    unit_id,
    level,
    manpower,
    hard_power
  )
  SELECT
    lv.unit_id,
    lv.level,
    lv.manpower,
    lv.hard_power
  FROM level_values lv
  ON CONFLICT (unit_id, level) DO UPDATE
  SET
    manpower = EXCLUDED.manpower,
    hard_power = EXCLUDED.hard_power;
END $$;
