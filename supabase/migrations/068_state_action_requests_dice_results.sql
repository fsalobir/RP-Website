-- Colonne pour stocker les résultats des jets de dés (d100) sur les demandes (ex. insulte diplomatique).

ALTER TABLE public.state_action_requests
  ADD COLUMN IF NOT EXISTS dice_results jsonb DEFAULT NULL;

COMMENT ON COLUMN public.state_action_requests.dice_results IS 'Résultats des jets de dés (succès, impact, modificateurs admin). Structure: { success_roll?, impact_roll?, admin_modifiers? }.';
