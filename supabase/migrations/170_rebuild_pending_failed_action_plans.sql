-- Recalcule les actions préparées avant la correction de la migration 169.

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
