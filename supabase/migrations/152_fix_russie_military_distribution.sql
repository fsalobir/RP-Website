-- Correctif de donnees de test Russie apres seed initial.
-- Ajuste la repartition pour obtenir un total de 200 unites ciblees.

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
    RAISE NOTICE 'Pays "russie" introuvable, correctif ignore.';
    RETURN;
  END IF;

  WITH unit_roles AS (
    SELECT
      u.id AS unit_id,
      u.branch,
      COALESCE(u.sub_type, '') AS sub_type,
      CASE
        WHEN u.branch = 'terre' AND COALESCE(u.sub_type, '') = 'Infanterie' THEN 'infanterie'
        WHEN u.branch = 'terre' AND COALESCE(u.sub_type, '') = 'Blindés' THEN 'blindes'
        WHEN u.branch = 'terre' AND COALESCE(u.sub_type, '') = 'Soutien' THEN 'soutien'
        WHEN u.branch = 'air' THEN 'air'
        WHEN u.branch = 'mer' THEN 'naval'
        ELSE 'hors_cible'
      END AS allocation_bucket
    FROM public.military_roster_units u
  ),
  category_targets AS (
    -- 10% restant non specifie dans la demande: injecte en soutien pour atteindre 200.
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
        ORDER BY u.sort_order, u.name_fr
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
  desired_extra AS (
    SELECT
      cu.unit_id,
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
  )
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
  FROM desired_extra d
  ON CONFLICT (country_id, roster_unit_id) DO UPDATE
  SET
    current_level = EXCLUDED.current_level,
    extra_count = EXCLUDED.extra_count,
    recrutement_points = 0,
    procuration_points = 0,
    stock_points = 0,
    updated_at = now();
END $$;
