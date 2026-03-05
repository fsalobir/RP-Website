-- Demandes d'up : permettre des pools de snippets distincts selon le type d'up (stat / tech / nombre / mixed).

ALTER TABLE public.discord_dispatch_snippet_pools
  ADD COLUMN IF NOT EXISTS up_kind text;

ALTER TABLE public.discord_dispatch_snippet_pools
  ADD CONSTRAINT discord_dispatch_snippet_pools_up_kind_check
  CHECK (up_kind IS NULL OR up_kind IN ('stat', 'tech', 'nombre', 'mixed'));

-- Ancienne contrainte d'unicité (avant up_kind)
ALTER TABLE public.discord_dispatch_snippet_pools
  DROP CONSTRAINT IF EXISTS discord_dispatch_snippet_pools_state_action_type_id_outcome_dice_result_slot_key;

-- Nouvelle unicité (NULL traité comme valeur) : 1 ligne max par (type, outcome, dice_result, slot, up_kind)
CREATE UNIQUE INDEX IF NOT EXISTS uq_discord_snippet_pools_lookup
  ON public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, COALESCE(up_kind, ''));

-- Index de lookup (optionnel mais utile)
CREATE INDEX IF NOT EXISTS idx_discord_snippet_pools_lookup_up_kind
  ON public.discord_dispatch_snippet_pools (state_action_type_id, outcome, dice_result, slot, up_kind);

