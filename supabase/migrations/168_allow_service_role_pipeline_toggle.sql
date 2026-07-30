CREATE OR REPLACE FUNCTION public.set_rp_pipeline_enabled(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_admin()
    OR COALESCE((SELECT auth.jwt())->>'role', '') = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Accès administrateur requis.';
  END IF;

  UPDATE public.rule_parameters
  SET
    value = COALESCE(value, '{}'::jsonb)
      || jsonb_build_object('enabled', p_enabled),
    updated_at = now()
  WHERE key = 'rp_pipeline_config';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuration du pipeline absente.';
  END IF;
END;
$$;
