-- Enregistrer à chaque passage les valeurs utilisées (last_run, interval_hours, diff) et si on a skip,
-- pour diagnostiquer pourquoi la fonction sort sans générer d'events.
-- Interprétation explicite de last_run en UTC pour éviter bugs timezone.
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
  v_last_run_raw text;
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
  v_diff_seconds numeric;
  v_would_skip boolean;
BEGIN
  v_lock_key := hashtext('run_ai_events_cron')::bigint;
  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
    VALUES (
      'ai_events_cron_last_check',
      jsonb_build_object('at', now(), 'reason', 'lock_not_acquired'),
      'Debug: dernier passage run_ai_events_cron',
      now(),
      now()
    )
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    RETURN;
  END IF;

  SELECT value INTO v_config FROM public.rule_parameters WHERE key = 'ai_events_config' LIMIT 1;
  IF v_config IS NULL OR (v_config->>'interval_hours') IS NULL THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
    VALUES (
      'ai_events_cron_last_check',
      jsonb_build_object('at', now(), 'reason', 'config_missing'),
      'Debug: dernier passage run_ai_events_cron',
      now(),
      now()
    )
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    RETURN;
  END IF;

  v_interval_hours := (v_config->>'interval_hours')::numeric;
  IF v_interval_hours <= 0 THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
    VALUES (
      'ai_events_cron_last_check',
      jsonb_build_object('at', now(), 'reason', 'interval_invalid', 'interval_hours', v_interval_hours),
      'Debug: dernier passage run_ai_events_cron',
      now(),
      now()
    )
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
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

  SELECT value #>> '{}' INTO v_last_run_raw
  FROM public.rule_parameters WHERE key = 'ai_events_last_run' LIMIT 1;
  IF v_last_run_raw IS NULL OR v_last_run_raw = '' THEN
    v_last_run := '1970-01-01'::timestamptz;
  ELSE
    -- Interpréter explicitement en UTC si la chaîne n'a pas de suffixe de timezone
    IF v_last_run_raw ~ '\+\d{2}$' OR v_last_run_raw ~ 'Z$' OR v_last_run_raw ~ '-\d{2}:?\d{2}$' THEN
      v_last_run := v_last_run_raw::timestamptz;
    ELSE
      v_last_run := (v_last_run_raw || '+00')::timestamptz;
    END IF;
  END IF;

  v_diff_seconds := EXTRACT(EPOCH FROM (now() - v_last_run));
  v_would_skip := (NOT p_force) AND ((now() - v_last_run) < (v_interval_hours * interval '1 hour'));

  INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
  VALUES (
    'ai_events_cron_last_check',
    jsonb_build_object(
      'at', now(),
      'last_run_raw', v_last_run_raw,
      'last_run_parsed', v_last_run,
      'interval_hours', v_interval_hours,
      'diff_seconds', v_diff_seconds,
      'would_skip', v_would_skip,
      'p_force', p_force
    ),
    'Debug: dernier passage run_ai_events_cron',
    now(),
    now()
  )
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  IF v_would_skip THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RETURN;
  END IF;

  v_count_major := COALESCE((v_config->>'count_major_per_run')::int, 0);
  v_count_minor := COALESCE((v_config->>'count_minor_per_run')::int, 0);
  v_auto_accept := COALESCE(v_config->'auto_accept_by_action_type', '{}'::jsonb);
  v_amplitude_min := GREATEST(0, COALESCE((v_config->>'trigger_amplitude_minutes')::int, 0));
  v_used_targets := '{}';

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
    to_jsonb((now() AT TIME ZONE 'UTC')::text || '+00'),
    'Dernier passage du cron events IA (UTC).',
    now(),
    now()
  )
  ON CONFLICT (key) DO UPDATE SET value = to_jsonb((now() AT TIME ZONE 'UTC')::text || '+00'), updated_at = now();

  PERFORM pg_advisory_unlock(v_lock_key);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.run_ai_events_cron(boolean) IS 'Génère des events IA. Enregistre ai_events_cron_last_check à chaque passage (debug). last_run stocké en UTC explicite.';
