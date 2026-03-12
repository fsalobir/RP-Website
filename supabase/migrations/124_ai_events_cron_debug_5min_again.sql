-- Debug : exécuter le cron events IA toutes les 5 min.
DO $$
BEGIN
  PERFORM cron.unschedule('ai-events-generation');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'ai-events-generation',
  '*/5 * * * *',
  $$SELECT public.run_ai_events_cron()$$
);
