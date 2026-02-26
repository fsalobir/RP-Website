-- Données de démo : insère un snapshot "hier" pour l'Empire Russe (et tout pays dont le nom contient "Russe")
-- afin d'afficher les parenthèses d'évolution (vert = hausse, rouge = baisse) sur toutes les stats de la liste :
-- Population, PIB, Militarisme, Industrie, Science, Stabilité.
-- Exécuter une seule fois dans le SQL Editor Supabase.

INSERT INTO public.country_history (
  country_id,
  date,
  population,
  gdp,
  militarism,
  industry,
  science,
  stability
)
SELECT
  c.id,
  current_date - interval '1 day',
  GREATEST(0, c.population - 500000),
  GREATEST(0, c.gdp - 50000000),
  GREATEST(0, c.militarism - 2),
  LEAST(10, c.industry + 1),
  GREATEST(0, c.science - 1),
  GREATEST(-3, c.stability - 1)
FROM public.countries c
WHERE c.name ILIKE '%Russe%'
  AND NOT EXISTS (
    SELECT 1 FROM public.country_history h
    WHERE h.country_id = c.id
  );
