-- Actions d'État militaires : seuils minimaux de relation + filtrage IA.

UPDATE public.state_action_types
SET params_schema = COALESCE(params_schema, '{}'::jsonb)
  || jsonb_build_object(
    'impact_maximum',
    COALESCE((params_schema->>'impact_maximum')::int, 50),
    'min_relation_required',
    COALESCE((params_schema->>'min_relation_required')::int, -25)
  )
WHERE key = 'escarmouche_militaire';

UPDATE public.state_action_types
SET params_schema = COALESCE(params_schema, '{}'::jsonb)
  || jsonb_build_object(
    'impact_maximum',
    COALESCE((params_schema->>'impact_maximum')::int, 60),
    'min_relation_required',
    COALESCE((params_schema->>'min_relation_required')::int, -50)
  )
WHERE key = 'conflit_arme';

UPDATE public.state_action_types
SET params_schema = COALESCE(params_schema, '{}'::jsonb)
  || jsonb_build_object(
    'impact_maximum',
    COALESCE((params_schema->>'impact_maximum')::int, 80),
    'min_relation_required',
    COALESCE((params_schema->>'min_relation_required')::int, -75)
  )
WHERE key = 'guerre_ouverte';

CREATE OR REPLACE FUNCTION public.get_state_action_min_relation_required(p_action_key text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_params jsonb;
BEGIN
  SELECT params_schema INTO v_params
  FROM public.state_action_types
  WHERE key = p_action_key
  LIMIT 1;

  IF p_action_key = 'escarmouche_militaire' THEN
    RETURN COALESCE((v_params->>'min_relation_required')::int, -25);
  END IF;
  IF p_action_key = 'conflit_arme' THEN
    RETURN COALESCE((v_params->>'min_relation_required')::int, -50);
  END IF;
  IF p_action_key = 'guerre_ouverte' THEN
    RETURN COALESCE((v_params->>'min_relation_required')::int, -75);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.get_state_action_min_relation_required(text) IS 'Retourne le seuil minimal de relation requis pour une action d''État militaire, ou NULL si non concernée.';

CREATE OR REPLACE FUNCTION public.get_eligible_ai_event_target_ids(
  p_emitter_id uuid,
  p_config jsonb,
  p_action_key text
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base uuid[];
  v_modes text[];
  v_continent_id uuid;
  v_result uuid[];
  v_min_relation integer;
BEGIN
  SELECT array_agg(c.id) INTO v_base
  FROM public.countries c
  WHERE c.id <> p_emitter_id
    AND (
      (COALESCE((p_config->>'target_major_ai')::boolean, false) AND c.ai_status = 'major')
      OR (COALESCE((p_config->>'target_minor_ai')::boolean, false) AND c.ai_status = 'minor')
      OR (COALESCE((p_config->>'target_players')::boolean, false) AND EXISTS (SELECT 1 FROM public.country_players cp WHERE cp.country_id = c.id))
    );

  IF v_base IS NULL OR array_length(v_base, 1) < 1 THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(p_config->'distance_modes')),
    ARRAY['world']::text[]
  ) INTO v_modes;
  IF array_length(v_modes, 1) IS NULL OR array_length(v_modes, 1) < 1 THEN
    v_modes := ARRAY['world']::text[];
  END IF;

  SELECT continent_id INTO v_continent_id FROM public.countries WHERE id = p_emitter_id LIMIT 1;
  v_min_relation := public.get_state_action_min_relation_required(p_action_key);

  SELECT array_agg(DISTINCT c.id) INTO v_result
  FROM public.countries c
  WHERE c.id = ANY(v_base)
    AND (
      ('world' = ANY(v_modes))
      OR (('continent' = ANY(v_modes)) AND c.continent_id IS NOT NULL AND c.continent_id = v_continent_id)
      OR (('neighbors' = ANY(v_modes)) AND c.id IN (
        SELECT mrc.country_id
        FROM public.map_region_countries mrc
        WHERE mrc.region_id IN (
          SELECT CASE WHEN mrn.region_a_id = er.region_id THEN mrn.region_b_id ELSE mrn.region_a_id END
          FROM public.map_region_neighbors mrn
          CROSS JOIN (SELECT region_id FROM public.map_region_countries WHERE country_id = p_emitter_id) er
          WHERE mrn.region_a_id = er.region_id OR mrn.region_b_id = er.region_id
        )
        AND mrc.country_id <> p_emitter_id
      ))
    )
    AND (
      v_min_relation IS NULL
      OR COALESCE((
        SELECT cr.value
        FROM public.country_relations cr
        WHERE cr.country_a_id = CASE WHEN p_emitter_id < c.id THEN p_emitter_id ELSE c.id END
          AND cr.country_b_id = CASE WHEN p_emitter_id < c.id THEN c.id ELSE p_emitter_id END
        LIMIT 1
      ), 0) <= v_min_relation
    );

  RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$$;

COMMENT ON FUNCTION public.get_eligible_ai_event_target_ids(uuid, jsonb, text) IS 'Cibles éligibles pour un event IA selon ai_events_config, distance et seuil relationnel éventuel du type d''action.';

CREATE OR REPLACE FUNCTION public.run_ai_events_cron(p_force boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jsonb;
  v_keys_major jsonb;
  v_keys_minor jsonb;
  v_last_run timestamptz;
  v_interval_hours numeric;
  v_count_major int;
  v_count_minor int;
  v_emitter_id uuid;
  v_action_type_id uuid;
  v_action_key text;
  v_target_id uuid;
  v_auto_accept jsonb;
  v_amplitude_min int;
  v_i int;
  v_dice_total int;
  v_scheduled timestamptz;
  v_payload jsonb;
  v_dice_results jsonb;
  v_eligible_targets uuid[];
  v_used_targets uuid[];
  v_lock_key bigint;
BEGIN
  v_lock_key := hashtext('run_ai_events_cron')::bigint;
  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    RETURN;
  END IF;

  SELECT value INTO v_config FROM public.rule_parameters WHERE key = 'ai_events_config' LIMIT 1;
  IF v_config IS NULL OR (v_config->>'interval_hours') IS NULL THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RETURN;
  END IF;

  v_interval_hours := (v_config->>'interval_hours')::numeric;
  IF v_interval_hours <= 0 THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RETURN;
  END IF;

  v_keys_major := COALESCE(v_config->'allowed_action_type_keys_major', '[]'::jsonb);
  IF jsonb_typeof(v_keys_major) <> 'array' THEN
    v_keys_major := '[]'::jsonb;
  END IF;
  v_keys_minor := COALESCE(v_config->'allowed_action_type_keys_minor', '[]'::jsonb);
  IF jsonb_typeof(v_keys_minor) <> 'array' THEN
    v_keys_minor := '[]'::jsonb;
  END IF;

  SELECT (value #>> '{}')::timestamptz INTO v_last_run
  FROM public.rule_parameters WHERE key = 'ai_events_last_run' LIMIT 1;
  IF v_last_run IS NULL THEN
    v_last_run := '1970-01-01'::timestamptz;
  END IF;

  IF NOT p_force AND (now() - v_last_run) < (v_interval_hours * interval '1 hour') THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RETURN;
  END IF;

  v_count_major := COALESCE((v_config->>'count_major_per_run')::int, 0);
  v_count_minor := COALESCE((v_config->>'count_minor_per_run')::int, 0);
  v_auto_accept := COALESCE(v_config->'auto_accept_by_action_type', '{}'::jsonb);
  v_amplitude_min := GREATEST(0, COALESCE((v_config->>'trigger_amplitude_minutes')::int, 0));
  v_used_targets := '{}';

  FOR v_i IN 1 .. v_count_major LOOP
    SELECT id INTO v_emitter_id FROM public.countries WHERE ai_status = 'major' ORDER BY random() LIMIT 1;
    IF v_emitter_id IS NULL THEN
      EXIT;
    END IF;

    SELECT t.id, t.key INTO v_action_type_id, v_action_key
    FROM public.state_action_types t
    WHERE t.key = ANY(SELECT jsonb_array_elements_text(v_keys_major))
    ORDER BY random() LIMIT 1;

    IF v_action_type_id IS NULL THEN
      CONTINUE;
    END IF;

    v_eligible_targets := public.get_eligible_ai_event_target_ids(v_emitter_id, v_config, v_action_key);
    IF v_eligible_targets IS NULL OR array_length(v_eligible_targets, 1) < 1 THEN
      CONTINUE;
    END IF;

    SELECT array_agg(elem) INTO v_eligible_targets
    FROM unnest(v_eligible_targets) AS elem
    WHERE NOT (elem = ANY(v_used_targets));
    IF v_eligible_targets IS NULL OR array_length(v_eligible_targets, 1) < 1 THEN
      CONTINUE;
    END IF;

    v_target_id := v_eligible_targets[1 + floor(random() * array_length(v_eligible_targets, 1))::int];
    v_used_targets := array_append(v_used_targets, v_target_id);
    v_payload := jsonb_build_object('target_country_id', v_target_id);

    IF COALESCE((v_auto_accept->>v_action_key)::boolean, false) THEN
      v_dice_total := 1 + floor(random() * 100)::int;
      v_dice_results := jsonb_build_object(
        'impact_roll', jsonb_build_object('roll', v_dice_total, 'modifier', 0, 'total', v_dice_total)
      );
      v_scheduled := now() + (floor(random() * (v_amplitude_min + 1))::int * interval '1 minute');

      INSERT INTO public.ai_event_requests (
        country_id, action_type_id, status, payload, dice_results, scheduled_trigger_at, source
      ) VALUES (
        v_emitter_id, v_action_type_id, 'accepted', v_payload, v_dice_results, v_scheduled, 'cron'
      );
    ELSE
      INSERT INTO public.ai_event_requests (
        country_id, action_type_id, status, payload, source
      ) VALUES (
        v_emitter_id, v_action_type_id, 'pending', v_payload, 'cron'
      );
    END IF;
  END LOOP;

  FOR v_i IN 1 .. v_count_minor LOOP
    SELECT id INTO v_emitter_id FROM public.countries WHERE ai_status = 'minor' ORDER BY random() LIMIT 1;
    IF v_emitter_id IS NULL THEN
      EXIT;
    END IF;

    SELECT t.id, t.key INTO v_action_type_id, v_action_key
    FROM public.state_action_types t
    WHERE t.key = ANY(SELECT jsonb_array_elements_text(v_keys_minor))
    ORDER BY random() LIMIT 1;

    IF v_action_type_id IS NULL THEN
      CONTINUE;
    END IF;

    v_eligible_targets := public.get_eligible_ai_event_target_ids(v_emitter_id, v_config, v_action_key);
    IF v_eligible_targets IS NULL OR array_length(v_eligible_targets, 1) < 1 THEN
      CONTINUE;
    END IF;

    SELECT array_agg(elem) INTO v_eligible_targets
    FROM unnest(v_eligible_targets) AS elem
    WHERE NOT (elem = ANY(v_used_targets));
    IF v_eligible_targets IS NULL OR array_length(v_eligible_targets, 1) < 1 THEN
      CONTINUE;
    END IF;

    v_target_id := v_eligible_targets[1 + floor(random() * array_length(v_eligible_targets, 1))::int];
    v_used_targets := array_append(v_used_targets, v_target_id);
    v_payload := jsonb_build_object('target_country_id', v_target_id);

    IF COALESCE((v_auto_accept->>v_action_key)::boolean, false) THEN
      v_dice_total := 1 + floor(random() * 100)::int;
      v_dice_results := jsonb_build_object(
        'impact_roll', jsonb_build_object('roll', v_dice_total, 'modifier', 0, 'total', v_dice_total)
      );
      v_scheduled := now() + (floor(random() * (v_amplitude_min + 1))::int * interval '1 minute');

      INSERT INTO public.ai_event_requests (
        country_id, action_type_id, status, payload, dice_results, scheduled_trigger_at, source
      ) VALUES (
        v_emitter_id, v_action_type_id, 'accepted', v_payload, v_dice_results, v_scheduled, 'cron'
      );
    ELSE
      INSERT INTO public.ai_event_requests (
        country_id, action_type_id, status, payload, source
      ) VALUES (
        v_emitter_id, v_action_type_id, 'pending', v_payload, 'cron'
      );
    END IF;
  END LOOP;

  INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
  VALUES (
    'ai_events_last_run',
    to_jsonb(now()::timestamptz::text),
    'Dernier passage du cron events IA (UTC).',
    now(),
    now()
  )
  ON CONFLICT (key) DO UPDATE SET value = to_jsonb(now()::timestamptz::text), updated_at = now();

  PERFORM pg_advisory_unlock(v_lock_key);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.run_ai_events_cron(boolean) IS 'Génère des events IA selon ai_events_config. p_force=true ignore l''intervalle. Les actions militaires filtrent aussi les cibles selon leur seuil minimal de relation.';
