-- Process due IA en Supabase-only:
-- - planifie un appel pg_cron toutes les 10 minutes vers la Edge Function process-ai-events-due
-- - utilise un secret dédié en header x-process-secret
-- - la function reste contrôlée par PROCESS_DUE_EDGE_ENABLED (kill switch env)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'Extension pg_cron non activée.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  END IF;
END
$$;

-- Secret d'appel edge (créé une fois si absent)
INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
SELECT
  'process_due_edge_secret',
  to_jsonb(gen_random_uuid()::text),
  'Secret HTTP pour appeler la Edge Function process-ai-events-due depuis pg_cron.',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.rule_parameters WHERE key = 'process_due_edge_secret'
);

CREATE OR REPLACE FUNCTION public.invoke_process_ai_events_due_edge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url text;
  v_url text;
  v_secret text;
  v_req_id bigint;
BEGIN
  v_base_url := current_setting('app.settings.supabase_url', true);
  IF v_base_url IS NULL OR v_base_url = '' THEN
    RAISE NOTICE 'app.settings.supabase_url manquant; process due edge non appelé.';
    RETURN;
  END IF;

  SELECT value #>> '{}' INTO v_secret
  FROM public.rule_parameters
  WHERE key = 'process_due_edge_secret'
  LIMIT 1;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE NOTICE 'process_due_edge_secret manquant; process due edge non appelé.';
    RETURN;
  END IF;

  v_url := v_base_url || '/functions/v1/process-ai-events-due';

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-process-secret', v_secret
    ),
    body := '{}'::jsonb
  ) INTO v_req_id;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-ai-events-due-edge');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'process-ai-events-due-edge',
  '*/10 * * * *',
  $$SELECT public.invoke_process_ai_events_due_edge()$$
);

COMMENT ON FUNCTION public.invoke_process_ai_events_due_edge() IS
  'Appelle la Edge Function process-ai-events-due via pg_net. Le traitement effectif dépend du kill switch env PROCESS_DUE_EDGE_ENABLED.';
