-- Remettre le cron events IA à toutes les heures (fin du debug 5 min).
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
