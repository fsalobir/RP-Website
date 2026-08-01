CREATE OR REPLACE FUNCTION public.ai_rotate_admin_worker(
  p_token_hash text,
  p_token_hint text,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR char_length(p_token_hint) <> 6 OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'Jeton de relais invalide.';
  END IF;

  UPDATE public.ai_admin_jobs
  SET status = 'queued', stage = 'file', worker_id = NULL, claimed_at = NULL
  WHERE worker_id IN (SELECT id FROM public.ai_admin_workers)
    AND status IN ('claimed', 'analyzing');

  DELETE FROM public.ai_admin_workers
  WHERE id IS NOT NULL;

  INSERT INTO public.ai_admin_workers (token_hash, token_hint, created_by)
  VALUES (p_token_hash, p_token_hint, p_created_by)
  RETURNING id INTO v_worker_id;

  RETURN v_worker_id;
END;
$$;
