-- Permettre à un joueur de lire sa propre ligne (pour afficher "Connecté : nom" dans le header).
CREATE POLICY "Country players: lecture par le joueur (propre row)"
  ON public.country_players FOR SELECT
  USING (user_id = auth.uid());
