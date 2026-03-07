-- Corriger la comparaison uuid <> text dans apply_relation_delta_effects (effect_target est text).

CREATE OR REPLACE FUNCTION public.apply_relation_delta_effects()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_a uuid;
  v_b uuid;
  v_current smallint;
  v_new smallint;
BEGIN
  FOR r IN
    SELECT ce.country_id, ce.effect_target, ce.value
    FROM public.country_effects ce
    WHERE ce.effect_kind = 'relation_delta'
      AND (ce.duration_kind = 'permanent' OR ce.duration_remaining > 0)
      AND ce.effect_target IS NOT NULL
      AND ce.country_id <> (ce.effect_target)::uuid
  LOOP
    v_a := LEAST(r.country_id, (r.effect_target)::uuid);
    v_b := GREATEST(r.country_id, (r.effect_target)::uuid);

    SELECT COALESCE(cr.value, 0) INTO v_current
    FROM public.country_relations cr
    WHERE cr.country_a_id = v_a AND cr.country_b_id = v_b;

    v_new := GREATEST(-100, LEAST(100, COALESCE(v_current, 0) + (r.value::numeric)::integer));

    INSERT INTO public.country_relations (country_a_id, country_b_id, value, updated_at)
    VALUES (v_a, v_b, v_new, now())
    ON CONFLICT (country_a_id, country_b_id)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.apply_relation_delta_effects() IS
  'Applique les effets relation_delta actifs : pour chaque effet (pays A, pays B, delta), met à jour la relation bilatérale (clamp -100 à +100). Appelé par run_daily_country_update.';
