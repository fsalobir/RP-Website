-- Insérer les clés rule_parameters pour État Major et Procuration Militaire (si absentes).

INSERT INTO public.rule_parameters (key, value, description)
VALUES (
  'etat_major_config',
  '{
    "design": { "min_points_per_tick": 1, "max_points_per_tick": 10 },
    "recrutement": { "min_points_per_tick": 1, "max_points_per_tick": 10, "points_per_pct_defense": 0 },
    "stock": { "min_points_per_tick": 1, "max_points_per_tick": 10 },
    "procuration": { "base_points_per_tick": 0, "points_per_pct_budget": 0.5 }
  }'::jsonb,
  'Config État Major : points par tick (Design = industrie, Recrutement = militarisme + budget Défense, Stock = science, Procuration = budget).'
),
(
  'budget_procuration_militaire',
  '{"min_pct": 0, "gravity_pct": 50, "bonuses": {}, "maluses": {}}'::jsonb,
  'Procuration Militaire (État Major).'
)
ON CONFLICT (key) DO NOTHING;
