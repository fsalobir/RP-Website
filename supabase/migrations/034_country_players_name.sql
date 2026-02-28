-- Champ "Nom" pour l'affichage du joueur (liste des pays, admin).
ALTER TABLE public.country_players
  ADD COLUMN IF NOT EXISTS name text;

COMMENT ON COLUMN public.country_players.name IS 'Nom d''affichage du joueur (ex. kapkio), utilisé sur la fiche pays et dans l''admin.';
