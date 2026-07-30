-- Barrière de lancement : cette transaction doit être validée avant la reconstruction 160.
DO $$
BEGIN
  PERFORM cron.unschedule('ai-events-generation');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-ai-events-due-edge');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
VALUES (
  'process_due_edge_enabled',
  'false'::jsonb,
  'Ancien processeur Edge suspendu avant la migration Magnum.',
  now(),
  now()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
VALUES (
  'legacy_rp_pipeline_suspended_at',
  to_jsonb(clock_timestamp()),
  'Horodatage immuable de la coupure servant de barrière de quiescence.',
  now(),
  now()
)
ON CONFLICT (key) DO NOTHING;
