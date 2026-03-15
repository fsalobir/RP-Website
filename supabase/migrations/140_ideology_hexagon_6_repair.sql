-- Réparation idempotente : si la migration 137 n'a pas été appliquée (ou a échoué),
-- les colonnes ideology_germanic_monarchy etc. n'existent pas → erreur 42703.
-- Cette migration ajoute les colonnes manquantes, migre les données si les anciennes existent, puis supprime les anciennes.

-- 1) Ajouter les 12 colonnes hexagone si elles n'existent pas
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

-- 2) Si les anciennes colonnes (triangle) existent encore, migrer les données puis les supprimer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'countries' AND column_name = 'ideology_monarchism'
  ) THEN
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

    ALTER TABLE public.countries
      DROP COLUMN IF EXISTS ideology_monarchism,
      DROP COLUMN IF EXISTS ideology_republicanism,
      DROP COLUMN IF EXISTS ideology_cultism,
      DROP COLUMN IF EXISTS ideology_drift_monarchism,
      DROP COLUMN IF EXISTS ideology_drift_republicanism,
      DROP COLUMN IF EXISTS ideology_drift_cultism;
  END IF;
END $$;

-- 3) Migrer les effect_kind dans country_effects (idempotent)
UPDATE public.country_effects SET effect_kind = 'ideology_drift_germanic_monarchy' WHERE effect_kind = 'ideology_drift_monarchism';
UPDATE public.country_effects SET effect_kind = 'ideology_drift_french_republicanism' WHERE effect_kind = 'ideology_drift_republicanism';
UPDATE public.country_effects SET effect_kind = 'ideology_drift_nilotique_cultism' WHERE effect_kind = 'ideology_drift_cultism';
UPDATE public.country_effects SET effect_kind = 'ideology_snap_germanic_monarchy' WHERE effect_kind = 'ideology_snap_monarchism';
UPDATE public.country_effects SET effect_kind = 'ideology_snap_french_republicanism' WHERE effect_kind = 'ideology_snap_republicanism';
UPDATE public.country_effects SET effect_kind = 'ideology_snap_nilotique_cultism' WHERE effect_kind = 'ideology_snap_cultism';

-- 4) Règle ideology_effects si absente
INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
SELECT
  'ideology_effects',
  '[]'::jsonb,
  'Effets appliqués à proportion du score par idéologie (valeur = effet à 100 % pour cette idéologie).',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.rule_parameters WHERE key = 'ideology_effects');
