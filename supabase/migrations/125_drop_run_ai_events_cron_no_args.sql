-- Supprimer l'ancienne surcharge sans paramètre pour que l'appel run_ai_events_cron()
-- cible uniquement run_ai_events_cron(p_force boolean DEFAULT false).
DROP FUNCTION IF EXISTS public.run_ai_events_cron();
