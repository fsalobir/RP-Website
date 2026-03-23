-- Fix: run_daily_country_update() peut échouer avec "UPDATE requires a WHERE clause"
-- quand pg-safeupdate est actif. On ajoute un WHERE explicite sur les UPDATE globaux
-- de country_intel (modes flat/pct).

DO $$
DECLARE
  fn_def text;
  patched_def text;
BEGIN
  SELECT pg_get_functiondef('public.run_daily_country_update()'::regprocedure)
  INTO fn_def;

  IF fn_def IS NULL THEN
    RAISE EXCEPTION 'Function public.run_daily_country_update() not found';
  END IF;

  patched_def := replace(
    fn_def,
    'UPDATE public.country_intel
    SET intel_level = GREATEST(0, intel_level - v_decay_flat),
        display_seed = (random() * 2147483647)::int,
        updated_at = now();',
    'UPDATE public.country_intel
    SET intel_level = GREATEST(0, intel_level - v_decay_flat),
        display_seed = (random() * 2147483647)::int,
        updated_at = now()
    WHERE true;'
  );

  patched_def := replace(
    patched_def,
    'UPDATE public.country_intel
    SET intel_level = GREATEST(0, intel_level - intel_level * v_decay_pct / 100.0),
        display_seed = (random() * 2147483647)::int,
        updated_at = now();',
    'UPDATE public.country_intel
    SET intel_level = GREATEST(0, intel_level - intel_level * v_decay_pct / 100.0),
        display_seed = (random() * 2147483647)::int,
        updated_at = now()
    WHERE true;'
  );

  IF patched_def = fn_def THEN
    RAISE NOTICE 'No safeupdate patch applied: target snippets not found (already patched or different function body).';
  ELSE
    EXECUTE patched_def;
    RAISE NOTICE 'Patched safeupdate clauses in public.run_daily_country_update().';
  END IF;
END
$$;
