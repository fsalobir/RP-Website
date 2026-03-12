-- S'assurer que le job pg_cron de génération des events IA existe (recréation si absent ou corrompu).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'Extension pg_cron non activée. Active-la dans Supabase (Database -> Extensions) puis relance.';
  END IF;
END
$$;

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
