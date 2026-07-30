-- Les commandes EXECUTE ne modifient pas FOUND en PL/pgSQL.
-- Transporter explicitement un booléen de présence évite les faux « pays introuvable ».

CREATE OR REPLACE FUNCTION public._rp_apply_consequence_operation(p_operation jsonb)
RETURNS TABLE (
  operation_kind text,
  target_table text,
  target_key jsonb,
  before_state jsonb,
  after_state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := p_operation->>'kind';
  v_country_id uuid;
  v_target_country_id uuid;
  v_roster_unit_id uuid;
  v_country_a_id uuid;
  v_country_b_id uuid;
  v_effect_id uuid;
  v_column text;
  v_existed boolean;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_actual_delta numeric;
  v_before_level integer;
  v_before_extra integer;
  v_after_level integer;
  v_after_extra integer;
  v_level_delta integer;
  v_extra_delta integer;
  v_level_max integer;
  v_before_seed integer;
  v_after_seed integer;
  v_min numeric;
  v_max numeric;
  v_before_json jsonb;
  v_after_json jsonb;
  v_effect jsonb;
BEGIN
  IF jsonb_typeof(p_operation) <> 'object' THEN
    RAISE EXCEPTION 'Chaque conséquence doit être un objet JSON.';
  END IF;

  IF v_kind = 'relation_delta' THEN
    v_country_id := (p_operation->>'country_id')::uuid;
    v_target_country_id := (p_operation->>'target_country_id')::uuid;
    IF v_country_id = v_target_country_id THEN
      RAISE EXCEPTION 'Une relation ne peut pas cibler le même pays.';
    END IF;
    IF v_country_id < v_target_country_id THEN
      v_country_a_id := v_country_id;
      v_country_b_id := v_target_country_id;
    ELSE
      v_country_a_id := v_target_country_id;
      v_country_b_id := v_country_id;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:relation:' || v_country_a_id || ':' || v_country_b_id,
      0
    ));
    v_delta := COALESCE((p_operation->>'delta')::numeric, 0);
    SELECT value INTO v_before
    FROM public.country_relations
    WHERE country_a_id = v_country_a_id AND country_b_id = v_country_b_id
    FOR UPDATE;
    v_existed := FOUND;
    v_before := COALESCE(v_before, 0);
    v_after := GREATEST(-100, LEAST(100, round(v_before + v_delta)));
    v_actual_delta := v_after - v_before;

    INSERT INTO public.country_relations (country_a_id, country_b_id, value, updated_at)
    VALUES (v_country_a_id, v_country_b_id, v_after::smallint, now())
    ON CONFLICT (country_a_id, country_b_id)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    operation_kind := v_kind;
    target_table := 'country_relations';
    target_key := jsonb_build_object('country_a_id', v_country_a_id, 'country_b_id', v_country_b_id);
    before_state := jsonb_build_object('exists', v_existed, 'value', v_before);
    after_state := jsonb_build_object('value', v_after, 'applied_delta', v_actual_delta);
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'control_delta' THEN
    v_country_id := (p_operation->>'country_id')::uuid;
    v_target_country_id := (p_operation->>'controller_country_id')::uuid;
    IF v_country_id = v_target_country_id THEN
      RAISE EXCEPTION 'Un pays ne peut pas se contrôler lui-même.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:control:' || v_country_id || ':' || v_target_country_id,
      0
    ));
    v_delta := COALESCE((p_operation->>'delta')::numeric, 0);

    SELECT share_pct INTO v_before
    FROM public.country_control
    WHERE country_id = v_country_id AND controller_country_id = v_target_country_id
    FOR UPDATE;
    v_existed := FOUND;
    v_before := COALESCE(v_before, 0);
    v_after := GREATEST(0, LEAST(100, v_before + v_delta));
    v_actual_delta := v_after - v_before;

    INSERT INTO public.country_control (
      country_id, controller_country_id, share_pct, is_annexed, updated_at
    ) VALUES (
      v_country_id, v_target_country_id, v_after, false, now()
    )
    ON CONFLICT (country_id, controller_country_id)
    DO UPDATE SET share_pct = EXCLUDED.share_pct, updated_at = now();

    operation_kind := v_kind;
    target_table := 'country_control';
    target_key := jsonb_build_object(
      'country_id', v_country_id,
      'controller_country_id', v_target_country_id
    );
    before_state := jsonb_build_object('exists', v_existed, 'share_pct', v_before);
    after_state := jsonb_build_object('share_pct', v_after, 'applied_delta', v_actual_delta);
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'country_delta' THEN
    v_country_id := (p_operation->>'country_id')::uuid;
    v_column := p_operation->>'column';
    IF v_column NOT IN (
      'militarism', 'industry', 'science', 'stability',
      'ideology_germanic_monarchy', 'ideology_merina_monarchy',
      'ideology_french_republicanism', 'ideology_mughal_republicanism',
      'ideology_nilotique_cultism', 'ideology_satoiste_cultism'
    ) THEN
      RAISE EXCEPTION 'Colonne pays non autorisée : %', v_column;
    END IF;

    v_delta := COALESCE((p_operation->>'delta')::numeric, 0);
    IF v_column = 'stability' THEN
      v_min := -3; v_max := 3;
    ELSIF v_column IN ('militarism', 'industry', 'science') THEN
      v_min := 0; v_max := 10;
    ELSE
      v_min := 0; v_max := 100;
    END IF;

    v_existed := false;
    EXECUTE format(
      'SELECT %I::numeric, true FROM public.countries WHERE id = $1 FOR UPDATE',
      v_column
    ) INTO v_before, v_existed USING v_country_id;
    IF NOT v_existed THEN
      RAISE EXCEPTION 'Pays introuvable : %', v_country_id;
    END IF;
    v_after := GREATEST(v_min, LEAST(v_max, v_before + v_delta));
    v_actual_delta := v_after - v_before;
    EXECUTE format(
      'UPDATE public.countries SET %I = $1, updated_at = now() WHERE id = $2',
      v_column
    ) USING v_after, v_country_id;

    operation_kind := v_kind;
    target_table := 'countries';
    target_key := jsonb_build_object('country_id', v_country_id, 'column', v_column);
    before_state := jsonb_build_object('value', v_before);
    after_state := jsonb_build_object('value', v_after, 'applied_delta', v_actual_delta);
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'military_unit_delta' THEN
    v_country_id := (p_operation->>'country_id')::uuid;
    v_roster_unit_id := (p_operation->>'roster_unit_id')::uuid;
    v_level_delta := COALESCE((p_operation->>'current_level_delta')::integer, 0);
    v_extra_delta := COALESCE((p_operation->>'extra_count_delta')::integer, 0);

    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:military:' || v_country_id || ':' || v_roster_unit_id,
      0
    ));
    SELECT current_level, extra_count
    INTO v_before_level, v_before_extra
    FROM public.country_military_units
    WHERE country_id = v_country_id AND roster_unit_id = v_roster_unit_id
    FOR UPDATE;
    v_existed := FOUND;
    v_before_level := COALESCE(v_before_level, 0);
    v_before_extra := COALESCE(v_before_extra, 0);

    SELECT level_count * 100 INTO v_level_max
    FROM public.military_roster_units
    WHERE id = v_roster_unit_id;
    IF v_level_max IS NULL THEN
      RAISE EXCEPTION 'Unité militaire introuvable : %', v_roster_unit_id;
    END IF;

    v_after_level := GREATEST(0, LEAST(v_level_max, v_before_level + v_level_delta));
    v_after_extra := GREATEST(0, v_before_extra + v_extra_delta);

    INSERT INTO public.country_military_units (
      country_id, roster_unit_id, current_level, extra_count, updated_at
    ) VALUES (
      v_country_id, v_roster_unit_id, v_after_level, v_after_extra, now()
    )
    ON CONFLICT (country_id, roster_unit_id)
    DO UPDATE SET
      current_level = EXCLUDED.current_level,
      extra_count = EXCLUDED.extra_count,
      updated_at = now();

    operation_kind := v_kind;
    target_table := 'country_military_units';
    target_key := jsonb_build_object('country_id', v_country_id, 'roster_unit_id', v_roster_unit_id);
    before_state := jsonb_build_object(
      'exists', v_existed,
      'current_level', v_before_level,
      'extra_count', v_before_extra
    );
    after_state := jsonb_build_object(
      'current_level', v_after_level,
      'extra_count', v_after_extra,
      'applied_current_level_delta', v_after_level - v_before_level,
      'applied_extra_count_delta', v_after_extra - v_before_extra
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'intel_delta' THEN
    v_country_id := (p_operation->>'observer_country_id')::uuid;
    v_target_country_id := (p_operation->>'target_country_id')::uuid;
    IF v_country_id = v_target_country_id THEN
      RAISE EXCEPTION 'Le renseignement ne peut pas cibler le même pays.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:intel:' || v_country_id || ':' || v_target_country_id,
      0
    ));
    v_delta := GREATEST(0, COALESCE((p_operation->>'delta')::numeric, 0));

    SELECT intel_level, display_seed
    INTO v_before, v_before_seed
    FROM public.country_intel
    WHERE observer_country_id = v_country_id
      AND target_country_id = v_target_country_id
    FOR UPDATE;
    v_existed := FOUND;
    v_before := COALESCE(v_before, 0);
    v_before_seed := COALESCE(v_before_seed, 0);
    v_after := GREATEST(0, LEAST(100, v_before + v_delta));
    v_actual_delta := v_after - v_before;
    v_after_seed := floor(random() * 2147483647)::integer;

    INSERT INTO public.country_intel (
      observer_country_id, target_country_id, intel_level, display_seed, updated_at
    ) VALUES (
      v_country_id, v_target_country_id, v_after, v_after_seed, now()
    )
    ON CONFLICT (observer_country_id, target_country_id)
    DO UPDATE SET
      intel_level = EXCLUDED.intel_level,
      display_seed = EXCLUDED.display_seed,
      updated_at = now();

    operation_kind := v_kind;
    target_table := 'country_intel';
    target_key := jsonb_build_object(
      'observer_country_id', v_country_id,
      'target_country_id', v_target_country_id
    );
    before_state := jsonb_build_object(
      'exists', v_existed,
      'intel_level', v_before,
      'display_seed', v_before_seed
    );
    after_state := jsonb_build_object(
      'intel_level', v_after,
      'display_seed', v_after_seed,
      'applied_delta', v_actual_delta
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'effect_insert' THEN
    v_effect := COALESCE(p_operation->'effect', p_operation);
    v_effect_id := COALESCE(NULLIF(v_effect->>'id', '')::uuid, gen_random_uuid());
    v_country_id := (v_effect->>'country_id')::uuid;
    IF NULLIF(btrim(v_effect->>'name'), '') IS NULL
       OR NULLIF(btrim(v_effect->>'effect_kind'), '') IS NULL THEN
      RAISE EXCEPTION 'Effet temporaire incomplet.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.country_effects WHERE id = v_effect_id) THEN
      RAISE EXCEPTION 'Identifiant effet déjà utilisé : %', v_effect_id;
    END IF;

    INSERT INTO public.country_effects (
      id, country_id, name, effect_kind, effect_target, effect_subtype,
      value, duration_kind, duration_remaining
    ) VALUES (
      v_effect_id,
      v_country_id,
      v_effect->>'name',
      v_effect->>'effect_kind',
      NULLIF(v_effect->>'effect_target', ''),
      NULLIF(v_effect->>'effect_subtype', ''),
      COALESCE((v_effect->>'value')::numeric, 0),
      COALESCE(NULLIF(v_effect->>'duration_kind', ''), 'days'),
      COALESCE((v_effect->>'duration_remaining')::integer, 0)
    )
    RETURNING to_jsonb(country_effects.*) INTO v_after_json;

    operation_kind := v_kind;
    target_table := 'country_effects';
    target_key := jsonb_build_object('id', v_effect_id);
    before_state := jsonb_build_object('exists', false);
    after_state := v_after_json;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Type de conséquence non autorisé : %', COALESCE(v_kind, '<vide>');
END;
$$;

CREATE OR REPLACE FUNCTION public._rp_revert_consequence_entry(
  p_target_table text,
  p_target_key jsonb,
  p_before_state jsonb,
  p_after_state jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country_id uuid;
  v_target_country_id uuid;
  v_roster_unit_id uuid;
  v_country_a_id uuid;
  v_country_b_id uuid;
  v_column text;
  v_current numeric;
  v_new numeric;
  v_level integer;
  v_extra integer;
  v_level_cap integer;
  v_new_level integer;
  v_new_extra integer;
  v_current_seed integer;
  v_new_seed integer;
  v_is_annexed boolean;
  v_recrutement_points integer;
  v_procuration_points integer;
  v_stock_points integer;
  v_country_found boolean;
BEGIN
  IF p_target_table = 'country_relations' THEN
    v_country_a_id := (p_target_key->>'country_a_id')::uuid;
    v_country_b_id := (p_target_key->>'country_b_id')::uuid;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:relation:' || v_country_a_id || ':' || v_country_b_id,
      0
    ));
    SELECT value INTO v_current
    FROM public.country_relations
    WHERE country_a_id = v_country_a_id AND country_b_id = v_country_b_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Relation à annuler introuvable.';
    END IF;
    IF v_current IS DISTINCT FROM (p_after_state->>'value')::numeric THEN
      RAISE EXCEPTION 'Correction refusée : la relation a été modifiée après cette action.';
    END IF;
    v_new := GREATEST(-100, LEAST(100, v_current - (p_after_state->>'applied_delta')::numeric));
    IF COALESCE((p_before_state->>'exists')::boolean, false) = false AND v_new = 0 THEN
      DELETE FROM public.country_relations
      WHERE country_a_id = v_country_a_id AND country_b_id = v_country_b_id;
    ELSE
      UPDATE public.country_relations SET value = v_new::smallint, updated_at = now()
      WHERE country_a_id = v_country_a_id AND country_b_id = v_country_b_id;
    END IF;
    RETURN;
  END IF;

  IF p_target_table = 'country_control' THEN
    v_country_id := (p_target_key->>'country_id')::uuid;
    v_target_country_id := (p_target_key->>'controller_country_id')::uuid;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:control:' || v_country_id || ':' || v_target_country_id,
      0
    ));
    SELECT share_pct, is_annexed INTO v_current, v_is_annexed
    FROM public.country_control
    WHERE country_id = v_country_id AND controller_country_id = v_target_country_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contrôle à annuler introuvable.';
    END IF;
    IF v_current IS DISTINCT FROM (p_after_state->>'share_pct')::numeric
       OR (
         p_after_state ? 'is_annexed'
         AND v_is_annexed IS DISTINCT FROM (p_after_state->>'is_annexed')::boolean
       ) THEN
      RAISE EXCEPTION 'Correction refusée : le contrôle a été modifié après cette action.';
    END IF;
    v_new := GREATEST(0, LEAST(100, v_current - (p_after_state->>'applied_delta')::numeric));
    IF COALESCE((p_before_state->>'exists')::boolean, false) = false
       AND v_new = 0
       AND NOT v_is_annexed THEN
      DELETE FROM public.country_control
      WHERE country_id = v_country_id AND controller_country_id = v_target_country_id;
    ELSE
      UPDATE public.country_control SET share_pct = v_new, updated_at = now()
      WHERE country_id = v_country_id AND controller_country_id = v_target_country_id;
    END IF;
    RETURN;
  END IF;

  IF p_target_table = 'countries' THEN
    v_country_id := (p_target_key->>'country_id')::uuid;
    v_column := p_target_key->>'column';
    IF v_column NOT IN (
      'militarism', 'industry', 'science', 'stability',
      'ideology_germanic_monarchy', 'ideology_merina_monarchy',
      'ideology_french_republicanism', 'ideology_mughal_republicanism',
      'ideology_nilotique_cultism', 'ideology_satoiste_cultism'
    ) THEN
      RAISE EXCEPTION 'Colonne pays non autorisée : %', v_column;
    END IF;
    v_country_found := false;
    EXECUTE format(
      'SELECT %I::numeric, true FROM public.countries WHERE id = $1 FOR UPDATE',
      v_column
    ) INTO v_current, v_country_found USING v_country_id;
    IF NOT v_country_found THEN
      RAISE EXCEPTION 'Pays à annuler introuvable.';
    END IF;
    IF v_current IS DISTINCT FROM (p_after_state->>'value')::numeric THEN
      RAISE EXCEPTION 'Correction refusée : le pays a été modifié après cette action.';
    END IF;
    v_new := v_current - (p_after_state->>'applied_delta')::numeric;
    v_new := CASE
      WHEN v_column = 'stability' THEN GREATEST(-3, LEAST(3, v_new))
      WHEN v_column IN ('militarism', 'industry', 'science') THEN GREATEST(0, LEAST(10, v_new))
      ELSE GREATEST(0, LEAST(100, v_new))
    END;
    EXECUTE format(
      'UPDATE public.countries SET %I = $1, updated_at = now() WHERE id = $2',
      v_column
    ) USING v_new, v_country_id;
    RETURN;
  END IF;

  IF p_target_table = 'country_military_units' THEN
    v_country_id := (p_target_key->>'country_id')::uuid;
    v_roster_unit_id := (p_target_key->>'roster_unit_id')::uuid;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:military:' || v_country_id || ':' || v_roster_unit_id,
      0
    ));
    SELECT
      cmu.current_level,
      cmu.extra_count,
      COALESCE(mru.level_count * 100, 9999),
      cmu.recrutement_points,
      cmu.procuration_points,
      cmu.stock_points
    INTO
      v_level,
      v_extra,
      v_level_cap,
      v_recrutement_points,
      v_procuration_points,
      v_stock_points
    FROM public.country_military_units cmu
    LEFT JOIN public.military_roster_units mru ON mru.id = cmu.roster_unit_id
    WHERE cmu.country_id = v_country_id AND cmu.roster_unit_id = v_roster_unit_id
    FOR UPDATE OF cmu;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unité pays à annuler introuvable.';
    END IF;
    IF v_level IS DISTINCT FROM (p_after_state->>'current_level')::integer
       OR v_extra IS DISTINCT FROM (p_after_state->>'extra_count')::integer THEN
      RAISE EXCEPTION 'Correction refusée : l''unité a été modifiée après cette action.';
    END IF;
    v_new_level := GREATEST(
      0,
      LEAST(v_level_cap, v_level - (p_after_state->>'applied_current_level_delta')::integer)
    );
    v_new_extra := GREATEST(0, v_extra - (p_after_state->>'applied_extra_count_delta')::integer);
    IF COALESCE((p_before_state->>'exists')::boolean, false) = false
       AND v_new_level = 0
       AND v_new_extra = 0
       AND v_recrutement_points = 0
       AND v_procuration_points = 0
       AND v_stock_points = 0 THEN
      DELETE FROM public.country_military_units
      WHERE country_id = v_country_id AND roster_unit_id = v_roster_unit_id;
    ELSE
      UPDATE public.country_military_units
      SET current_level = v_new_level, extra_count = v_new_extra, updated_at = now()
      WHERE country_id = v_country_id AND roster_unit_id = v_roster_unit_id;
    END IF;
    RETURN;
  END IF;

  IF p_target_table = 'country_intel' THEN
    v_country_id := (p_target_key->>'observer_country_id')::uuid;
    v_target_country_id := (p_target_key->>'target_country_id')::uuid;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:intel:' || v_country_id || ':' || v_target_country_id,
      0
    ));
    SELECT intel_level, display_seed
    INTO v_current, v_current_seed
    FROM public.country_intel
    WHERE observer_country_id = v_country_id
      AND target_country_id = v_target_country_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Renseignement à annuler introuvable.';
    END IF;
    IF v_current IS DISTINCT FROM (p_after_state->>'intel_level')::numeric
       OR v_current_seed IS DISTINCT FROM (p_after_state->>'display_seed')::integer THEN
      RAISE EXCEPTION 'Correction refusée : le renseignement a été modifié après cette action.';
    END IF;
    v_new := GREATEST(
      0,
      LEAST(100, v_current - (p_after_state->>'applied_delta')::numeric)
    );
    v_new_seed := COALESCE((p_before_state->>'display_seed')::integer, v_current_seed);
    IF COALESCE((p_before_state->>'exists')::boolean, false) = false AND v_new = 0 THEN
      DELETE FROM public.country_intel
      WHERE observer_country_id = v_country_id
        AND target_country_id = v_target_country_id;
    ELSE
      UPDATE public.country_intel
      SET intel_level = v_new, display_seed = v_new_seed, updated_at = now()
      WHERE observer_country_id = v_country_id
        AND target_country_id = v_target_country_id;
    END IF;
    RETURN;
  END IF;

  IF p_target_table = 'country_effects' THEN
    DELETE FROM public.country_effects WHERE id = (p_target_key->>'id')::uuid;
    -- Un effet temporaire déjà expiré ne contribue plus au monde : son absence équivaut à son annulation.
    RETURN;
  END IF;

  RAISE EXCEPTION 'Table de registre non autorisée : %', p_target_table;
END;
$$;

REVOKE ALL ON FUNCTION public._rp_apply_consequence_operation(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rp_revert_consequence_entry(text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

UPDATE public.rule_parameters
SET
  value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
    'model', 'anthracite-org-magnum-v4-72b-FP8-Dynamic',
    'enabled', false
  ),
  updated_at = now()
WHERE key = 'rp_pipeline_config';
