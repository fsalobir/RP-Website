-- Donner des valeurs par défaut permettant la génération d'events IA (éviter 0 event à cause de config vide).
-- On ne modifie que les configs qui ont encore les valeurs « vides » (count 0 et listes vides).
UPDATE public.rule_parameters
SET value = value
  || '{
    "count_major_per_run": 1,
    "count_minor_per_run": 1,
    "allowed_action_type_keys_major": ["ouverture_diplomatique"],
    "allowed_action_type_keys_minor": ["ouverture_diplomatique"],
    "target_major_ai": true,
    "target_minor_ai": true
  }'::jsonb
WHERE key = 'ai_events_config'
  AND COALESCE((value->>'count_major_per_run')::int, 0) = 0
  AND COALESCE((value->>'count_minor_per_run')::int, 0) = 0
  AND COALESCE(jsonb_array_length(value->'allowed_action_type_keys_major'), 0) = 0
  AND COALESCE(jsonb_array_length(value->'allowed_action_type_keys_minor'), 0) = 0;
