-- Met current_level = 100 (un palier de progression complet) pour tous les pays
-- et toutes les unités roster, sauf unités d'élite / stratégiques listées ci-dessous
-- et toute la branche strategique.

INSERT INTO public.country_military_units (
  country_id,
  roster_unit_id,
  current_level,
  extra_count,
  recrutement_points,
  procuration_points,
  stock_points
)
SELECT
  c.id,
  r.id,
  100,
  0,
  0,
  0,
  0
FROM public.countries c
CROSS JOIN public.military_roster_units r
WHERE r.branch <> 'strategique'::public.military_branch
  AND r.name_fr NOT IN (
    'Forces spéciales',
    'Chasseur furtif',
    'Chasseur-bombardier furtif',
    'Bombardier furtif',
    'Croiseur',
    'Portes-Hélicoptère',
    'Porte-avions',
    'SM. Ballistique'
  )
ON CONFLICT (country_id, roster_unit_id) DO UPDATE
SET
  current_level = 100,
  updated_at = now();
