-- Préparation pour les pings Discord : lier un joueur à son compte Discord.
ALTER TABLE public.country_players
  ADD COLUMN IF NOT EXISTS discord_user_id text;

COMMENT ON COLUMN public.country_players.discord_user_id IS 'ID utilisateur Discord (snowflake) pour pouvoir ping le joueur dans les messages du bot. Renseigné par l''admin ou une future commande "lier mon Discord".';
