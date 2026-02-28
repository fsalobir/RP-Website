-- RLS performance: wrap auth.uid() and is_admin() in (select ...) so they are
-- evaluated once per query (InitPlan) instead of per row. Fixes auth_rls_initplan lint.

-- countries: écriture joueur assigné
DROP POLICY IF EXISTS "Countries: écriture joueur assigné" ON public.countries;
CREATE POLICY "Countries: écriture joueur assigné"
  ON public.countries FOR UPDATE
  USING (
    id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );

-- country_budget: écriture joueur assigné
DROP POLICY IF EXISTS "Country budget: écriture joueur assigné" ON public.country_budget;
CREATE POLICY "Country budget: écriture joueur assigné"
  ON public.country_budget FOR ALL
  USING (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );

-- country_players: lecture par le joueur (propre row)
DROP POLICY IF EXISTS "Country players: lecture par le joueur (propre row)" ON public.country_players;
CREATE POLICY "Country players: lecture par le joueur (propre row)"
  ON public.country_players FOR SELECT
  USING (user_id = (select auth.uid()));

-- country_mobilisation: écriture joueur assigné
DROP POLICY IF EXISTS "Country mobilisation: écriture joueur assigné" ON public.country_mobilisation;
CREATE POLICY "Country mobilisation: écriture joueur assigné"
  ON public.country_mobilisation FOR INSERT
  WITH CHECK (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );

-- country_mobilisation: update joueur assigné
DROP POLICY IF EXISTS "Country mobilisation: update joueur assigné" ON public.country_mobilisation;
CREATE POLICY "Country mobilisation: update joueur assigné"
  ON public.country_mobilisation FOR UPDATE
  USING (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );
