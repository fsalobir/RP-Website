-- RLS performance: one permissive policy per (table, role, action). Fixes multiple_permissive_policies lint.
-- Use (select auth.uid()) and (select public.is_admin()) for InitPlan.

-- ========== Tables "lecture publique + écriture admin" only ==========
-- Replace FOR ALL "écriture admin" with FOR INSERT, UPDATE, DELETE so SELECT has only "lecture publique".

-- country_effects
DROP POLICY IF EXISTS "Country effects: écriture admin" ON public.country_effects;
CREATE POLICY "Country effects: écriture admin insert"
  ON public.country_effects FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country effects: écriture admin update"
  ON public.country_effects FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country effects: écriture admin delete"
  ON public.country_effects FOR DELETE USING ((select public.is_admin()));

-- country_history
DROP POLICY IF EXISTS "Country history: écriture admin" ON public.country_history;
CREATE POLICY "Country history: écriture admin insert"
  ON public.country_history FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country history: écriture admin update"
  ON public.country_history FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country history: écriture admin delete"
  ON public.country_history FOR DELETE USING ((select public.is_admin()));

-- country_macros
DROP POLICY IF EXISTS "Country macros: écriture admin" ON public.country_macros;
CREATE POLICY "Country macros: écriture admin insert"
  ON public.country_macros FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country macros: écriture admin update"
  ON public.country_macros FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country macros: écriture admin delete"
  ON public.country_macros FOR DELETE USING ((select public.is_admin()));

-- country_military_limits
DROP POLICY IF EXISTS "Country military: écriture admin" ON public.country_military_limits;
CREATE POLICY "Country military: écriture admin insert"
  ON public.country_military_limits FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country military: écriture admin update"
  ON public.country_military_limits FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country military: écriture admin delete"
  ON public.country_military_limits FOR DELETE USING ((select public.is_admin()));

-- country_military_units
DROP POLICY IF EXISTS "Country military units: écriture admin" ON public.country_military_units;
CREATE POLICY "Country military units: écriture admin insert"
  ON public.country_military_units FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country military units: écriture admin update"
  ON public.country_military_units FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country military units: écriture admin delete"
  ON public.country_military_units FOR DELETE USING ((select public.is_admin()));

-- country_perks
DROP POLICY IF EXISTS "Country perks: écriture admin" ON public.country_perks;
CREATE POLICY "Country perks: écriture admin insert"
  ON public.country_perks FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country perks: écriture admin update"
  ON public.country_perks FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country perks: écriture admin delete"
  ON public.country_perks FOR DELETE USING ((select public.is_admin()));

-- military_roster_unit_levels
DROP POLICY IF EXISTS "Military roster unit levels: écriture admin" ON public.military_roster_unit_levels;
CREATE POLICY "Military roster unit levels: écriture admin insert"
  ON public.military_roster_unit_levels FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Military roster unit levels: écriture admin update"
  ON public.military_roster_unit_levels FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Military roster unit levels: écriture admin delete"
  ON public.military_roster_unit_levels FOR DELETE USING ((select public.is_admin()));

-- military_roster_units
DROP POLICY IF EXISTS "Military roster units: écriture admin" ON public.military_roster_units;
CREATE POLICY "Military roster units: écriture admin insert"
  ON public.military_roster_units FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Military roster units: écriture admin update"
  ON public.military_roster_units FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Military roster units: écriture admin delete"
  ON public.military_roster_units FOR DELETE USING ((select public.is_admin()));

-- military_unit_types
DROP POLICY IF EXISTS "Military unit types: écriture admin" ON public.military_unit_types;
CREATE POLICY "Military unit types: écriture admin insert"
  ON public.military_unit_types FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Military unit types: écriture admin update"
  ON public.military_unit_types FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Military unit types: écriture admin delete"
  ON public.military_unit_types FOR DELETE USING ((select public.is_admin()));

-- perks
DROP POLICY IF EXISTS "Perks: écriture admin" ON public.perks;
CREATE POLICY "Perks: écriture admin insert"
  ON public.perks FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Perks: écriture admin update"
  ON public.perks FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Perks: écriture admin delete"
  ON public.perks FOR DELETE USING ((select public.is_admin()));

-- rule_parameters
DROP POLICY IF EXISTS "Rule parameters: écriture admin" ON public.rule_parameters;
CREATE POLICY "Rule parameters: écriture admin insert"
  ON public.rule_parameters FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Rule parameters: écriture admin update"
  ON public.rule_parameters FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Rule parameters: écriture admin delete"
  ON public.rule_parameters FOR DELETE USING ((select public.is_admin()));

-- ========== countries: one SELECT (lecture publique), one UPDATE (admin OR player), one INSERT, one DELETE (admin) ==========
DROP POLICY IF EXISTS "Countries: écriture admin" ON public.countries;
DROP POLICY IF EXISTS "Countries: écriture joueur assigné" ON public.countries;
CREATE POLICY "Countries: écriture update"
  ON public.countries FOR UPDATE
  USING (
    (select public.is_admin())
    OR id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    (select public.is_admin())
    OR id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );
CREATE POLICY "Countries: écriture admin insert"
  ON public.countries FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Countries: écriture admin delete"
  ON public.countries FOR DELETE USING ((select public.is_admin()));

-- ========== country_budget: one SELECT (lecture publique), one policy per INSERT/UPDATE/DELETE (admin OR player) ==========
DROP POLICY IF EXISTS "Country budget: écriture admin" ON public.country_budget;
DROP POLICY IF EXISTS "Country budget: écriture joueur assigné" ON public.country_budget;
CREATE POLICY "Country budget: écriture insert"
  ON public.country_budget FOR INSERT
  WITH CHECK (
    (select public.is_admin())
    OR country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );
CREATE POLICY "Country budget: écriture update"
  ON public.country_budget FOR UPDATE
  USING (
    (select public.is_admin())
    OR country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    (select public.is_admin())
    OR country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );
CREATE POLICY "Country budget: écriture delete"
  ON public.country_budget FOR DELETE
  USING (
    (select public.is_admin())
    OR country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );

-- ========== country_players: one SELECT (admin OR own row), one policy per INSERT/UPDATE/DELETE (admin) ==========
DROP POLICY IF EXISTS "Country players: lecture et écriture admin" ON public.country_players;
DROP POLICY IF EXISTS "Country players: lecture par le joueur (propre row)" ON public.country_players;
CREATE POLICY "Country players: lecture"
  ON public.country_players FOR SELECT
  USING ((select public.is_admin()) OR user_id = (select auth.uid()));
CREATE POLICY "Country players: écriture admin insert"
  ON public.country_players FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country players: écriture admin update"
  ON public.country_players FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country players: écriture admin delete"
  ON public.country_players FOR DELETE USING ((select public.is_admin()));

-- ========== country_mobilisation: one SELECT (lecture publique), one INSERT (admin OR player), one UPDATE (admin OR player), one DELETE (admin) ==========
DROP POLICY IF EXISTS "Country mobilisation: écriture admin" ON public.country_mobilisation;
DROP POLICY IF EXISTS "Country mobilisation: écriture joueur assigné" ON public.country_mobilisation;
DROP POLICY IF EXISTS "Country mobilisation: update joueur assigné" ON public.country_mobilisation;
CREATE POLICY "Country mobilisation: insert"
  ON public.country_mobilisation FOR INSERT
  WITH CHECK (
    (select public.is_admin())
    OR country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );
CREATE POLICY "Country mobilisation: update"
  ON public.country_mobilisation FOR UPDATE
  USING (
    (select public.is_admin())
    OR country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    (select public.is_admin())
    OR country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );
CREATE POLICY "Country mobilisation: delete admin"
  ON public.country_mobilisation FOR DELETE
  USING ((select public.is_admin()));
