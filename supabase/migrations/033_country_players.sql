-- Comptes Joueurs : un joueur est assigné à un seul pays et peut modifier ce pays (nom, régime, drapeau, budget).

CREATE TABLE public.country_players (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(country_id)
);

CREATE INDEX idx_country_players_country ON public.country_players(country_id);

COMMENT ON TABLE public.country_players IS 'Joueurs assignés à un pays : un joueur peut éditer uniquement son pays (nom, régime, drapeau, budget).';

CREATE OR REPLACE FUNCTION public.get_country_for_player(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT country_id FROM public.country_players WHERE user_id = p_user_id LIMIT 1;
$$;

ALTER TABLE public.country_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Country players: lecture et écriture admin"
  ON public.country_players FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Countries : autoriser UPDATE pour le joueur assigné à ce pays
DROP POLICY IF EXISTS "Countries: écriture admin" ON public.countries;
CREATE POLICY "Countries: écriture admin"
  ON public.countries FOR ALL
  USING (public.is_admin());
CREATE POLICY "Countries: écriture joueur assigné"
  ON public.countries FOR UPDATE
  USING (
    id IN (SELECT country_id FROM public.country_players WHERE user_id = auth.uid())
  )
  WITH CHECK (
    id IN (SELECT country_id FROM public.country_players WHERE user_id = auth.uid())
  );

-- Country budget : autoriser UPDATE/INSERT pour admin ou joueur assigné
DROP POLICY IF EXISTS "Country budget: écriture (joueur ou admin)" ON public.country_budget;
CREATE POLICY "Country budget: écriture admin"
  ON public.country_budget FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY "Country budget: écriture joueur assigné"
  ON public.country_budget FOR ALL
  USING (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = auth.uid())
  )
  WITH CHECK (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = auth.uid())
  );
