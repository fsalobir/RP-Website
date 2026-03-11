-- Pré-config admins : reset relations, suppression Empire Russe orphelin, remplir toutes les régions orphelines, config IA par défaut.
-- Une migration unique pour éviter les conflits de versions déjà appliquées (101-104).

-- 1) Reset des relations diplomatiques
UPDATE public.country_relations
SET value = 0, updated_at = now();

-- 2) Suppression Empire Russe sans région
DELETE FROM public.countries
WHERE name = 'Empire Russe'
  AND id NOT IN (SELECT country_id FROM public.map_region_countries);

-- 3) Un pays par région orpheline (nom = nom de la région, slug unique pour que chaque région ait son pays)
DO $$
DECLARE
  r record;
  cid uuid;
  cslug text;
BEGIN
  FOR r IN
    SELECT id AS region_id, name AS region_name, slug AS region_slug
    FROM public.map_regions mr
    WHERE NOT EXISTS (SELECT 1 FROM public.map_region_countries mrc WHERE mrc.region_id = mr.id)
  LOOP
    cslug := r.region_slug;
    IF EXISTS (SELECT 1 FROM public.countries WHERE slug = cslug) THEN
      cslug := r.region_slug || '-r-' || left(r.region_id::text, 8);
    END IF;

    INSERT INTO public.countries (
      name, slug, regime, flag_url,
      population, gdp, militarism, industry, science, stability, ai_status
    )
    VALUES (
      r.region_name,
      cslug,
      'République',
      NULL,
      50000000,
      600000000000,
      5, 5, 5, 0,
      NULL
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO cid;

    IF cid IS NULL THEN
      SELECT id INTO cid FROM public.countries WHERE slug = cslug LIMIT 1;
    END IF;

    IF cid IS NOT NULL THEN
      INSERT INTO public.map_region_countries (region_id, country_id)
      VALUES (r.region_id, cid)
      ON CONFLICT (region_id, country_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- 4) Config events IA : valeurs par défaut si config encore vide
UPDATE public.rule_parameters
SET value = value
  || '{
    "count_major_per_run": 1,
    "count_minor_per_run": 1,
    "allowed_action_type_keys_major": ["ouverture_diplomatique"],
    "allowed_action_type_keys_minor": ["ouverture_diplomatique"],
    "target_major_ai": true,
    "target_minor_ai": true
  }'::jsonb
WHERE key = 'ai_events_config'
  AND COALESCE((value->>'count_major_per_run')::int, 0) = 0
  AND COALESCE((value->>'count_minor_per_run')::int, 0) = 0
  AND COALESCE(jsonb_array_length(value->'allowed_action_type_keys_major'), 0) = 0
  AND COALESCE(jsonb_array_length(value->'allowed_action_type_keys_minor'), 0) = 0;
