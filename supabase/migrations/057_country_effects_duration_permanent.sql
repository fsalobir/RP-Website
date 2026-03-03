-- Autoriser duration_kind = 'permanent' pour les effets qui n'expirent jamais.
-- Le cron ne décrémente ni ne supprime les effets permanents.

ALTER TABLE public.country_effects
  DROP CONSTRAINT IF EXISTS country_effects_duration_kind_check;

ALTER TABLE public.country_effects
  ADD CONSTRAINT country_effects_duration_kind_check
  CHECK (duration_kind IN ('days', 'updates', 'permanent'));

COMMENT ON COLUMN public.country_effects.duration_kind IS 'days = durée en jours, updates = en mises à jour, permanent = n''expire jamais (cron ne décrémente pas).';
