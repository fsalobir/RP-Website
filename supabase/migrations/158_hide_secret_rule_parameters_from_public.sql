DROP POLICY IF EXISTS "Rule parameters: lecture publique" ON public.rule_parameters;

CREATE POLICY "Rule parameters: lecture publique"
  ON public.rule_parameters
  FOR SELECT
  USING (
    key NOT ILIKE '%secret%'
    OR (SELECT public.is_admin())
  );
