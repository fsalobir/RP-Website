-- Seed complémentaire du roster militaire (air / mer / stratégique)
-- + extension de l'ancien référentiel military_unit_types.

DO $$
DECLARE
  u_id uuid;
  lvl smallint;
  j jsonb;
  roster_units jsonb := '[
    {"branch": "air", "sub_type": "Hélicoptères", "name_fr": "Hélicoptère de combat", "sort_order": 110},
    {"branch": "air", "sub_type": "Hélicoptères", "name_fr": "Hélicoptère d''attaque", "sort_order": 111},
    {"branch": "air", "sub_type": "Hélicoptères", "name_fr": "Hélicoptère GASM", "sort_order": 112},
    {"branch": "air", "sub_type": "Avions", "name_fr": "Chasseur de sup. aérienne", "sort_order": 120},
    {"branch": "air", "sub_type": "Avions", "name_fr": "Chasseur de sup. maritime", "sort_order": 121},
    {"branch": "air", "sub_type": "Avions", "name_fr": "Chasseur furtif", "sort_order": 122},
    {"branch": "air", "sub_type": "Avions", "name_fr": "Chasseur-bombardier", "sort_order": 123},
    {"branch": "air", "sub_type": "Avions", "name_fr": "Chasseur-bomb. maritime", "sort_order": 124},
    {"branch": "air", "sub_type": "Avions", "name_fr": "Chasseur-bombardier furtif", "sort_order": 125},
    {"branch": "air", "sub_type": "Avions", "name_fr": "Drone", "sort_order": 126},
    {"branch": "air", "sub_type": "Avions lourds", "name_fr": "Avion patrouille maritime", "sort_order": 130},
    {"branch": "air", "sub_type": "Avions lourds", "name_fr": "AWACS", "sort_order": 131},
    {"branch": "air", "sub_type": "Avions lourds", "name_fr": "AWACS naval", "sort_order": 132},
    {"branch": "air", "sub_type": "Avions lourds", "name_fr": "Bombardier lourd", "sort_order": 133},
    {"branch": "air", "sub_type": "Avions lourds", "name_fr": "Bombardier furtif", "sort_order": 134},
    {"branch": "mer", "sub_type": "Navires légers", "name_fr": "Patrouilleur", "sort_order": 210},
    {"branch": "mer", "sub_type": "Navires légers", "name_fr": "Corvette", "sort_order": 211},
    {"branch": "mer", "sub_type": "Navires légers", "name_fr": "Frégate", "sort_order": 212},
    {"branch": "mer", "sub_type": "Navires lourds", "name_fr": "Destroyer", "sort_order": 220},
    {"branch": "mer", "sub_type": "Navires lourds", "name_fr": "Croiseur", "sort_order": 221},
    {"branch": "mer", "sub_type": "Navires lourds", "name_fr": "Portes-Hélicoptère", "sort_order": 222},
    {"branch": "mer", "sub_type": "Navires lourds", "name_fr": "Porte-avions", "sort_order": 223},
    {"branch": "mer", "sub_type": "Sous-marins", "name_fr": "Sous-marin d''attaque", "sort_order": 230},
    {"branch": "mer", "sub_type": "Sous-marins", "name_fr": "SM. Ballistique", "sort_order": 231},
    {"branch": "strategique", "sub_type": "Stock stratégique", "name_fr": "Pharmaceutiques", "sort_order": 310},
    {"branch": "strategique", "sub_type": "Stock stratégique", "name_fr": "Déployables", "sort_order": 311},
    {"branch": "strategique", "sub_type": "Stock stratégique", "name_fr": "Charges conventionnelles", "sort_order": 312},
    {"branch": "strategique", "sub_type": "Stock stratégique", "name_fr": "Charges chimiques", "sort_order": 313},
    {"branch": "strategique", "sub_type": "Stock stratégique", "name_fr": "Charges Nucléaires", "sort_order": 314},
    {"branch": "strategique", "sub_type": "Lanceurs", "name_fr": "Missile balistique intercontinental", "sort_order": 320},
    {"branch": "strategique", "sub_type": "Lanceurs", "name_fr": "Missile balistique", "sort_order": 321},
    {"branch": "strategique", "sub_type": "Lanceurs", "name_fr": "Missile de croisière", "sort_order": 322}
  ]'::jsonb;
  legacy_types jsonb := '[
    {"branch": "air", "name_fr": "Hélicoptère de combat", "sort_order": 110},
    {"branch": "air", "name_fr": "Hélicoptère d''attaque", "sort_order": 111},
    {"branch": "air", "name_fr": "Hélicoptère GASM", "sort_order": 112},
    {"branch": "air", "name_fr": "Chasseur de sup. aérienne", "sort_order": 120},
    {"branch": "air", "name_fr": "Chasseur de sup. maritime", "sort_order": 121},
    {"branch": "air", "name_fr": "Chasseur furtif", "sort_order": 122},
    {"branch": "air", "name_fr": "Chasseur-bombardier", "sort_order": 123},
    {"branch": "air", "name_fr": "Chasseur-bomb. maritime", "sort_order": 124},
    {"branch": "air", "name_fr": "Chasseur-bombardier furtif", "sort_order": 125},
    {"branch": "air", "name_fr": "Drone", "sort_order": 126},
    {"branch": "air", "name_fr": "Avion patrouille maritime", "sort_order": 130},
    {"branch": "air", "name_fr": "AWACS", "sort_order": 131},
    {"branch": "air", "name_fr": "AWACS naval", "sort_order": 132},
    {"branch": "air", "name_fr": "Bombardier lourd", "sort_order": 133},
    {"branch": "air", "name_fr": "Bombardier furtif", "sort_order": 134},
    {"branch": "mer", "name_fr": "Patrouilleur", "sort_order": 210},
    {"branch": "mer", "name_fr": "Corvette", "sort_order": 211},
    {"branch": "mer", "name_fr": "Frégate", "sort_order": 212},
    {"branch": "mer", "name_fr": "Destroyer", "sort_order": 220},
    {"branch": "mer", "name_fr": "Croiseur", "sort_order": 221},
    {"branch": "mer", "name_fr": "Portes-Hélicoptère", "sort_order": 222},
    {"branch": "mer", "name_fr": "Porte-avions", "sort_order": 223},
    {"branch": "mer", "name_fr": "Sous-marin d''attaque", "sort_order": 230},
    {"branch": "mer", "name_fr": "SM. Ballistique", "sort_order": 231},
    {"branch": "strategique", "name_fr": "Pharmaceutiques", "sort_order": 310},
    {"branch": "strategique", "name_fr": "Déployables", "sort_order": 311},
    {"branch": "strategique", "name_fr": "Charges conventionnelles", "sort_order": 312},
    {"branch": "strategique", "name_fr": "Charges chimiques", "sort_order": 313},
    {"branch": "strategique", "name_fr": "Charges Nucléaires", "sort_order": 314},
    {"branch": "strategique", "name_fr": "Missile balistique intercontinental", "sort_order": 320},
    {"branch": "strategique", "name_fr": "Missile balistique", "sort_order": 321},
    {"branch": "strategique", "name_fr": "Missile de croisière", "sort_order": 322}
  ]'::jsonb;
BEGIN
  FOR j IN SELECT * FROM jsonb_array_elements(roster_units)
  LOOP
    SELECT id
    INTO u_id
    FROM public.military_roster_units
    WHERE branch = (j->>'branch')::public.military_branch
      AND COALESCE(sub_type, '') = COALESCE(j->>'sub_type', '')
      AND name_fr = j->>'name_fr'
    LIMIT 1;

    IF u_id IS NULL THEN
      INSERT INTO public.military_roster_units (
        branch,
        sub_type,
        name_fr,
        level_count,
        base_count,
        sort_order
      )
      VALUES (
        (j->>'branch')::public.military_branch,
        j->>'sub_type',
        j->>'name_fr',
        7,
        0,
        (j->>'sort_order')::smallint
      )
      RETURNING id INTO u_id;
    END IF;

    FOR lvl IN 1..7 LOOP
      INSERT INTO public.military_roster_unit_levels (
        unit_id,
        level,
        manpower,
        hard_power
      )
      VALUES (
        u_id,
        lvl,
        100 * lvl,
        100 * lvl
      )
      ON CONFLICT (unit_id, level) DO NOTHING;
    END LOOP;
  END LOOP;

  FOR j IN SELECT * FROM jsonb_array_elements(legacy_types)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.military_unit_types
      WHERE branch = (j->>'branch')::public.military_branch
        AND name_fr = j->>'name_fr'
    ) THEN
      INSERT INTO public.military_unit_types (branch, name_fr, sort_order)
      VALUES (
        (j->>'branch')::public.military_branch,
        j->>'name_fr',
        (j->>'sort_order')::smallint
      );
    END IF;
  END LOOP;
END $$;
