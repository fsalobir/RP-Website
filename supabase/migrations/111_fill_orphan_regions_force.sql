-- Force un pays par région orpheline : slug toujours unique (region-<uuid>) pour créer de vrais nouveaux pays.
-- À exécuter si la 105 n'a rien créé (0 régions orphelines à l'époque) ou pour rattraper des orphelins.
DO $$
DECLARE
  r record;
  cid uuid;
  cslug text;
BEGIN
  FOR r IN
    SELECT id AS region_id, name AS region_name
    FROM public.map_regions mr
    WHERE NOT EXISTS (SELECT 1 FROM public.map_region_countries mrc WHERE mrc.region_id = mr.id)
  LOOP
    cslug := 'region-' || r.region_id::text;

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
