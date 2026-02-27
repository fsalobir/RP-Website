-- RLS : WITH CHECK obligatoire pour que les INSERT soient restreints aux admins.
-- En PostgreSQL, USING seul ne s'applique pas aux INSERT ; il faut WITH CHECK.

DROP POLICY IF EXISTS "Country effects: écriture admin" ON public.country_effects;

CREATE POLICY "Country effects: écriture admin"
  ON public.country_effects
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
