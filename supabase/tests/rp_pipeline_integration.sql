BEGIN;

SET LOCAL statement_timeout = '30s';
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
BEGIN
  IF public.rp_d100_outcome(1) <> 'critical_failure'
     OR public.rp_d100_outcome(2) <> 'major_failure'
     OR public.rp_d100_outcome(24) <> 'major_failure'
     OR public.rp_d100_outcome(25) <> 'minor_failure'
     OR public.rp_d100_outcome(49) <> 'minor_failure'
     OR public.rp_d100_outcome(50) <> 'minor_success'
     OR public.rp_d100_outcome(74) <> 'minor_success'
     OR public.rp_d100_outcome(75) <> 'major_success'
     OR public.rp_d100_outcome(99) <> 'major_success'
     OR public.rp_d100_outcome(100) <> 'critical_success' THEN
    RAISE EXCEPTION 'TEST D100: frontière incorrecte.';
  END IF;
END
$$;

DO $$
DECLARE
  v_date record;
BEGIN
  DELETE FROM public.world_date_anchors;
  INSERT INTO public.world_date_anchors (
    real_at, rp_year, rp_month, rp_months_per_real_day, paused, source
  ) VALUES
    ('2026-01-01 00:00:00+00', 2040, 5, 0.2, false, 'manual'),
    ('2026-01-11 00:00:00+00', 2040, 7, 0.2, false, 'manual');

  SELECT * INTO v_date
  FROM public.get_probable_rp_date('2026-01-06 00:00:00+00');
  IF v_date.rp_year <> 2040 OR v_date.rp_month <> 6 OR v_date.rp_day <> 1 THEN
    RAISE EXCEPTION 'TEST DATE: interpolation incorrecte: %', to_jsonb(v_date);
  END IF;

  DELETE FROM public.world_date_anchors;
  INSERT INTO public.world_date_anchors (
    real_at, rp_year, rp_month, rp_months_per_real_day, paused, source
  ) VALUES ('2026-01-01 00:00:00+00', 2040, 5, 0.1, false, 'manual');
  SELECT * INTO v_date
  FROM public.get_probable_rp_date('2026-01-11 00:00:00+00');
  IF v_date.rp_month <> 6 OR v_date.rp_day <> 1 THEN
    RAISE EXCEPTION 'TEST DATE: extrapolation incorrecte: %', to_jsonb(v_date);
  END IF;

  DELETE FROM public.world_date_anchors;
  INSERT INTO public.world_date_anchors (
    real_at, rp_year, rp_month, rp_months_per_real_day, paused, source
  ) VALUES ('2026-01-01 00:00:00+00', 2040, 8, 1, true, 'pause');
  SELECT * INTO v_date
  FROM public.get_probable_rp_date('2026-01-20 00:00:00+00');
  IF v_date.rp_month <> 8 OR v_date.rp_day <> 1 THEN
    RAISE EXCEPTION 'TEST DATE: la pause fait encore avancer le monde: %', to_jsonb(v_date);
  END IF;
END
$$;

DO $$
DECLARE
  v_emitter uuid;
  v_target uuid;
  v_action_type uuid;
  v_action uuid;
  v_article uuid;
  v_plan jsonb;
  v_failure_plan jsonb;
  v_frozen_plan jsonb;
  v_action_updated_at timestamptz;
  v_expected_state jsonb;
  v_version integer;
  v_before_ledger integer;
  v_after_ledger integer;
  v_old_reverted integer;
  v_manual_industry numeric;
  v_rejected boolean := false;
  v_external_article uuid;
  v_source_kind text;
  v_classification_locked boolean;
  v_claimed_first uuid[];
  v_claimed_second uuid[];
BEGIN
  SELECT id INTO v_emitter
  FROM public.countries
  ORDER BY CASE WHEN industry < 10 THEN 0 ELSE 1 END, id
  LIMIT 1;
  SELECT id INTO v_target
  FROM public.countries
  WHERE id <> v_emitter
  ORDER BY id
  LIMIT 1;
  SELECT id INTO v_action_type
  FROM public.state_action_types
  WHERE key = 'ouverture_diplomatique'
  LIMIT 1;
  IF v_emitter IS NULL OR v_target IS NULL OR v_action_type IS NULL THEN
    RAISE EXCEPTION 'TEST FIXTURE: deux pays et ouverture_diplomatique sont requis.';
  END IF;

  INSERT INTO public.ai_event_requests (
    country_id,
    target_country_id,
    action_type_id,
    status,
    decision_status,
    source,
    importance,
    d100_roll,
    intent,
    admin_effect_added
  ) VALUES (
    v_emitter,
    v_target,
    v_action_type,
    'accepted',
    'approved',
    'manual',
    'major',
    50,
    'Test transactionnel du pipeline RP',
    jsonb_build_array(jsonb_build_object(
      'name', 'Effet de test',
      'effect_kind', 'stat_delta',
      'effect_target', 'industry',
      'value', 1,
      'application', 'immediate',
      'scope', 'emitter'
    ))
  )
  RETURNING id, consequence_plan, updated_at
  INTO v_action, v_plan, v_action_updated_at;
  SELECT consequence_plan, updated_at
  INTO v_plan, v_action_updated_at
  FROM public.ai_event_requests
  WHERE id = v_action;

  INSERT INTO public.lore_articles (
    source_kind,
    source_platform,
    action_id,
    title,
    description,
    clean_content,
    current_output,
    editorial_status
  ) VALUES (
    'engine',
    'engine',
    v_action,
    'Article SQL initial',
    repeat('Contexte factuel de validation. ', 5),
    repeat('Contexte factuel de validation. ', 5),
    jsonb_build_object(
      'title', 'Article SQL initial',
      'description', repeat('Contexte factuel de validation. ', 5),
      'sections', '[]'::jsonb
    ),
    'review'
  )
  RETURNING id INTO v_article;

  SELECT jsonb_build_object(
    'article_version', article.current_version,
    'action_execution_version', 1,
    'action_updated_at', v_action_updated_at,
    'source_versions', '[]'::jsonb,
    'countries', (
      SELECT jsonb_agg(jsonb_build_object('id', country.id, 'name', country.name) ORDER BY country.id)
      FROM public.countries country
    )
  )
  INTO v_expected_state
  FROM public.lore_articles article
  WHERE article.id = v_article;

  UPDATE public.ai_event_requests
  SET mj_notes = 'Le contexte a changé après la lecture MJ.'
  WHERE id = v_action;
  -- now() est stable dans cette transaction de test ; force un jeton de lecture antérieur.
  v_expected_state := jsonb_set(
    v_expected_state,
    '{action_updated_at}',
    to_jsonb(v_action_updated_at - interval '1 second')
  );
  BEGIN
    PERFORM public.review_lore_article(
      v_article,
      'Article périmé',
      repeat('Cette validation doit être refusée car les faits ont changé. ', 3),
      '[]'::jsonb,
      v_expected_state
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%faits ou les sources ont changé%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'TEST REVUE: une validation factuelle périmée a été acceptée.';
  END IF;

  SELECT jsonb_build_object(
    'article_version', article.current_version,
    'action_execution_version', 1,
    'action_updated_at', action.updated_at,
    'source_versions', '[]'::jsonb,
    'countries', (
      SELECT jsonb_agg(jsonb_build_object('id', country.id, 'name', country.name) ORDER BY country.id)
      FROM public.countries country
    )
  )
  INTO v_expected_state
  FROM public.lore_articles article
  JOIN public.ai_event_requests action ON action.id = article.action_id
  WHERE article.id = v_article;
  PERFORM public.review_lore_article(
    v_article,
    'Article SQL validé',
    repeat('Cette version repose sur les faits verrouillés par la transaction. ', 3),
    '[]'::jsonb,
    v_expected_state
  );

  v_rejected := false;
  BEGIN
    UPDATE public.lore_articles
    SET description = description || ' Échec majeur.'
    WHERE id = v_article;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Fait mécanique interdit.' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'TEST SÛRETÉ: un libellé mécanique accentué a été accepté.';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.lore_articles
    SET description = description || ' NSFW'
    WHERE id = v_article;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Contenu NSFW interdit.' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'TEST SÛRETÉ: un contenu NSFW a été accepté.';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.lore_articles
    SET description = description || ' Un accord violé reste contesté.'
    WHERE id = v_article;
    RAISE EXCEPTION 'ROLLBACK_TEST_ACCORD_VIOLE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ROLLBACK_TEST_ACCORD_VIOLE' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'TEST SÛRETÉ: la formulation géopolitique a été bloquée.';
  END IF;

  UPDATE public.state_action_types
  SET params_schema = params_schema || '{"impact_maximum": 999}'::jsonb
  WHERE id = v_action_type;
  v_frozen_plan := public.build_rp_action_consequence_plan(v_action, 50);
  IF v_frozen_plan IS DISTINCT FROM v_plan THEN
    RAISE EXCEPTION 'TEST SNAPSHOT: une règle modifiée a changé une action existante.';
  END IF;
  v_failure_plan := public.build_rp_action_consequence_plan(v_action, 49);
  IF v_failure_plan IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'TEST ÉCHEC: un jet raté conserve encore un effet.';
  END IF;

  SELECT count(*) INTO v_before_ledger
  FROM public.action_execution_ledger
  WHERE action_id = v_action;
  v_version := public.apply_rp_action_consequences(v_action, 0, 50, v_plan);
  IF v_version <> 1 THEN
    RAISE EXCEPTION 'TEST APPLY: version initiale incorrecte.';
  END IF;
  v_version := public.apply_rp_action_consequences(v_action, 0, 50, v_plan);
  SELECT count(*) INTO v_after_ledger
  FROM public.action_execution_ledger
  WHERE action_id = v_action;
  IF v_version <> 1
     OR v_after_ledger - v_before_ledger <> jsonb_array_length(v_plan) THEN
    RAISE EXCEPTION 'TEST APPLY: double application ou registre incomplet.';
  END IF;

  PERFORM public.record_rp_discord_publication(
    v_action,
    v_article,
    1,
    NULL,
    '900000000000000161',
    '900000000000000162',
    '900000000000000163',
    '900000000000000164',
    now()
  );
  IF NOT EXISTS (
    SELECT 1
    FROM public.lore_articles
    WHERE id = v_article
      AND published_output = current_output
      AND published_version = current_version
  ) THEN
    RAISE EXCEPTION 'TEST PUBLICATION: la version réellement livrée n''est pas figée.';
  END IF;

  PERFORM public.request_ai_action_roll_change(v_action, 1, 75);
  UPDATE public.lore_articles
  SET
    title = 'Article SQL version 2',
    description = repeat('Version deux correspondant au nouveau jet. ', 4),
    clean_content = repeat('Version deux correspondant au nouveau jet. ', 4),
    current_output = jsonb_build_object(
      'title', 'Article SQL version 2',
      'description', repeat('Version deux correspondant au nouveau jet. ', 4),
      'sections', '[]'::jsonb
    ),
    editorial_status = 'approved',
    approved_for_execution_version = 2
  WHERE id = v_article;
  v_version := public.replace_rp_action_roll(v_action, 1);
  SELECT count(*) INTO v_old_reverted
  FROM public.action_execution_ledger
  WHERE action_id = v_action
    AND execution_version = 1
    AND reverted_at IS NOT NULL;
  IF v_version <> 2
     OR v_old_reverted <> jsonb_array_length(v_plan)
     OR NOT EXISTS (
       SELECT 1
       FROM public.action_execution_ledger
       WHERE action_id = v_action
         AND execution_version = 2
         AND reverted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'TEST RECALCUL: annulation/réapplication incomplète.';
  END IF;

  UPDATE public.ai_event_requests SET execution_status = 'completed' WHERE id = v_action;
  UPDATE public.countries
  SET industry = CASE WHEN industry < 10 THEN industry + 1 ELSE industry - 1 END
  WHERE id = v_emitter
  RETURNING industry INTO v_manual_industry;
  PERFORM public.request_ai_action_roll_change(v_action, 2, 80);
  UPDATE public.lore_articles
  SET
    title = 'Article SQL version 3',
    description = repeat('Version trois correspondant au nouveau jet. ', 4),
    clean_content = repeat('Version trois correspondant au nouveau jet. ', 4),
    current_output = jsonb_build_object(
      'title', 'Article SQL version 3',
      'description', repeat('Version trois correspondant au nouveau jet. ', 4),
      'sections', '[]'::jsonb
    ),
    editorial_status = 'approved',
    approved_for_execution_version = 3
  WHERE id = v_article;
  v_rejected := false;
  BEGIN
    PERFORM public.replace_rp_action_roll(v_action, 2);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%pays a été modifié%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected
     OR (SELECT industry FROM public.countries WHERE id = v_emitter) <> v_manual_industry
     OR (SELECT execution_version FROM public.ai_event_requests WHERE id = v_action) <> 2 THEN
    RAISE EXCEPTION 'TEST RECALCUL: une écriture hors registre a été écrasée.';
  END IF;

  v_external_article := public.upsert_discord_lore_article(
    jsonb_build_object(
      'source_kind', 'player',
      'editorial_status', 'approved',
      'classification_status', 'classified',
      'discord_guild_id', '900000000000000171',
      'discord_channel_id', '900000000000000172',
      'discord_message_id', '900000000000000173',
      'discord_author_user_id', '900000000000000174',
      'title', 'Source Discord de test',
      'description', 'Contenu public de test.',
      'sections', '[]'::jsonb,
      'raw_content', 'Contenu public de test.',
      'clean_content', 'Contenu public de test.',
      'current_output', jsonb_build_object(
        'title', 'Source Discord de test',
        'description', 'Contenu public de test.',
        'sections', '[]'::jsonb
      ),
      'embeds', '[]'::jsonb,
      'links', '[]'::jsonb,
      'real_published_at', now(),
      'nsfw_quarantined', false,
      'content_hash', 'sql-test-1'
    ),
    jsonb_build_array(jsonb_build_object(
      'country_id', v_emitter,
      'relation_role', 'author'
    )),
    ARRAY['diplomatie']
  );
  PERFORM public.classify_lore_article(
    v_external_article,
    'official',
    v_emitter,
    NULL,
    ARRAY[v_target],
    ARRAY['diplomatie']
  );
  PERFORM public.upsert_discord_lore_article(
    jsonb_build_object(
      'source_kind', 'player',
      'editorial_status', 'approved',
      'classification_status', 'classified',
      'discord_guild_id', '900000000000000171',
      'discord_channel_id', '900000000000000172',
      'discord_message_id', '900000000000000173',
      'discord_author_user_id', '900000000000000175',
      'title', 'Source Discord éditée',
      'description', 'Contenu public édité.',
      'sections', '[]'::jsonb,
      'raw_content', 'Contenu public édité.',
      'clean_content', 'Contenu public édité.',
      'current_output', jsonb_build_object(
        'title', 'Source Discord éditée',
        'description', 'Contenu public édité.',
        'sections', '[]'::jsonb
      ),
      'embeds', '[]'::jsonb,
      'links', '[]'::jsonb,
      'real_published_at', now(),
      'nsfw_quarantined', false,
      'content_hash', 'sql-test-2'
    ),
    jsonb_build_array(jsonb_build_object(
      'country_id', v_target,
      'relation_role', 'author'
    )),
    ARRAY['militaire']
  );
  SELECT source_kind, classification_locked
  INTO v_source_kind, v_classification_locked
  FROM public.lore_articles
  WHERE id = v_external_article;
  IF v_source_kind <> 'official'
     OR NOT v_classification_locked
     OR NOT EXISTS (
       SELECT 1
       FROM public.lore_article_countries
       WHERE lore_article_id = v_external_article
         AND country_id = v_emitter
         AND relation_role = 'author'
     )
     OR EXISTS (
       SELECT 1
       FROM public.lore_article_tags link
       JOIN public.lore_tags tag ON tag.id = link.tag_id
       WHERE link.lore_article_id = v_external_article
         AND tag.key = 'militaire'
     ) THEN
    RAISE EXCEPTION 'TEST DISCORD: le collecteur a écrasé le classement MJ.';
  END IF;

  INSERT INTO public.rp_pipeline_jobs (
    job_type, priority, idempotency_key, payload
  )
  SELECT
    'discord_sync',
    -30000,
    'sql-claim-' || marker,
    jsonb_build_object('route_id', gen_random_uuid())
  FROM unnest(ARRAY['a', 'b', 'c']) marker;
  SELECT array_agg(id ORDER BY id) INTO v_claimed_first
  FROM public.claim_rp_pipeline_jobs('sql-worker-a', 2)
  WHERE priority = -30000;
  SELECT array_agg(id ORDER BY id) INTO v_claimed_second
  FROM public.claim_rp_pipeline_jobs('sql-worker-b', 2)
  WHERE priority = -30000;
  IF cardinality(v_claimed_first) <> 2
     OR cardinality(v_claimed_second) <> 1
     OR v_claimed_first && v_claimed_second THEN
    RAISE EXCEPTION 'TEST FILE: une tâche a été réservée deux fois.';
  END IF;

  PERFORM public.record_rp_pipeline_worker_heartbeat(
    'succeeded',
    '{"test": true}'::jsonb
  );
  IF NOT EXISTS (
    SELECT 1
    FROM public.rule_parameters
    WHERE key = 'rp_pipeline_worker_heartbeat'
      AND value->>'status' = 'succeeded'
      AND value ? 'last_success_at'
  ) THEN
    RAISE EXCEPTION 'TEST WORKER: signal de vie absent.';
  END IF;
END
$$;

ROLLBACK;
