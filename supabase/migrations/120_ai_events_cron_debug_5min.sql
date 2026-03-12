-- DEBUG : exécuter le cron events IA toutes les 5 min au lieu de toutes les heures.
-- À REVERTER après debug : remplacer '*/5 * * * *' par '0 * * * *' et repousser (ou migration dédiée).
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
