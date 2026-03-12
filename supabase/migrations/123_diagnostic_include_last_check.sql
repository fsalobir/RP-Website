-- Inclure ai_events_cron_last_check dans le diagnostic (pourquoi la fonction a skip ou run).
CREATE OR REPLACE FUNCTION public.get_ai_events_cron_diagnostic()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_last_check jsonb;
  v_pg_cron_enabled boolean;
  v_job_exists boolean := false;
  v_job_id bigint;
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
    SELECT j.jobid, j.schedule::text, j.command::text
    INTO v_job_id, v_job_schedule, v_job_command
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
      SELECT rd.start_time, rd.end_time, rd.status, rd.return_message
      FROM cron.job_run_details rd
      WHERE rd.jobid = v_job_id
      ORDER BY rd.start_time DESC
      LIMIT 20
    ) d;
  EXCEPTION WHEN OTHERS THEN
    v_recent_runs := '[]'::jsonb;
    IF v_error IS NULL THEN v_error := SQLERRM; END IF;
  END;

  SELECT value #>> '{}' INTO v_last_run FROM public.rule_parameters WHERE key = 'ai_events_last_run' LIMIT 1;
  SELECT value INTO v_last_check FROM public.rule_parameters WHERE key = 'ai_events_cron_last_check' LIMIT 1;

  v_result := jsonb_build_object(
    'pg_cron_enabled', true,
    'job_exists', v_job_exists,
    'job_schedule', v_job_schedule,
    'job_command', v_job_command,
    'recent_runs', COALESCE(v_recent_runs, '[]'::jsonb),
    'last_run_value', v_last_run,
    'last_check', COALESCE(v_last_check, 'null'::jsonb)
  );
  IF v_error IS NOT NULL THEN
    v_result := v_result || jsonb_build_object('error', v_error);
  END IF;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_ai_events_cron_diagnostic() IS 'Diagnostic pg_cron + last_check (pourquoi skip/run).';
