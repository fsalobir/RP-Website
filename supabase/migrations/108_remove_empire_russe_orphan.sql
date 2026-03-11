-- Suppression de l'« Empire Russe » sans région (doublon orphelin).
DELETE FROM public.countries
WHERE name = 'Empire Russe'
  AND id NOT IN (SELECT country_id FROM public.map_region_countries);
