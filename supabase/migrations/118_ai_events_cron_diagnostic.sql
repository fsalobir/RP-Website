-- Diagnostic pg_cron pour events IA : exposé en RPC pour l'admin (page Event IA).
-- Retourne extension activée, présence du job, dernières exécutions et last_run.
CREATE OR REPLACE FUNCTION public.get_ai_events_cron_diagnostic()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_pg_cron_enabled boolean;
  v_job_exists boolean := false;
  v_job_schedule text;
  v_job_command text;
  v_recent_runs jsonb;
  v_last_run text;
  v_error text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_pg_cron_enabled;

  IF NOT v_pg_cron_enabled THEN
    SELECT value #>> '{}' INTO v_last_run FROM public.rule_parameters WHERE key = 'ai_events_last_run' LIMIT 1;
    RETURN jsonb_build_object(
      'pg_cron_enabled', false,
      'hint', 'Activer l''extension pg_cron dans Supabase (Database → Extensions).',
      'last_run_value', v_last_run
    );
  END IF;

  BEGIN
    SELECT j.schedule::text, j.command::text
    INTO v_job_schedule, v_job_command
    FROM cron.job j
    WHERE j.jobname = 'ai-events-generation'
    LIMIT 1;
    v_job_exists := (v_job_schedule IS NOT NULL);
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;

  BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'start_time', d.start_time,
      'end_time', d.end_time,
      'status', d.status,
      'return_message', d.return_message
    )
  ) INTO v_recent_runs
  FROM (
    SELECT start_time, end_time, status, return_message
    FROM cron.job_run_details
    WHERE jobname = 'ai-events-generation'
    ORDER BY start_time DESC
    LIMIT 20
  ) d;
  EXCEPTION WHEN OTHERS THEN
    v_recent_runs := '[]'::jsonb;
    IF v_error IS NULL THEN v_error := SQLERRM; END IF;
  END;

  SELECT value #>> '{}' INTO v_last_run FROM public.rule_parameters WHERE key = 'ai_events_last_run' LIMIT 1;

  v_result := jsonb_build_object(
    'pg_cron_enabled', true,
    'job_exists', v_job_exists,
    'job_schedule', v_job_schedule,
    'job_command', v_job_command,
    'recent_runs', COALESCE(v_recent_runs, '[]'::jsonb),
    'last_run_value', v_last_run
  );
  IF v_error IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('error', v_error);
  END IF;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_ai_events_cron_diagnostic() IS 'Diagnostic pg_cron pour la page admin Event IA : extension, job ai-events-generation, dernières exécutions, last_run.';
