-- Règle Sphère : % de l'influence du pays sous emprise attribuée à l'overlord (par statut).

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
SELECT
  'sphere_influence_pct',
  '{"contested": 50, "occupied": 80, "annexed": 100}'::jsonb,
  'Pourcentage de l''influence du pays sous emprise attribué à l''overlord (Contesté / Occupé / Annexé).',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.rule_parameters WHERE key = 'sphere_influence_pct');
