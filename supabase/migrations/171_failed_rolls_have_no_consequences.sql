-- Règle publiée : un jet raté ne produit strictement aucun effet,
-- y compris un effet ajouté après coup par un MJ.

CREATE OR REPLACE FUNCTION public.build_rp_action_consequence_plan(
  p_action_id uuid,
  p_roll integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.rp_d100_outcome(p_roll);
  IF p_roll < 50 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN public.build_rp_action_consequence_plan_with_automatic_effect(
    p_action_id,
    p_roll
  );
END;
$$;

REVOKE ALL ON FUNCTION public.build_rp_action_consequence_plan(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.build_rp_action_consequence_plan(uuid, integer) IS
  'Construit les conséquences atomiques ; un jet inférieur à 50 ne produit strictement aucun effet.';

UPDATE public.ai_event_requests action
SET consequence_plan = public.build_rp_action_consequence_plan(action.id, action.d100_roll)
WHERE action.consequences_applied_at IS NULL
  AND action.d100_roll BETWEEN 1 AND 49;

UPDATE public.ai_event_requests action
SET pending_consequence_plan = public.build_rp_action_consequence_plan(
  action.id,
  (action.pending_dice_results #>> '{success_roll,total}')::integer
)
WHERE action.pending_execution_version IS NOT NULL
  AND (action.pending_dice_results #>> '{success_roll,total}')::integer BETWEEN 1 AND 49;
