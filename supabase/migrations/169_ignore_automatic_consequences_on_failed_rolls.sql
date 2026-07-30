-- Un échec D100 ne doit jamais produire le bénéfice automatique de l'action.
-- Les effets ajoutés explicitement par un MJ restent, eux, applicables.

ALTER FUNCTION public.build_rp_action_consequence_plan(uuid, integer)
  RENAME TO build_rp_action_consequence_plan_with_automatic_effect;

REVOKE ALL ON FUNCTION public.build_rp_action_consequence_plan_with_automatic_effect(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.build_rp_action_consequence_plan(
  p_action_id uuid,
  p_roll integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_key text;
  v_plan jsonb;
BEGIN
  PERFORM public.rp_d100_outcome(p_roll);
  v_plan := public.build_rp_action_consequence_plan_with_automatic_effect(
    p_action_id,
    p_roll
  );

  IF p_roll >= 50 THEN
    RETURN v_plan;
  END IF;

  SELECT action.world_snapshot #>> '{action,key}'
  INTO v_action_key
  FROM public.ai_event_requests action
  WHERE action.id = p_action_id;

  IF v_action_key IN (
    'insulte_diplomatique',
    'escarmouche_militaire',
    'conflit_arme',
    'guerre_ouverte',
    'ouverture_diplomatique',
    'prise_influence',
    'espionnage'
  ) AND jsonb_array_length(v_plan) > 0 THEN
    -- L'effet automatique est toujours la première opération ; les suivantes
    -- sont les conséquences libres ajoutées par le MJ.
    RETURN v_plan - 0;
  END IF;

  RETURN v_plan;
END;
$$;

REVOKE ALL ON FUNCTION public.build_rp_action_consequence_plan(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.build_rp_action_consequence_plan(uuid, integer) IS
  'Construit les conséquences atomiques ; un jet inférieur à 50 exclut seulement l''effet automatique.';
