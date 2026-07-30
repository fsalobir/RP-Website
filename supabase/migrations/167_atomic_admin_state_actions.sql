-- Évite qu'un crédit d'actions d'État soit perdu lorsque deux admins
-- interviennent au même moment sur le même pays.

CREATE OR REPLACE FUNCTION public.admin_add_state_actions(
  p_country_id uuid,
  p_amount integer DEFAULT 25
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux admins.';
  END IF;

  IF p_amount <= 0 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'Montant invalide.';
  END IF;

  INSERT INTO public.country_state_action_balance (country_id, balance)
  VALUES (p_country_id, p_amount)
  ON CONFLICT (country_id) DO UPDATE
  SET balance = public.country_state_action_balance.balance + EXCLUDED.balance
  RETURNING balance INTO v_balance;

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_state_actions(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_state_actions(uuid, integer) TO authenticated;
