-- Seed unités Terre : Infanterie, Blindés, Soutien.
-- Chaque unité a 7 niveaux avec manpower 100, 200, …, 700.

DO $$
DECLARE
  u_id uuid;
  i smallint;
  units_to_add jsonb := '[
    {"sub_type": "Infanterie", "name_fr": "Infanterie de montagne", "sort_order": 10},
    {"sub_type": "Infanterie", "name_fr": "Infanterie mécanisée", "sort_order": 11},
    {"sub_type": "Infanterie", "name_fr": "Infanterie de marine", "sort_order": 12},
    {"sub_type": "Infanterie", "name_fr": "Infanterie aéroportée", "sort_order": 13},
    {"sub_type": "Infanterie", "name_fr": "Forces spéciales", "sort_order": 14},
    {"sub_type": "Infanterie", "name_fr": "Garde nationale", "sort_order": 15},
    {"sub_type": "Infanterie", "name_fr": "Mercenaire", "sort_order": 16},
    {"sub_type": "Blindés", "name_fr": "Véhicule Reco & Combat", "sort_order": 20},
    {"sub_type": "Blindés", "name_fr": "Véhicule de combat blindé", "sort_order": 21},
    {"sub_type": "Blindés", "name_fr": "Véhicule combat amphibie", "sort_order": 22},
    {"sub_type": "Blindés", "name_fr": "Char de combat principal", "sort_order": 23},
    {"sub_type": "Blindés", "name_fr": "Chasseur de chars", "sort_order": 24},
    {"sub_type": "Soutien", "name_fr": "Artillerie tractée", "sort_order": 30},
    {"sub_type": "Soutien", "name_fr": "Artillerie mobile", "sort_order": 31},
    {"sub_type": "Soutien", "name_fr": "Lance-roquettes multiple", "sort_order": 32},
    {"sub_type": "Soutien", "name_fr": "Véhicule antiaérien mobile", "sort_order": 33},
    {"sub_type": "Soutien", "name_fr": "Lance-missiles SAM", "sort_order": 34},
    {"sub_type": "Soutien", "name_fr": "Système défense théâtre", "sort_order": 35},
    {"sub_type": "Soutien", "name_fr": "Radar mobile", "sort_order": 36},
    {"sub_type": "Soutien", "name_fr": "Artillerie Côtière", "sort_order": 37}
  ]'::jsonb;
  j jsonb;
BEGIN
  FOR j IN SELECT * FROM jsonb_array_elements(units_to_add)
  LOOP
    INSERT INTO public.military_roster_units (branch, sub_type, name_fr, level_count, base_count, sort_order)
    VALUES (
      'terre',
      j->>'sub_type',
      j->>'name_fr',
      7,
      0,
      (j->>'sort_order')::smallint
    )
    RETURNING id INTO u_id;

    FOR i IN 1..7 LOOP
      INSERT INTO public.military_roster_unit_levels (unit_id, level, manpower)
      VALUES (u_id, i, 100 * i)
      ON CONFLICT (unit_id, level) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
