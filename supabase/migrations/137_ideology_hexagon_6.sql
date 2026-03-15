-- Idéologie : passage du triangle (3 pôles) à l'hexagone (6 idéologies).
-- Option propre : nouveaux noms de colonnes et effect_kind, migration complète, suppression des anciennes colonnes.

-- 1) Ajout des 6 colonnes score + 6 colonnes drift
ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS ideology_germanic_monarchy numeric(7,4) NOT NULL DEFAULT 16.6667,
  ADD COLUMN IF NOT EXISTS ideology_merina_monarchy numeric(7,4) NOT NULL DEFAULT 16.6667,
  ADD COLUMN IF NOT EXISTS ideology_french_republicanism numeric(7,4) NOT NULL DEFAULT 16.6667,
  ADD COLUMN IF NOT EXISTS ideology_mughal_republicanism numeric(7,4) NOT NULL DEFAULT 16.6667,
  ADD COLUMN IF NOT EXISTS ideology_nilotique_cultism numeric(7,4) NOT NULL DEFAULT 16.6667,
  ADD COLUMN IF NOT EXISTS ideology_satoiste_cultism numeric(7,4) NOT NULL DEFAULT 16.6667,
  ADD COLUMN IF NOT EXISTS ideology_drift_germanic_monarchy numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ideology_drift_merina_monarchy numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ideology_drift_french_republicanism numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ideology_drift_mughal_republicanism numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ideology_drift_nilotique_cultism numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ideology_drift_satoiste_cultism numeric(7,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.countries.ideology_germanic_monarchy IS 'Score idéologique Monarchisme Germanique (0-100, somme des 6 ≈ 100).';
COMMENT ON COLUMN public.countries.ideology_merina_monarchy IS 'Score idéologique Monarchisme Mérinais.';
COMMENT ON COLUMN public.countries.ideology_french_republicanism IS 'Score idéologique Républicanisme Français.';
COMMENT ON COLUMN public.countries.ideology_mughal_republicanism IS 'Score idéologique Républicanisme Moghol.';
COMMENT ON COLUMN public.countries.ideology_nilotique_cultism IS 'Score idéologique Cultisme Nilotique.';
COMMENT ON COLUMN public.countries.ideology_satoiste_cultism IS 'Score idéologique Cultisme Satoiste.';
COMMENT ON COLUMN public.countries.ideology_drift_germanic_monarchy IS 'Dernière dérive calculée vers Monarchisme Germanique.';
COMMENT ON COLUMN public.countries.ideology_drift_merina_monarchy IS 'Dernière dérive calculée vers Monarchisme Mérinais.';
COMMENT ON COLUMN public.countries.ideology_drift_french_republicanism IS 'Dernière dérive calculée vers Républicanisme Français.';
COMMENT ON COLUMN public.countries.ideology_drift_mughal_republicanism IS 'Dernière dérive calculée vers Républicanisme Moghol.';
COMMENT ON COLUMN public.countries.ideology_drift_nilotique_cultism IS 'Dernière dérive calculée vers Cultisme Nilotique.';
COMMENT ON COLUMN public.countries.ideology_drift_satoiste_cultism IS 'Dernière dérive calculée vers Cultisme Satoiste.';

-- 2) Migration des données : anciennes colonnes → nouvelles (3 mappées, 3 à 0), renormalisation si somme > 0
UPDATE public.countries
SET
  ideology_germanic_monarchy = CASE
    WHEN (ideology_monarchism + ideology_republicanism + ideology_cultism) > 0
    THEN (ideology_monarchism / (ideology_monarchism + ideology_republicanism + ideology_cultism)) * 100
    ELSE 16.6667
  END,
  ideology_merina_monarchy = CASE
    WHEN (ideology_monarchism + ideology_republicanism + ideology_cultism) > 0 THEN 0
    ELSE 16.6667
  END,
  ideology_french_republicanism = CASE
    WHEN (ideology_monarchism + ideology_republicanism + ideology_cultism) > 0
    THEN (ideology_republicanism / (ideology_monarchism + ideology_republicanism + ideology_cultism)) * 100
    ELSE 16.6667
  END,
  ideology_mughal_republicanism = CASE
    WHEN (ideology_monarchism + ideology_republicanism + ideology_cultism) > 0 THEN 0
    ELSE 16.6667
  END,
  ideology_nilotique_cultism = CASE
    WHEN (ideology_monarchism + ideology_republicanism + ideology_cultism) > 0
    THEN (ideology_cultism / (ideology_monarchism + ideology_republicanism + ideology_cultism)) * 100
    ELSE 16.6667
  END,
  ideology_satoiste_cultism = CASE
    WHEN (ideology_monarchism + ideology_republicanism + ideology_cultism) > 0 THEN 0
    ELSE 16.6667
  END,
  ideology_drift_germanic_monarchy = ideology_drift_monarchism,
  ideology_drift_merina_monarchy = 0,
  ideology_drift_french_republicanism = ideology_drift_republicanism,
  ideology_drift_mughal_republicanism = 0,
  ideology_drift_nilotique_cultism = ideology_drift_cultism,
  ideology_drift_satoiste_cultism = 0
WHERE ideology_monarchism IS NOT NULL AND ideology_republicanism IS NOT NULL AND ideology_cultism IS NOT NULL;

-- 3) Migration des effect_kind dans country_effects (anciens noms → nouveaux)
UPDATE public.country_effects SET effect_kind = 'ideology_drift_germanic_monarchy' WHERE effect_kind = 'ideology_drift_monarchism';
UPDATE public.country_effects SET effect_kind = 'ideology_drift_french_republicanism' WHERE effect_kind = 'ideology_drift_republicanism';
UPDATE public.country_effects SET effect_kind = 'ideology_drift_nilotique_cultism' WHERE effect_kind = 'ideology_drift_cultism';
UPDATE public.country_effects SET effect_kind = 'ideology_snap_germanic_monarchy' WHERE effect_kind = 'ideology_snap_monarchism';
UPDATE public.country_effects SET effect_kind = 'ideology_snap_french_republicanism' WHERE effect_kind = 'ideology_snap_republicanism';
UPDATE public.country_effects SET effect_kind = 'ideology_snap_nilotique_cultism' WHERE effect_kind = 'ideology_snap_cultism';

-- 4) Suppression des anciennes colonnes
ALTER TABLE public.countries
  DROP COLUMN IF EXISTS ideology_monarchism,
  DROP COLUMN IF EXISTS ideology_republicanism,
  DROP COLUMN IF EXISTS ideology_cultism,
  DROP COLUMN IF EXISTS ideology_drift_monarchism,
  DROP COLUMN IF EXISTS ideology_drift_republicanism,
  DROP COLUMN IF EXISTS ideology_drift_cultism;

-- 5) Règle ideology_effects (effets proportionnels au score par idéologie)
INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
SELECT
  'ideology_effects',
  '[]'::jsonb,
  'Effets appliqués à proportion du score par idéologie (valeur = effet à 100 % pour cette idéologie).',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.rule_parameters WHERE key = 'ideology_effects');
