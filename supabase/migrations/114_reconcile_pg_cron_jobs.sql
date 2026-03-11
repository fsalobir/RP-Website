-- Réconcilier les jobs pg_cron côté Supabase.
-- Objectif : garantir que les jobs automatiques existent avec le bon schedule.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'Extension pg_cron non activée. Active-la dans Supabase (Database -> Extensions) puis relance la migration.';
  END IF;
END
$$;

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

