-- RLS country_intel : les joueurs pouvaient SELECT leurs lignes mais pas INSERT/UPDATE (upsert test + futurs flux joueur).

CREATE POLICY "country_intel_player_insert_own_observer"
  ON public.country_intel
  FOR INSERT
  WITH CHECK (
    observer_country_id IN (
      SELECT cp.country_id FROM public.country_players cp WHERE cp.user_id = auth.uid()
    )
    AND observer_country_id <> target_country_id
  );

CREATE POLICY "country_intel_player_update_own_observer"
  ON public.country_intel
  FOR UPDATE
  USING (
    observer_country_id IN (
      SELECT cp.country_id FROM public.country_players cp WHERE cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    observer_country_id IN (
      SELECT cp.country_id FROM public.country_players cp WHERE cp.user_id = auth.uid()
    )
    AND observer_country_id <> target_country_id
  );

COMMENT ON POLICY "country_intel_player_insert_own_observer" ON public.country_intel IS
  'Le joueur peut créer une ligne d intel uniquement si observer = son pays assigné et la cible est un autre pays.';
COMMENT ON POLICY "country_intel_player_update_own_observer" ON public.country_intel IS
  'Le joueur peut mettre à jour ses propres lignes d intel (même contrainte observateur / cible).';
