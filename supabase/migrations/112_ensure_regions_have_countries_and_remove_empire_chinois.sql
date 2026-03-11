-- Supprime le pays orphelin "Empire Chinois" puis garantit qu'une région orpheline
-- dispose d'un pays lié (création idempotente).

DELETE FROM public.countries
WHERE slug = 'empire-chinois'
  AND id NOT IN (SELECT country_id FROM public.map_region_countries);

DO $$
DECLARE
  mapping jsonb := $json$
{
  "france": { "name": "France", "regime": "République", "iso2": "fr" },
  "allemagne": { "name": "Allemagne", "regime": "République fédérale", "iso2": "de" },
  "royaume-uni": { "name": "Royaume-Uni", "regime": "Monarchie parlementaire", "iso2": "gb" },
  "italie": { "name": "Italie", "regime": "République", "iso2": "it" },
  "espagne": { "name": "Espagne", "regime": "Monarchie parlementaire", "iso2": "es" },
  "russie": { "name": "Russie", "regime": "Fédération", "iso2": "ru" },
  "chine": { "name": "Chine", "regime": "République populaire", "iso2": "cn" },
  "japon": { "name": "Japon", "regime": "Monarchie parlementaire", "iso2": "jp" },
  "inde": { "name": "Inde", "regime": "République fédérale", "iso2": "in" },
  "etats-unis": { "name": "États-Unis", "regime": "République fédérale", "iso2": "us" },
  "bresil": { "name": "Brésil", "regime": "République fédérale", "iso2": "br" },
  "canada": { "name": "Canada", "regime": "Monarchie parlementaire", "iso2": "ca" },
  "australie": { "name": "Australie", "regime": "Monarchie parlementaire", "iso2": "au" },
  "mexique": { "name": "Mexique", "regime": "République fédérale", "iso2": "mx" },
  "indonesie": { "name": "Indonésie", "regime": "République", "iso2": "id" },
  "turquie": { "name": "Turquie", "regime": "République", "iso2": "tr" },
  "arabie-saoudite": { "name": "Arabie saoudite", "regime": "Monarchie absolue", "iso2": "sa" },
  "afrique-du-sud": { "name": "Afrique du Sud", "regime": "République", "iso2": "za" },
  "nigeria": { "name": "Nigeria", "regime": "République fédérale", "iso2": "ng" },
  "egypte": { "name": "Égypte", "regime": "République", "iso2": "eg" },
  "iran": { "name": "Iran", "regime": "République islamique", "iso2": "ir" },
  "pakistan": { "name": "Pakistan", "regime": "République islamique", "iso2": "pk" },
  "coree-du-sud": { "name": "Corée du Sud", "regime": "République", "iso2": "kr" },
  "pologne": { "name": "Pologne", "regime": "République", "iso2": "pl" },
  "ukraine": { "name": "Ukraine", "regime": "République", "iso2": "ua" },
  "argentine": { "name": "Argentine", "regime": "République fédérale", "iso2": "ar" },
  "colombie": { "name": "Colombie", "regime": "République", "iso2": "co" },
  "thailande": { "name": "Thaïlande", "regime": "Monarchie constitutionnelle", "iso2": "th" },
  "vietnam": { "name": "Vietnam", "regime": "République socialiste", "iso2": "vn" },
  "pays-bas": { "name": "Pays-Bas", "regime": "Monarchie parlementaire", "iso2": "nl" },
  "belgique": { "name": "Belgique", "regime": "Monarchie fédérale", "iso2": "be" },
  "suede": { "name": "Suède", "regime": "Monarchie parlementaire", "iso2": "se" },
  "suisse": { "name": "Suisse", "regime": "République fédérale", "iso2": "ch" },
  "norvege": { "name": "Norvège", "regime": "Monarchie parlementaire", "iso2": "no" },
  "portugal": { "name": "Portugal", "regime": "République", "iso2": "pt" },
  "grece": { "name": "Grèce", "regime": "République", "iso2": "gr" },
  "republique-tcheque": { "name": "République tchèque", "regime": "République", "iso2": "cz" },
  "roumanie": { "name": "Roumanie", "regime": "République", "iso2": "ro" },
  "israel": { "name": "Israël", "regime": "République", "iso2": "il" },
  "emirats-arabes-unis": { "name": "Émirats arabes unis", "regime": "Fédération de monarchies", "iso2": "ae" }
}
$json$::jsonb;
  r record;
  entry jsonb;
  cid uuid;
  cslug text;
  cname text;
  cregime text;
  ciso2 text;
  cflag text;
BEGIN
  FOR r IN
    SELECT id AS region_id, name AS region_name, slug AS region_slug
    FROM public.map_regions mr
    WHERE NOT EXISTS (
      SELECT 1 FROM public.map_region_countries mrc WHERE mrc.region_id = mr.id
    )
  LOOP
    entry := mapping -> r.region_slug;

    cslug := COALESCE(NULLIF(entry ->> 'slug', ''), r.region_slug);
    cname := COALESCE(NULLIF(entry ->> 'name', ''), r.region_name);
    cregime := COALESCE(NULLIF(entry ->> 'regime', ''), 'République');
    ciso2 := lower(COALESCE(NULLIF(entry ->> 'iso2', ''), ''));

    IF ciso2 = '' AND r.region_slug ~ '^[a-z]{2}$' THEN
      ciso2 := lower(r.region_slug);
    END IF;

    cflag := CASE
      WHEN ciso2 ~ '^[a-z]{2}$' THEN 'https://flagcdn.com/w80/' || ciso2 || '.png'
      ELSE NULL
    END;

    INSERT INTO public.countries (
      name, slug, regime, flag_url,
      population, gdp, militarism, industry, science, stability, ai_status
    )
    VALUES (
      cname,
      cslug,
      cregime,
      cflag,
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
