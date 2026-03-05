-- Events IA : robustesse de la config (éviter erreur si champs array non-array ou absents).

-- Helper : sécuriser distance_modes (n'appeler jsonb_array_elements_text que sur un array).
CREATE OR REPLACE FUNCTION public.get_eligible_ai_event_target_ids(p_emitter_id uuid, p_config jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base uuid[];
  v_modes text[];
  v_modes_jsonb jsonb;
  v_continent_id uuid;
  v_result uuid[];
BEGIN
  -- Base : pays distinct de l'émetteur et respectant les 3 booléens (target_major_ai, target_minor_ai, target_players)
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

  -- distance_modes : défaut ['world'] si absent, non-array ou vide
  v_modes_jsonb := COALESCE(p_config->'distance_modes', '["world"]'::jsonb);
  IF jsonb_typeof(v_modes_jsonb) <> 'array' THEN
    v_modes_jsonb := '["world"]'::jsonb;
  END IF;
  SELECT ARRAY(SELECT jsonb_array_elements_text(v_modes_jsonb)) INTO v_modes;
  IF v_modes IS NULL OR array_length(v_modes, 1) IS NULL OR array_length(v_modes, 1) < 1 THEN
    v_modes := ARRAY['world']::text[];
  END IF;

  -- Continent de l'émetteur (pour filtre continent)
  SELECT continent_id INTO v_continent_id FROM public.countries WHERE id = p_emitter_id LIMIT 1;

  -- Union : pays de la base qui sont dans au moins un des modes (world, même continent, ou région voisine)
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
    );

  RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$$;

COMMENT ON FUNCTION public.get_eligible_ai_event_target_ids(uuid, jsonb) IS 'Cibles éligibles pour un event IA (union world / continent / voisins selon ai_events_config.distance_modes). Robuste si distance_modes absent ou non-array.';

-- run_ai_events_cron : sécuriser allowed_action_type_keys_major et _minor (n'appeler jsonb_array_elements_text que sur un array).
CREATE OR REPLACE FUNCTION public.run_ai_events_cron()
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
  v_lock_key bigint;
BEGIN
  -- Verrou advisory : un seul run à la fois (évite doubles générations si pg_cron rapproché)
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

  -- Robustesse : n'utiliser que des arrays pour les clés d'actions autorisées (évite erreur "non-array")
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

  IF (now() - v_last_run) < (v_interval_hours * interval '1 hour') THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RETURN;
  END IF;

  v_count_major := COALESCE((v_config->>'count_major_per_run')::int, 0);
  v_count_minor := COALESCE((v_config->>'count_minor_per_run')::int, 0);
  v_auto_accept := COALESCE(v_config->'auto_accept_by_action_type', '{}'::jsonb);
  v_amplitude_min := GREATEST(0, COALESCE((v_config->>'trigger_amplitude_minutes')::int, 0));

  -- Génération events IA majeures
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

    v_eligible_targets := public.get_eligible_ai_event_target_ids(v_emitter_id, v_config);
    IF v_eligible_targets IS NULL OR array_length(v_eligible_targets, 1) < 1 THEN
      CONTINUE;
    END IF;

    v_target_id := v_eligible_targets[1 + floor(random() * array_length(v_eligible_targets, 1))::int];
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

  -- Génération events IA mineures
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

    v_eligible_targets := public.get_eligible_ai_event_target_ids(v_emitter_id, v_config);
    IF v_eligible_targets IS NULL OR array_length(v_eligible_targets, 1) < 1 THEN
      CONTINUE;
    END IF;

    v_target_id := v_eligible_targets[1 + floor(random() * array_length(v_eligible_targets, 1))::int];
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

  -- Mise à jour last_run en fin de run réussi
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

COMMENT ON FUNCTION public.run_ai_events_cron() IS 'Génère des events IA selon ai_events_config. Robuste si allowed_action_type_keys_* ou distance_modes sont absents ou non-array. Verrou advisory.';
