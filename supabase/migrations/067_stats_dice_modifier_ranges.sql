-- Modificateurs min/max par stat pour les jets de dés (d100). Utilisé pour calculer le bonus/malus proportionnel à la valeur de la stat.

INSERT INTO public.rule_parameters (key, value, description) VALUES
  (
    'stats_dice_modifier_ranges',
    '{
      "militarism": { "min": -10, "max": 20 },
      "industry": { "min": -10, "max": 20 },
      "science": { "min": -10, "max": 20 },
      "stability": { "min": -10, "max": 20 }
    }'::jsonb,
    'Statistiques : magnitude min/max du modificateur de jet de dés par stat (ex. -10 à +20). Assigné proportionnellement à la valeur de la stat.'
  )
ON CONFLICT (key) DO NOTHING;
