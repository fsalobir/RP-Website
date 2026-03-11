-- Remplit les régions orphelines (sans pays) avec un pays réel par région.
-- Mapping région slug -> { name, iso2 } ; flag_url = https://flagcdn.com/w80/{iso2}.png
-- Générer le mapping avec : node scripts/generate-fill-orphan-regions.js
DO $$
DECLARE
  mapping jsonb := '{}'::jsonb;
  r record;
  cid uuid;
  cname text;
  cslug text;
  cflag text;
  entry jsonb;
BEGIN
  FOR r IN
    SELECT id AS region_id, name AS region_name, slug AS region_slug
    FROM public.map_regions mr
    WHERE NOT EXISTS (SELECT 1 FROM public.map_region_countries mrc WHERE mrc.region_id = mr.id)
  LOOP
    entry := mapping -> r.region_slug;
    IF entry IS NOT NULL AND entry <> 'null'::jsonb THEN
      cname := entry ->> 'name';
      cslug := entry ->> 'slug';
      cflag := CASE
        WHEN entry ->> 'iso2' IS NOT NULL AND (entry ->> 'iso2') <> '' THEN
          'https://flagcdn.com/w80/' || lower(entry ->> 'iso2') || '.png'
        ELSE NULL
      END;
      IF cname IS NULL OR cname = '' THEN
        cname := r.region_name;
      END IF;
      IF cslug IS NULL OR cslug = '' THEN
        cslug := r.region_slug;
      END IF;
    ELSE
      cname := r.region_name;
      cslug := r.region_slug;
      cflag := NULL;
    END IF;

    INSERT INTO public.countries (
      name, slug, regime, flag_url,
      population, gdp, militarism, industry, science, stability, ai_status
    )
    VALUES (
      cname,
      cslug,
      COALESCE(NULLIF(trim((entry ->> 'regime')), ''), 'République'),
      cflag,
      50000000,
      600000000000,
      5, 5, 5, 0,
      NULL
    )
    ON CONFLICT (slug) DO UPDATE SET updated_at = now()
    RETURNING id INTO cid;

    IF cid IS NOT NULL THEN
      INSERT INTO public.map_region_countries (region_id, country_id)
      VALUES (r.region_id, cid)
      ON CONFLICT (region_id, country_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
