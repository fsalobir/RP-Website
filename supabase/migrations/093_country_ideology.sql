-- Idéologie : triangle Monarchisme / Républicanisme / Cultisme.
-- Les valeurs stockées représentent la position persistée du pays dans le triangle.

ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS ideology_monarchism numeric(7,4) NOT NULL DEFAULT 33.3333,
  ADD COLUMN IF NOT EXISTS ideology_republicanism numeric(7,4) NOT NULL DEFAULT 33.3333,
  ADD COLUMN IF NOT EXISTS ideology_cultism numeric(7,4) NOT NULL DEFAULT 33.3334,
  ADD COLUMN IF NOT EXISTS ideology_drift_monarchism numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ideology_drift_republicanism numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ideology_drift_cultism numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ideology_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.countries.ideology_monarchism IS 'Score idéologique Monarchisme (0-100, somme des 3 pôles ≈ 100).';
COMMENT ON COLUMN public.countries.ideology_republicanism IS 'Score idéologique Républicanisme (0-100, somme des 3 pôles ≈ 100).';
COMMENT ON COLUMN public.countries.ideology_cultism IS 'Score idéologique Cultisme (0-100, somme des 3 pôles ≈ 100).';
COMMENT ON COLUMN public.countries.ideology_drift_monarchism IS 'Dernière dérive calculée vers Monarchisme.';
COMMENT ON COLUMN public.countries.ideology_drift_republicanism IS 'Dernière dérive calculée vers Républicanisme.';
COMMENT ON COLUMN public.countries.ideology_drift_cultism IS 'Dernière dérive calculée vers Cultisme.';
COMMENT ON COLUMN public.countries.ideology_breakdown IS 'Résumé JSON du dernier calcul idéologique (base, voisins, relations, contrôle, effets, idéologie dominante).';

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
SELECT
  'ideology_config',
  '{
    "daily_step": 0.18,
    "base_pull_weight": 0.9,
    "neighbor_pull_weight": 0.8,
    "relation_pull_weight": 0.35,
    "influence_pull_weight": 0.45,
    "control_pull_weight": 1.1,
    "effect_pull_weight": 1.0,
    "snap_strength": 16,
    "weights": {
      "monarchism_from_stability": 1.15,
      "monarchism_from_militarism": 0.75,
      "republicanism_from_science": 1.10,
      "republicanism_from_stability": 0.75,
      "republicanism_from_industry": 0.55,
      "cultism_from_instability": 1.20,
      "cultism_from_low_science": 0.85,
      "cultism_from_militarism": 0.30
    }
  }'::jsonb,
  'Configuration de la dérive idéologique : coefficients de lissage, poids de base, voisinage, relations, influence, contrôle et effets.',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.rule_parameters WHERE key = 'ideology_config'
);
