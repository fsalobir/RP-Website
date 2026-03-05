-- Associer chaque pays à un continent (Europe, Asie, Afrique, Amérique) pour le routage Discord.

-- Europe
UPDATE public.countries SET continent_id = (SELECT id FROM public.continents WHERE slug = 'europe' LIMIT 1)
WHERE name IN (
  'France', 'Allemagne', 'Royaume-Uni', 'Italie', 'Espagne', 'Russie', 'Pologne', 'Ukraine',
  'Pays-Bas', 'Belgique', 'Suède', 'Suisse', 'Norvège', 'Portugal', 'Grèce',
  'République tchèque', 'Roumanie'
);

-- Asie (inclut Asie-Pacifique : Japon, Inde, Australie, Indonésie, etc.)
UPDATE public.countries SET continent_id = (SELECT id FROM public.continents WHERE slug = 'asie' LIMIT 1)
WHERE name IN (
  'Chine', 'Japon', 'Inde', 'Turquie', 'Arabie saoudite', 'Iran', 'Pakistan',
  'Corée du Sud', 'Thaïlande', 'Vietnam', 'Indonésie', 'Australie',
  'Israël', 'Émirats arabes unis'
);

-- Afrique
UPDATE public.countries SET continent_id = (SELECT id FROM public.continents WHERE slug = 'afrique' LIMIT 1)
WHERE name IN (
  'Afrique du Sud', 'Nigeria', 'Égypte'
);

-- Amérique
UPDATE public.countries SET continent_id = (SELECT id FROM public.continents WHERE slug = 'amerique' LIMIT 1)
WHERE name IN (
  'États-Unis', 'Brésil', 'Canada', 'Mexique', 'Argentine', 'Colombie'
);
