-- Correctif: remet une progression croissante du manpower pour l'infanterie (niveau 1 -> 7).

WITH infantry_units AS (
  SELECT id
  FROM public.military_roster_units
  WHERE branch = 'terre'
    AND COALESCE(sub_type, '') = 'Infanterie'
),
levels AS (
  SELECT generate_series(1, 7)::smallint AS level
)
INSERT INTO public.military_roster_unit_levels (unit_id, level, manpower, hard_power)
SELECT
  iu.id,
  lv.level,
  round(22 + (140 - 22) * ((lv.level - 1)::numeric / 6.0))::integer AS manpower,
  round(10 + (20 - 10) * ((lv.level - 1)::numeric / 6.0))::integer AS hard_power
FROM infantry_units iu
CROSS JOIN levels lv
ON CONFLICT (unit_id, level) DO UPDATE
SET
  manpower = EXCLUDED.manpower,
  hard_power = EXCLUDED.hard_power;
