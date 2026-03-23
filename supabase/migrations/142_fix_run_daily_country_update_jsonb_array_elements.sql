-- Fix: run_daily_country_update() échoue avec "cannot extract elements from an object"
-- quand un CTE applique jsonb_array_elements(rp.value) sur des rule_parameters en objet.
-- On patch dynamiquement la définition existante pour rendre les 2 occurrences robustes.

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
    'LATERAL jsonb_array_elements(rp.value) AS e',
    'LATERAL jsonb_array_elements(COALESCE(CASE WHEN jsonb_typeof(rp.value) = ''array'' THEN rp.value ELSE rp.value->''value'' END, ''[]''::jsonb)) AS e'
  );

  IF patched_def = fn_def THEN
    RAISE NOTICE 'No patch applied: target snippet not found (already patched or different function body).';
  ELSE
    EXECUTE patched_def;
    RAISE NOTICE 'Patched public.run_daily_country_update() successfully.';
  END IF;
END
$$;
