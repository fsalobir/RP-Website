-- Règles globales de mobilisation : seuils des 5 paliers et pas quotidien.

INSERT INTO public.rule_parameters (key, value, description) VALUES
  (
    'mobilisation_config',
    '{
      "level_thresholds": {
        "demobilisation": 0,
        "reserve_active": 200,
        "mobilisation_partielle": 300,
        "mobilisation_generale": 400,
        "guerre_patriotique": 500
      },
      "daily_step": 20
    }'::jsonb,
    'Mobilisation : seuils par palier (0–500) et évolution quotidienne du score (points/jour).'
  ),
  (
    'mobilisation_level_effects',
    '[]'::jsonb,
    'Effets appliqués par palier de mobilisation (tableau d''objets level, effect_kind, effect_target, value).'
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;
