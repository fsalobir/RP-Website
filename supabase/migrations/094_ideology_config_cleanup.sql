-- Nettoyage de la configuration idéologique après suppression du socle interne.

UPDATE public.rule_parameters
SET
  value = jsonb_build_object(
    'daily_step', COALESCE((value->>'daily_step')::numeric, 0.18),
    'neighbor_pull_weight', COALESCE((value->>'neighbor_pull_weight')::numeric, 0.8),
    'relation_pull_weight', COALESCE((value->>'relation_pull_weight')::numeric, 0.35),
    'influence_pull_weight', COALESCE((value->>'influence_pull_weight')::numeric, 0.45),
    'control_pull_weight', COALESCE((value->>'control_pull_weight')::numeric, 1.1),
    'effect_pull_weight', COALESCE((value->>'effect_pull_weight')::numeric, 1.0),
    'snap_strength', COALESCE((value->>'snap_strength')::numeric, 16)
  ),
  description = 'Configuration de la dérive idéologique : lissage, voisinage, relations, influence, contrôle et effets administratifs.',
  updated_at = now()
WHERE key = 'ideology_config';

COMMENT ON COLUMN public.countries.ideology_breakdown IS 'Résumé JSON du dernier calcul idéologique (voisins, contrôle, effets et idéologie dominante).';
