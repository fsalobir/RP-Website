-- Enregistrement des jobs pg_cron : passage de jour (6h UTC) et génération events IA (toutes les heures).
-- Prérequis : activer l'extension pg_cron dans Supabase (Database → Extensions) avant d'appliquer cette migration,
-- sinon la migration échouera. En cas d'échec, activer pg_cron puis relancer supabase db push.

DO $$
BEGIN
  PERFORM cron.unschedule('daily-country-update');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'daily-country-update',
  '0 6 * * *',
  $$SELECT public.run_daily_country_update()$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('ai-events-generation');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'ai-events-generation',
  '0 * * * *',
  $$SELECT public.run_ai_events_cron()$$
);
