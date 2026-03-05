-- Cron de génération des events IA : run_ai_events_cron() lit ai_events_config et insère des lignes dans ai_event_requests.

CREATE OR REPLACE FUNCTION public.run_ai_events_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jsonb;
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
BEGIN
  SELECT value INTO v_config FROM public.rule_parameters WHERE key = 'ai_events_config' LIMIT 1;
  IF v_config IS NULL OR (v_config->>'interval_hours') IS NULL THEN
    RETURN;
  END IF;

  v_interval_hours := (v_config->>'interval_hours')::numeric;
  IF v_interval_hours <= 0 THEN
    RETURN;
  END IF;

  SELECT (value #>> '{}')::timestamptz INTO v_last_run
  FROM public.rule_parameters WHERE key = 'ai_events_last_run' LIMIT 1;
  IF v_last_run IS NULL THEN
    v_last_run := '1970-01-01'::timestamptz;
  END IF;

  IF (now() - v_last_run) < (v_interval_hours * interval '1 hour') THEN
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
    WHERE t.key = ANY(
      SELECT jsonb_array_elements_text(v_config->'allowed_action_type_keys_major')
    )
    ORDER BY random() LIMIT 1;

    IF v_action_type_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT array_agg(c.id) INTO v_eligible_targets
    FROM public.countries c
    WHERE c.id <> v_emitter_id
      AND (
        (COALESCE((v_config->>'target_major_ai')::boolean, false) AND c.ai_status = 'major')
        OR (COALESCE((v_config->>'target_minor_ai')::boolean, false) AND c.ai_status = 'minor')
        OR (COALESCE((v_config->>'target_players')::boolean, false) AND EXISTS (SELECT 1 FROM public.country_players cp WHERE cp.country_id = c.id))
      );

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
    WHERE t.key = ANY(
      SELECT jsonb_array_elements_text(v_config->'allowed_action_type_keys_minor')
    )
    ORDER BY random() LIMIT 1;

    IF v_action_type_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT array_agg(c.id) INTO v_eligible_targets
    FROM public.countries c
    WHERE c.id <> v_emitter_id
      AND (
        (COALESCE((v_config->>'target_major_ai')::boolean, false) AND c.ai_status = 'major')
        OR (COALESCE((v_config->>'target_minor_ai')::boolean, false) AND c.ai_status = 'minor')
        OR (COALESCE((v_config->>'target_players')::boolean, false) AND EXISTS (SELECT 1 FROM public.country_players cp WHERE cp.country_id = c.id))
      );

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
END;
$$;

COMMENT ON FUNCTION public.run_ai_events_cron() IS 'Génère des events IA (ai_event_requests) selon ai_events_config. À appeler par pg_cron ou une route API. Ne traite pas les conséquences différées (job Process due côté app).';
