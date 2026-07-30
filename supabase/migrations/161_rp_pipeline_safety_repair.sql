-- Rattrapage explicite des définitions modifiées après l'application distante de 160.
-- Le moteur reste volontairement désactivé jusqu'à la validation de bout en bout.

ALTER TABLE public.lore_articles
  ADD COLUMN IF NOT EXISTS published_output jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(published_output) = 'object'),
  ADD COLUMN IF NOT EXISTS published_version integer NOT NULL DEFAULT 0
    CHECK (published_version >= 0);

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
VALUES (
  'rp_pipeline_worker_heartbeat',
  jsonb_build_object('status', 'never'),
  'Signal de vie du worker RP, affiché dans les alertes lorsque la file ne progresse plus.',
  now(),
  now()
)
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS public.review_lore_article(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.finish_rp_ideology_persistence(
  p_token uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state jsonb;
  v_row_count integer;
  v_distinct_count integer;
  v_country_count integer;
  v_updated integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('rp:world-tick', 0));
  LOCK TABLE public.countries IN SHARE ROW EXCLUSIVE MODE;
  SELECT value INTO v_state
  FROM public.rule_parameters
  WHERE key = 'rp_ideology_persistence'
  FOR UPDATE;
  IF NOT COALESCE((v_state->>'active')::boolean, false)
     OR NULLIF(v_state->>'token', '')::uuid IS DISTINCT FROM p_token THEN
    RAISE EXCEPTION 'Calcul des idéologies expiré ou remplacé.';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Instantané des idéologies invalide.';
  END IF;

  SELECT count(*), count(DISTINCT country_id)
  INTO v_row_count, v_distinct_count
  FROM jsonb_to_recordset(p_rows) AS row(country_id uuid);
  SELECT count(*) INTO v_country_count FROM public.countries;
  IF v_row_count <> jsonb_array_length(p_rows)
     OR v_distinct_count <> v_row_count
     OR v_row_count <> v_country_count THEN
    RAISE EXCEPTION 'Pays manquant ou dupliqué dans l''instantané idéologique.';
  END IF;

  WITH rows AS (
    SELECT *
    FROM jsonb_to_recordset(p_rows) AS row(
      country_id uuid,
      ideology_germanic_monarchy numeric,
      ideology_merina_monarchy numeric,
      ideology_french_republicanism numeric,
      ideology_mughal_republicanism numeric,
      ideology_nilotique_cultism numeric,
      ideology_satoiste_cultism numeric,
      ideology_drift_germanic_monarchy numeric,
      ideology_drift_merina_monarchy numeric,
      ideology_drift_french_republicanism numeric,
      ideology_drift_mughal_republicanism numeric,
      ideology_drift_nilotique_cultism numeric,
      ideology_drift_satoiste_cultism numeric,
      ideology_breakdown jsonb
    )
  )
  UPDATE public.countries country
  SET
    ideology_germanic_monarchy = rows.ideology_germanic_monarchy,
    ideology_merina_monarchy = rows.ideology_merina_monarchy,
    ideology_french_republicanism = rows.ideology_french_republicanism,
    ideology_mughal_republicanism = rows.ideology_mughal_republicanism,
    ideology_nilotique_cultism = rows.ideology_nilotique_cultism,
    ideology_satoiste_cultism = rows.ideology_satoiste_cultism,
    ideology_drift_germanic_monarchy = rows.ideology_drift_germanic_monarchy,
    ideology_drift_merina_monarchy = rows.ideology_drift_merina_monarchy,
    ideology_drift_french_republicanism = rows.ideology_drift_french_republicanism,
    ideology_drift_mughal_republicanism = rows.ideology_drift_mughal_republicanism,
    ideology_drift_nilotique_cultism = rows.ideology_drift_nilotique_cultism,
    ideology_drift_satoiste_cultism = rows.ideology_drift_satoiste_cultism,
    ideology_breakdown = rows.ideology_breakdown,
    updated_at = clock_timestamp()
  FROM rows
  WHERE country.id = rows.country_id
    AND rows.ideology_breakdown IS NOT NULL
    AND jsonb_typeof(rows.ideology_breakdown) = 'object'
    AND rows.ideology_germanic_monarchy BETWEEN 0 AND 100
    AND rows.ideology_merina_monarchy BETWEEN 0 AND 100
    AND rows.ideology_french_republicanism BETWEEN 0 AND 100
    AND rows.ideology_mughal_republicanism BETWEEN 0 AND 100
    AND rows.ideology_nilotique_cultism BETWEEN 0 AND 100
    AND rows.ideology_satoiste_cultism BETWEEN 0 AND 100
    AND rows.ideology_drift_germanic_monarchy BETWEEN -100 AND 100
    AND rows.ideology_drift_merina_monarchy BETWEEN -100 AND 100
    AND rows.ideology_drift_french_republicanism BETWEEN -100 AND 100
    AND rows.ideology_drift_mughal_republicanism BETWEEN -100 AND 100
    AND rows.ideology_drift_nilotique_cultism BETWEEN -100 AND 100
    AND rows.ideology_drift_satoiste_cultism BETWEEN -100 AND 100;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_row_count THEN
    RAISE EXCEPTION 'Instantané idéologique incomplet ou hors limites.';
  END IF;

  UPDATE public.rule_parameters
  SET
    value = to_jsonb(COALESCE((value #>> '{}')::bigint, 0) + 1),
    updated_at = clock_timestamp()
  WHERE key = 'rp_world_tick_version';

  UPDATE public.rule_parameters
  SET value = '{"active": false}'::jsonb, updated_at = clock_timestamp()
  WHERE key = 'rp_ideology_persistence';
END;
$$;

CREATE OR REPLACE FUNCTION public.enrich_rp_control_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_annexed boolean;
BEGIN
  IF NEW.target_table = 'country_control' THEN
    SELECT is_annexed INTO v_is_annexed
    FROM public.country_control
    WHERE country_id = (NEW.target_key->>'country_id')::uuid
      AND controller_country_id = (NEW.target_key->>'controller_country_id')::uuid;
    NEW.before_state := NEW.before_state
      || jsonb_build_object('is_annexed', COALESCE(v_is_annexed, false));
    NEW.after_state := NEW.after_state
      || jsonb_build_object('is_annexed', COALESCE(v_is_annexed, false));
  END IF;
  RETURN NEW;
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
    EXECUTE format(
      'SELECT %I::numeric FROM public.countries WHERE id = $1 FOR UPDATE',
      v_column
    ) INTO v_current USING v_country_id;
    IF NOT FOUND THEN
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
  v_action public.ai_event_requests%ROWTYPE;
  v_action_key text;
  v_params jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_effects jsonb;
  v_effect jsonb;
  v_effect_country_id uuid;
  v_impact_max numeric;
  v_intel_config jsonb;
  v_delta numeric;
  v_kind text;
  v_application text;
  v_scope text;
  v_column text;
  v_snapshot jsonb;
  v_ideology_key text;
  v_current numeric;
  v_actual numeric;
  v_normalized_scores jsonb;
  v_shifted_scores jsonb;
  v_final_scores jsonb;
  v_ideology_keys text[] := ARRAY[
    'ideology_germanic_monarchy',
    'ideology_merina_monarchy',
    'ideology_french_republicanism',
    'ideology_mughal_republicanism',
    'ideology_nilotique_cultism',
    'ideology_satoiste_cultism'
  ];
BEGIN
  PERFORM public.rp_d100_outcome(p_roll);
  SELECT a
  INTO v_action
  FROM public.ai_event_requests a
  WHERE a.id = p_action_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action introuvable.';
  END IF;
  v_action_key := v_action.world_snapshot #>> '{action,key}';
  v_params := v_action.world_snapshot #> '{action,params}';
  IF NULLIF(v_action_key, '') IS NULL OR jsonb_typeof(v_params) <> 'object' THEN
    RAISE EXCEPTION 'Configuration initiale du type d''action introuvable.';
  END IF;

  v_impact_max := COALESCE((v_params->>'impact_maximum')::numeric, 50);
  IF v_action_key IN (
    'insulte_diplomatique', 'escarmouche_militaire', 'conflit_arme', 'guerre_ouverte'
  ) THEN
    IF v_action.target_country_id IS NULL THEN
      RAISE EXCEPTION 'Pays cible manquant.';
    END IF;
    v_delta := round(-v_impact_max * p_roll / 100.0);
    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
      'kind', 'relation_delta',
      'country_id', v_action.country_id,
      'target_country_id', v_action.target_country_id,
      'delta', v_delta
    ));
  ELSIF v_action_key = 'ouverture_diplomatique' THEN
    IF v_action.target_country_id IS NULL THEN
      RAISE EXCEPTION 'Pays cible manquant.';
    END IF;
    v_delta := round(v_impact_max * p_roll / 100.0);
    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
      'kind', 'relation_delta',
      'country_id', v_action.country_id,
      'target_country_id', v_action.target_country_id,
      'delta', v_delta
    ));
  ELSIF v_action_key = 'prise_influence' THEN
    IF v_action.target_country_id IS NULL THEN
      RAISE EXCEPTION 'Pays cible manquant.';
    END IF;
    v_delta := round(COALESCE((v_params->>'impact_maximum')::numeric, 100) * p_roll / 100.0);
    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
      'kind', 'control_delta',
      'country_id', v_action.target_country_id,
      'controller_country_id', v_action.country_id,
      'delta', v_delta
    ));
  ELSIF v_action_key = 'espionnage' THEN
    IF v_action.target_country_id IS NULL THEN
      RAISE EXCEPTION 'Pays cible manquant.';
    END IF;
    v_intel_config := v_action.world_snapshot->'intel_config';
    IF jsonb_typeof(v_intel_config) <> 'object' THEN
      RAISE EXCEPTION 'Configuration initiale du renseignement introuvable.';
    END IF;
    v_delta := round(
      COALESCE((v_intel_config->>'espionage_intel_gain_base')::numeric, 50)
      * p_roll / 100.0
    );
    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
      'kind', 'intel_delta',
      'observer_country_id', v_action.country_id,
      'target_country_id', v_action.target_country_id,
      'delta', GREATEST(0, LEAST(100, v_delta))
    ));
  END IF;

  v_effects := public.normalize_rp_action_effects(
    v_action.admin_effect_added,
    v_action.country_id,
    v_action.target_country_id
  );
  FOR v_effect IN SELECT value FROM jsonb_array_elements(v_effects) LOOP
    v_kind := v_effect->>'effect_kind';
    v_application := COALESCE(v_effect->>'application', 'duration');
    v_scope := COALESCE(v_effect->>'scope', 'emitter');
    v_effect_country_id := CASE
      WHEN v_scope = 'target' THEN v_action.target_country_id
      ELSE v_action.country_id
    END;
    v_snapshot := CASE
      WHEN v_scope = 'target' THEN v_action.world_snapshot->'target'
      ELSE v_action.world_snapshot->'emitter'
    END;
    v_delta := GREATEST(-1000, LEAST(1000, COALESCE((v_effect->>'value')::numeric, 0)));
    IF NULLIF(v_effect->>'name', '') IS NULL OR NULLIF(v_kind, '') IS NULL THEN
      RAISE EXCEPTION 'Effet MJ incomplet.';
    END IF;

    IF v_application <> 'immediate' THEN
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'kind', 'effect_insert',
        'effect', jsonb_build_object(
          'id', gen_random_uuid(),
          'country_id', v_effect_country_id,
          'name', v_effect->>'name',
          'effect_kind', v_kind,
          'effect_target', v_effect->>'effect_target',
          'effect_subtype', v_effect->>'effect_subtype',
          'value', GREATEST(-1000, LEAST(1000, COALESCE((v_effect->>'value')::numeric, 0))),
          'duration_kind', COALESCE(v_effect->>'duration_kind', 'days'),
          'duration_remaining', CASE
            WHEN COALESCE(v_effect->>'duration_kind', 'days') = 'permanent' THEN 0
            ELSE GREATEST(0, LEAST(100, COALESCE((v_effect->>'duration_remaining')::integer, 0)))
          END
        )
      ));
      CONTINUE;
    END IF;

    IF v_kind = 'military_unit_extra' THEN
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'kind', 'military_unit_delta',
        'country_id', v_effect_country_id,
        'roster_unit_id', v_effect->>'effect_target',
        'extra_count_delta', round(v_delta),
        'current_level_delta', 0
      ));
    ELSIF v_kind = 'military_unit_tech_rate' THEN
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'kind', 'military_unit_delta',
        'country_id', v_effect_country_id,
        'roster_unit_id', v_effect->>'effect_target',
        'extra_count_delta', 0,
        'current_level_delta', round(v_delta)
      ));
    ELSIF v_kind = 'stat_delta' THEN
      v_column := v_effect->>'effect_target';
      IF v_column NOT IN ('militarism', 'industry', 'science', 'stability') THEN
        RAISE EXCEPTION 'Stat immédiate non autorisée : %', v_column;
      END IF;
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'kind', 'country_delta',
        'country_id', v_effect_country_id,
        'column', v_column,
        'delta', v_delta
      ));
    ELSIF v_kind = 'relation_delta' THEN
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'kind', 'relation_delta',
        'country_id', v_effect_country_id,
        'target_country_id', (v_effect->>'effect_target')::uuid,
        'delta', v_delta
      ));
    ELSIF v_kind LIKE 'ideology_snap_%' THEN
      v_ideology_key := 'ideology_' || substring(v_kind FROM char_length('ideology_snap_') + 1);
      IF NOT (v_ideology_key = ANY(v_ideology_keys)) THEN
        RAISE EXCEPTION 'Idéologie inconnue : %', v_kind;
      END IF;
      v_normalized_scores := public.normalize_rp_ideology_scores(v_snapshot, NULL, false);
      v_shifted_scores := jsonb_set(
        v_normalized_scores,
        ARRAY[v_ideology_key],
        to_jsonb(COALESCE((v_normalized_scores->>v_ideology_key)::numeric, 0) + v_delta)
      );
      v_final_scores := public.normalize_rp_ideology_scores(
        v_shifted_scores,
        v_ideology_key,
        true
      );
      FOREACH v_ideology_key IN ARRAY v_ideology_keys LOOP
        v_current := COALESCE((v_snapshot->>v_ideology_key)::numeric, 0);
        v_actual := COALESCE((v_final_scores->>v_ideology_key)::numeric, 0) - v_current;
        v_plan := v_plan || jsonb_build_array(jsonb_build_object(
          'kind', 'country_delta',
          'country_id', v_effect_country_id,
          'column', v_ideology_key,
          'delta', v_actual
        ));
      END LOOP;
    ELSE
      RAISE EXCEPTION 'Effet immédiat non géré par le registre : %', v_kind;
    END IF;
  END LOOP;

  RETURN v_plan;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_lore_article(
  p_article_id uuid,
  p_title text,
  p_description text,
  p_sections jsonb,
  p_expected_state jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article public.lore_articles%ROWTYPE;
  v_action public.ai_event_requests%ROWTYPE;
  v_target_version integer;
  v_attempt smallint;
  v_output jsonb;
  v_text text;
  v_embed_chars integer;
  v_expected_roll integer;
  v_generated_roll integer;
  v_initial_action_id uuid;
  v_initial_source_ids uuid[];
  v_current_sources jsonb;
  v_current_countries jsonb;
  v_publication_job_id uuid;
  v_new_article_version integer;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  IF NULLIF(btrim(p_title), '') IS NULL OR NULLIF(btrim(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Titre et description obligatoires.';
  END IF;
  IF jsonb_typeof(p_sections) <> 'array' THEN
    RAISE EXCEPTION 'Les sections doivent être un tableau JSON.';
  END IF;
  IF jsonb_typeof(p_expected_state) <> 'object'
     OR COALESCE(jsonb_typeof(p_expected_state->'article_version'), '') <> 'number'
     OR COALESCE(jsonb_typeof(p_expected_state->'action_execution_version'), '') <> 'number'
     OR COALESCE(jsonb_typeof(p_expected_state->'action_updated_at'), '') <> 'string'
     OR COALESCE(jsonb_typeof(p_expected_state->'source_versions'), '') <> 'array'
     OR COALESCE(jsonb_typeof(p_expected_state->'countries'), '') <> 'array' THEN
    RAISE EXCEPTION 'État de validation manquant ou invalide.';
  END IF;
  IF jsonb_array_length(p_sections) > 25
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_sections) section
       WHERE jsonb_typeof(section) <> 'object'
          OR COALESCE(jsonb_typeof(section->'title'), '') <> 'string'
          OR COALESCE(jsonb_typeof(section->'body'), '') <> 'string'
          OR NULLIF(btrim(section->>'title'), '') IS NULL
          OR NULLIF(btrim(section->>'body'), '') IS NULL
          OR char_length(section->>'title') > 256
          OR char_length(section->>'body') > 1024
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(section) key
            WHERE key NOT IN ('title', 'body')
          )
     ) THEN
    RAISE EXCEPTION 'Structure de sections invalide.';
  END IF;
  SELECT char_length(p_title) + char_length(p_description) + 100
       + COALESCE(sum(char_length(section->>'title') + char_length(section->>'body')), 0)
  INTO v_embed_chars
  FROM jsonb_array_elements(p_sections) section;
  IF char_length(p_title) > 256
     OR char_length(p_description) > 4096
     OR char_length(p_description) + COALESCE((
       SELECT sum(char_length(section->>'body'))
       FROM jsonb_array_elements(p_sections) section
     ), 0) > 3500
     OR v_embed_chars > 6000 THEN
    RAISE EXCEPTION 'Article trop long.';
  END IF;

  v_text := lower(p_title || E'\n' || p_description || E'\n' || p_sections::text);
  IF v_text ~ '(@everyone|@here|<@!?[&]?[0-9]+>|```)' THEN
    RAISE EXCEPTION 'Mention Discord ou bloc de code interdit.';
  END IF;
  IF v_text ~ (
    '\m(nsfw|xxx|porn|porno|pornographie|sexuel|sexuelle|sexuellement|sexe|nudité|nudite|nue?|'
    || 'érotique|erotique|viol|violer|violé|viole|inceste|pédophil(e|ie)|pedophil(e|ie)|'
    || 'masturbation|fellation|sodomie|éjaculation|ejaculation|pénétration|penetration|'
    || 'génital|génitaux|genital|genitals?|pénis|penis|vagin|vagina|vulve|clitoris|sperme|semen|'
    || 'hentai|onlyfans|sexual|intercourse|copulation|bondage|fétiche|fetiche|'
    || 'prostitution|nude|naked|rape|pedophil(e|ia|ic)|masturbat(e|ion)|'
    || 'blowjob|sodomy|erotic|orgasm(e|s)?|orgie|coït|coit)\M'
  ) THEN
    RAISE EXCEPTION 'Contenu NSFW interdit.';
  END IF;

  SELECT action_id, source_ids
  INTO v_initial_action_id, v_initial_source_ids
  FROM public.lore_articles
  WHERE id = p_article_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article introuvable.';
  END IF;
  IF v_initial_action_id IS NULL THEN
    RAISE EXCEPTION 'Action liée introuvable.';
  END IF;

  SELECT * INTO v_action
  FROM public.ai_event_requests
  WHERE id = v_initial_action_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action liée introuvable.';
  END IF;

  PERFORM 1
  FROM public.lore_articles
  WHERE id = p_article_id OR id = ANY(COALESCE(v_initial_source_ids, '{}'::uuid[]))
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_article
  FROM public.lore_articles
  WHERE id = p_article_id;
  IF v_article.action_id IS DISTINCT FROM v_action.id
     OR v_article.source_ids IS DISTINCT FROM v_initial_source_ids THEN
    RAISE EXCEPTION 'Les sources de l''article ont changé ; rechargez la page.';
  END IF;

  PERFORM 1 FROM public.countries ORDER BY id FOR SHARE;
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', source.id, 'current_version', source.current_version)
      ORDER BY source.id
    ),
    '[]'::jsonb
  )
  INTO v_current_sources
  FROM public.lore_articles source
  WHERE source.id = ANY(COALESCE(v_article.source_ids, '{}'::uuid[]));
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', country.id, 'name', country.name) ORDER BY country.id),
    '[]'::jsonb
  )
  INTO v_current_countries
  FROM public.countries country;

  IF v_article.current_version IS DISTINCT FROM (p_expected_state->>'article_version')::integer
     OR v_action.updated_at IS DISTINCT FROM (p_expected_state->>'action_updated_at')::timestamptz
     OR jsonb_array_length(v_current_sources) <> cardinality(v_article.source_ids)
     OR v_current_sources IS DISTINCT FROM p_expected_state->'source_versions'
     OR v_current_countries IS DISTINCT FROM p_expected_state->'countries' THEN
    RAISE EXCEPTION 'Les faits ou les sources ont changé ; rechargez puis revalidez l''article.';
  END IF;

  PERFORM 1
  FROM public.rp_pipeline_jobs
  WHERE lore_article_id = p_article_id
    AND job_type = 'publish_discord'
    AND status IN ('pending', 'running', 'retry', 'warning')
  ORDER BY id
  FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM public.rp_pipeline_jobs
    WHERE lore_article_id = p_article_id
      AND job_type = 'publish_discord'
      AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'Une livraison Discord est en cours ; réessayez après sa fin.';
  END IF;

  IF v_article.action_id IS NOT NULL THEN
    v_target_version := COALESCE(
      v_action.pending_execution_version,
      CASE
        WHEN v_action.consequences_applied_at IS NULL THEN v_action.execution_version + 1
        ELSE GREATEST(v_action.execution_version, 1)
      END
    );
    IF v_target_version IS DISTINCT FROM
       (p_expected_state->>'action_execution_version')::integer THEN
      RAISE EXCEPTION 'La version de l''action a changé ; rechargez puis revalidez l''article.';
    END IF;
    v_expected_roll := COALESCE(
      (v_action.pending_dice_results->'success_roll'->>'total')::integer,
      v_action.d100_roll
    );
    SELECT (version.fact_sheet->'jet'->'success_roll'->>'total')::integer
    INTO v_generated_roll
    FROM public.lore_article_versions version
    WHERE version.lore_article_id = p_article_id
      AND version.action_execution_version = v_target_version
      AND version.stage IN ('analysis', 'draft', 'final')
    ORDER BY version.created_at DESC, version.attempt_no DESC
    LIMIT 1;
    IF (
         v_generated_roll IS DISTINCT FROM v_expected_roll
         OR (v_generated_roll IS NULL AND v_action.pending_execution_version IS NOT NULL)
         OR (
           v_action.pending_execution_version IS NOT NULL
           AND v_article.approved_for_execution_version IS DISTINCT FROM v_target_version
         )
       )
       AND btrim(p_title) = v_article.title
       AND btrim(p_description) = v_article.description
       AND p_sections = v_article.sections THEN
      RAISE EXCEPTION 'L''article doit être réécrit pour le jet courant.';
    END IF;
  ELSE
    v_target_version := GREATEST(COALESCE(v_article.approved_for_execution_version, 1), 1);
  END IF;

  SELECT COALESCE(max(attempt_no), 0) + 1
  INTO v_attempt
  FROM public.lore_article_versions
  WHERE lore_article_id = p_article_id
    AND action_execution_version = v_target_version
    AND stage = 'manual';

  v_output := jsonb_build_object(
    'title', btrim(p_title),
    'description', btrim(p_description),
    'sections', p_sections
  );

  INSERT INTO public.lore_article_versions (
    lore_article_id, action_execution_version, stage, attempt_no,
    output, clean_content, source_ids, fact_sheet, created_by
  ) VALUES (
    p_article_id, v_target_version, 'manual', v_attempt,
    v_output, btrim(p_description), v_article.source_ids,
    COALESCE(v_action.context_fact_sheet, '{}'::jsonb), (SELECT auth.uid())
  );

  UPDATE public.lore_articles
  SET
    title = btrim(p_title),
    description = btrim(p_description),
    sections = p_sections,
    clean_content = btrim(p_description),
    current_output = v_output,
    current_version = current_version + 1,
    editorial_status = 'approved',
    classification_status = CASE
      WHEN source_kind = 'unclassified' THEN 'ambiguous'
      WHEN classification_status = 'quarantined' THEN 'classified'
      ELSE classification_status
    END,
    approved_for_execution_version = v_target_version,
    nsfw_quarantined = false,
    quarantine_reason = NULL
  WHERE id = p_article_id;
  v_new_article_version := v_article.current_version + 1;

  IF v_article.action_id IS NOT NULL THEN
    UPDATE public.ai_event_requests
    SET
      article_approved_at = now(),
      execution_status = CASE
        WHEN pending_execution_version IS NOT NULL THEN 'ready'
        WHEN consequences_applied_at IS NULL THEN 'ready'
        ELSE execution_status
      END
    WHERE id = v_article.action_id;

    UPDATE public.rp_pipeline_jobs
    SET
      payload = payload || jsonb_build_object('approved', true),
      status = 'pending',
      attempt_count = 0,
      next_attempt_at = now(),
      locked_at = NULL,
      locked_by = NULL,
      last_error = NULL,
      finished_at = NULL
    WHERE id = (
      SELECT id
      FROM public.rp_pipeline_jobs
      WHERE action_id = v_article.action_id
        AND job_type = 'generate_article'
        AND status IN ('review', 'warning')
      ORDER BY created_at DESC
      LIMIT 1
    );

    IF v_action.consequences_applied_at IS NOT NULL
       AND v_action.pending_execution_version IS NULL
       AND (
         v_article.discord_message_id IS NOT NULL
         OR EXISTS (
           SELECT 1
           FROM public.rp_pipeline_jobs publication
           WHERE publication.action_id = v_article.action_id
             AND publication.job_type = 'publish_discord'
             AND publication.status IN ('pending', 'running', 'retry', 'warning')
         )
       ) THEN
      SELECT id INTO v_publication_job_id
      FROM public.rp_pipeline_jobs
      WHERE lore_article_id = p_article_id
        AND job_type = 'publish_discord'
        AND status IN ('pending', 'retry', 'warning')
      ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'retry' THEN 1 ELSE 2 END, created_at
      LIMIT 1;

      IF v_publication_job_id IS NOT NULL THEN
        UPDATE public.rp_pipeline_jobs
        SET
          payload = jsonb_build_object(
            'edit_existing', v_article.discord_message_id IS NOT NULL,
            'execution_version', v_target_version,
            'article_version', v_new_article_version
          ),
          status = 'pending',
          attempt_count = 0,
          next_attempt_at = now(),
          locked_at = NULL,
          locked_by = NULL,
          last_error = NULL,
          finished_at = NULL
        WHERE id = v_publication_job_id;
      ELSE
        INSERT INTO public.rp_pipeline_jobs (
          job_type, action_id, lore_article_id, payload, priority, idempotency_key
        ) VALUES (
          'publish_discord',
          v_article.action_id,
          p_article_id,
          jsonb_build_object(
            'edit_existing', v_article.discord_message_id IS NOT NULL,
            'execution_version', v_target_version,
            'article_version', v_new_article_version
          ),
          10,
          'publish:' || p_article_id || ':edit:' || v_new_article_version
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_publication_job_id;

        IF v_publication_job_id IS NULL THEN
          RAISE EXCEPTION 'Une livraison Discord concurrente vient de démarrer ; réessayez.';
        END IF;
      END IF;

      UPDATE public.rp_pipeline_jobs
      SET
        status = 'cancelled',
        locked_at = NULL,
        locked_by = NULL,
        finished_at = now()
      WHERE lore_article_id = p_article_id
        AND job_type = 'publish_discord'
        AND status = 'warning'
        AND id <> v_publication_job_id;

      UPDATE public.ai_event_requests
      SET execution_status = 'publishing'
      WHERE id = v_article.action_id;
    END IF;

  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_discord_lore_article(
  p_article jsonb,
  p_country_links jsonb,
  p_tag_keys text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article_id uuid;
  v_classification_locked boolean;
  v_source_platform text;
  v_source_kind text := p_article->>'source_kind';
  v_editorial_status text := p_article->>'editorial_status';
  v_classification_status text := p_article->>'classification_status';
  v_channel_id text := p_article->>'discord_channel_id';
  v_message_id text := p_article->>'discord_message_id';
  v_nsfw boolean := COALESCE((p_article->>'nsfw_quarantined')::boolean, false);
  v_unknown_tag text;
BEGIN
  IF COALESCE((SELECT auth.jwt())->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accès réservé au collecteur Discord.';
  END IF;
  IF jsonb_typeof(p_article) <> 'object'
     OR jsonb_typeof(p_country_links) <> 'array'
     OR jsonb_array_length(p_country_links) > 50
     OR v_source_kind NOT IN ('official', 'player', 'unclassified')
     OR v_editorial_status NOT IN ('review', 'approved', 'quarantined')
     OR v_classification_status NOT IN ('classified', 'ambiguous', 'quarantined')
     OR COALESCE(v_channel_id, '') !~ '^[0-9]+$'
     OR COALESCE(v_message_id, '') !~ '^[0-9]+$'
     OR COALESCE(p_article->>'discord_guild_id', '') !~ '^[0-9]+$'
     OR jsonb_typeof(COALESCE(p_article->'sections', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_article->'embeds', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_article->'links', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_article->'current_output', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Article Discord invalide.';
  END IF;
  IF cardinality(COALESCE(p_tag_keys, '{}'::text[])) > 20
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_country_links) link
       WHERE jsonb_typeof(link) <> 'object'
          OR COALESCE(link->>'country_id', '') !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          OR link->>'relation_role' NOT IN ('author', 'target', 'mentioned')
     ) THEN
    RAISE EXCEPTION 'Classement Discord invalide.';
  END IF;
  SELECT requested INTO v_unknown_tag
  FROM unnest(COALESCE(p_tag_keys, '{}'::text[])) requested
  WHERE NOT EXISTS (SELECT 1 FROM public.lore_tags WHERE key = requested)
  LIMIT 1;
  IF v_unknown_tag IS NOT NULL THEN
    RAISE EXCEPTION 'Tag contrôlé inconnu : %', v_unknown_tag;
  END IF;

  INSERT INTO public.lore_articles (
    source_kind,
    source_platform,
    title,
    description,
    sections,
    raw_content,
    clean_content,
    current_output,
    discord_route_id,
    discord_guild_id,
    discord_channel_id,
    discord_message_id,
    discord_author_user_id,
    discord_author_name,
    discord_webhook_id,
    discord_is_bot,
    embeds,
    links,
    real_published_at,
    source_edited_at,
    rp_year,
    rp_month,
    rp_day,
    rp_week,
    editorial_status,
    classification_status,
    nsfw_quarantined,
    quarantine_reason,
    content_hash,
    deleted_at
  ) VALUES (
    v_source_kind,
    'discord',
    COALESCE(p_article->>'title', ''),
    COALESCE(p_article->>'description', ''),
    COALESCE(p_article->'sections', '[]'::jsonb),
    COALESCE(p_article->>'raw_content', ''),
    COALESCE(p_article->>'clean_content', ''),
    COALESCE(p_article->'current_output', '{}'::jsonb),
    NULLIF(p_article->>'discord_route_id', '')::uuid,
    p_article->>'discord_guild_id',
    v_channel_id,
    v_message_id,
    NULLIF(p_article->>'discord_author_user_id', ''),
    NULLIF(p_article->>'discord_author_name', ''),
    NULLIF(p_article->>'discord_webhook_id', ''),
    COALESCE((p_article->>'discord_is_bot')::boolean, false),
    COALESCE(p_article->'embeds', '[]'::jsonb),
    ARRAY(
      SELECT value
      FROM jsonb_array_elements_text(COALESCE(p_article->'links', '[]'::jsonb)) value
    ),
    NULLIF(p_article->>'real_published_at', '')::timestamptz,
    NULLIF(p_article->>'source_edited_at', '')::timestamptz,
    NULLIF(p_article->>'rp_year', '')::integer,
    NULLIF(p_article->>'rp_month', '')::smallint,
    NULLIF(p_article->>'rp_day', '')::smallint,
    NULLIF(p_article->>'rp_week', '')::smallint,
    v_editorial_status,
    v_classification_status,
    v_nsfw,
    NULLIF(p_article->>'quarantine_reason', ''),
    NULLIF(p_article->>'content_hash', ''),
    NULLIF(p_article->>'deleted_at', '')::timestamptz
  )
  ON CONFLICT (discord_channel_id, discord_message_id)
    WHERE discord_message_id IS NOT NULL
  DO UPDATE SET
    source_kind = CASE
      WHEN lore_articles.classification_locked THEN lore_articles.source_kind
      ELSE EXCLUDED.source_kind
    END,
    source_platform = 'discord',
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    sections = EXCLUDED.sections,
    raw_content = EXCLUDED.raw_content,
    clean_content = EXCLUDED.clean_content,
    current_output = EXCLUDED.current_output,
    discord_route_id = EXCLUDED.discord_route_id,
    discord_guild_id = EXCLUDED.discord_guild_id,
    discord_author_user_id = EXCLUDED.discord_author_user_id,
    discord_author_name = EXCLUDED.discord_author_name,
    discord_webhook_id = EXCLUDED.discord_webhook_id,
    discord_is_bot = EXCLUDED.discord_is_bot,
    embeds = EXCLUDED.embeds,
    links = EXCLUDED.links,
    real_published_at = EXCLUDED.real_published_at,
    source_edited_at = EXCLUDED.source_edited_at,
    rp_year = EXCLUDED.rp_year,
    rp_month = EXCLUDED.rp_month,
    rp_day = EXCLUDED.rp_day,
    rp_week = EXCLUDED.rp_week,
    editorial_status = CASE
      WHEN EXCLUDED.nsfw_quarantined THEN 'quarantined'
      WHEN lore_articles.classification_locked THEN 'approved'
      ELSE EXCLUDED.editorial_status
    END,
    classification_status = CASE
      WHEN EXCLUDED.nsfw_quarantined THEN 'quarantined'
      WHEN lore_articles.classification_locked THEN 'classified'
      ELSE EXCLUDED.classification_status
    END,
    nsfw_quarantined = EXCLUDED.nsfw_quarantined,
    quarantine_reason = EXCLUDED.quarantine_reason,
    content_hash = EXCLUDED.content_hash,
    deleted_at = EXCLUDED.deleted_at
  WHERE lore_articles.source_platform <> 'engine'
    AND lore_articles.action_id IS NULL
  RETURNING id, classification_locked, source_platform
  INTO v_article_id, v_classification_locked, v_source_platform;

  IF v_article_id IS NULL THEN
    SELECT id, classification_locked, source_platform
    INTO v_article_id, v_classification_locked, v_source_platform
    FROM public.lore_articles
    WHERE discord_channel_id = v_channel_id
      AND discord_message_id = v_message_id
    FOR UPDATE;
  END IF;
  IF v_article_id IS NULL THEN
    RAISE EXCEPTION 'Archivage Discord concurrent impossible.';
  END IF;
  IF v_source_platform = 'engine' OR v_classification_locked THEN
    RETURN v_article_id;
  END IF;

  DELETE FROM public.lore_article_countries WHERE lore_article_id = v_article_id;
  INSERT INTO public.lore_article_countries (lore_article_id, country_id, relation_role)
  SELECT DISTINCT
    v_article_id,
    (link->>'country_id')::uuid,
    link->>'relation_role'
  FROM jsonb_array_elements(p_country_links) link
  ON CONFLICT DO NOTHING;

  DELETE FROM public.lore_article_tags WHERE lore_article_id = v_article_id;
  INSERT INTO public.lore_article_tags (lore_article_id, tag_id)
  SELECT v_article_id, tag.id
  FROM public.lore_tags tag
  WHERE tag.key = ANY(COALESCE(p_tag_keys, '{}'::text[]))
  ON CONFLICT DO NOTHING;

  RETURN v_article_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_rp_action_consequences(
  p_action_id uuid,
  p_expected_version integer,
  p_roll integer,
  p_operations jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.ai_event_requests%ROWTYPE;
  v_article_id uuid;
  v_new_version integer;
  v_outcome text;
  v_publish_failures boolean;
  v_should_publish boolean;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  v_outcome := public.rp_d100_outcome(p_roll);

  SELECT * INTO v_action
  FROM public.ai_event_requests
  WHERE id = p_action_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action introuvable.';
  END IF;

  -- Réponse idempotente à une répétition réseau après commit.
  IF v_action.execution_version = p_expected_version + 1
     AND v_action.consequences_applied_at IS NOT NULL
     AND v_action.d100_roll = p_roll THEN
    RETURN v_action.execution_version;
  END IF;

  IF v_action.execution_version <> p_expected_version
     OR v_action.consequences_applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Version d''action obsolète.';
  END IF;
  IF v_action.d100_roll IS DISTINCT FROM p_roll THEN
    RAISE EXCEPTION 'Le jet fourni ne correspond pas au jet ayant servi à rédiger l''article.';
  END IF;
  IF v_action.consequence_plan IS DISTINCT FROM p_operations THEN
    RAISE EXCEPTION 'Le plan fourni ne correspond pas au plan mécanique validé.';
  END IF;

  v_new_version := p_expected_version + 1;
  SELECT id INTO v_article_id
  FROM public.lore_articles
  WHERE action_id = p_action_id
    AND editorial_status = 'approved'
    AND approved_for_execution_version = v_new_version
  FOR UPDATE;
  IF v_article_id IS NULL THEN
    RAISE EXCEPTION 'Article approuvé manquant pour la version %.', v_new_version;
  END IF;

  UPDATE public.ai_event_requests
  SET execution_status = 'applying'
  WHERE id = p_action_id;

  PERFORM public._rp_apply_consequence_plan(p_action_id, v_new_version, p_operations);

  v_publish_failures := COALESCE(
    (v_action.world_snapshot #>> '{action,publish_failures}')::boolean,
    true
  );
  v_should_publish := v_outcome LIKE '%success' OR COALESCE(v_publish_failures, true);

  UPDATE public.ai_event_requests
  SET
    d100_roll = p_roll,
    d100_outcome = v_outcome,
    dice_results = jsonb_build_object(
      'success_roll', jsonb_build_object('roll', p_roll, 'modifier', 0, 'total', p_roll),
      'outcome', v_outcome
    ),
    consequence_plan = p_operations,
    execution_version = v_new_version,
    consequences_applied_at = now(),
    execution_status = CASE WHEN v_should_publish THEN 'publishing' ELSE 'completed' END
  WHERE id = p_action_id;

  IF v_should_publish THEN
    INSERT INTO public.rp_pipeline_jobs (
      job_type, action_id, lore_article_id, payload, priority, idempotency_key
    ) VALUES (
      'publish_discord',
      p_action_id,
      v_article_id,
      jsonb_build_object('execution_version', v_new_version),
      50,
      'publish:' || v_article_id || ':v' || v_new_version
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_new_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_rp_action_roll(
  p_action_id uuid,
  p_expected_version integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.ai_event_requests%ROWTYPE;
  v_entry public.action_execution_ledger%ROWTYPE;
  v_article_id uuid;
  v_target_version integer;
  v_roll integer;
  v_outcome text;
  v_publish_failures boolean;
  v_should_publish boolean;
  v_existing_message_id text;
  v_needs_discord boolean;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  SELECT * INTO v_action
  FROM public.ai_event_requests
  WHERE id = p_action_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action introuvable.';
  END IF;
  IF v_action.execution_version = p_expected_version + 1
     AND v_action.pending_execution_version IS NULL
     AND v_action.consequences_recalculated_at IS NOT NULL THEN
    RETURN v_action.execution_version;
  END IF;
  IF v_action.execution_version <> p_expected_version
     OR v_action.consequences_applied_at IS NULL THEN
    RAISE EXCEPTION 'Version d''action obsolète ou non exécutée.';
  END IF;

  v_target_version := p_expected_version + 1;
  IF v_action.pending_execution_version <> v_target_version
     OR v_action.pending_dice_results IS NULL
     OR jsonb_typeof(v_action.pending_consequence_plan) <> 'array' THEN
    RAISE EXCEPTION 'Nouveau jet non préparé.';
  END IF;

  v_roll := (v_action.pending_dice_results->'success_roll'->>'total')::integer;
  v_outcome := public.rp_d100_outcome(v_roll);

  SELECT id, discord_message_id INTO v_article_id, v_existing_message_id
  FROM public.lore_articles
  WHERE action_id = p_action_id
    AND editorial_status = 'approved'
    AND approved_for_execution_version = v_target_version
  FOR UPDATE;
  IF v_article_id IS NULL THEN
    RAISE EXCEPTION 'Nouvel article approuvé manquant.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('rp:world-tick', 0));
  PERFORM public._rp_assert_action_revertible(
    p_action_id,
    p_expected_version
  );

  PERFORM 1
  FROM public.rp_pipeline_jobs
  WHERE lore_article_id = v_article_id
    AND job_type = 'publish_discord'
    AND status IN ('pending', 'running', 'retry')
  FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM public.rp_pipeline_jobs
    WHERE lore_article_id = v_article_id
      AND job_type = 'publish_discord'
      AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'Une livraison Discord est encore en cours pour cet article.';
  END IF;
  UPDATE public.rp_pipeline_jobs
  SET
    status = 'cancelled',
    finished_at = now(),
    locked_at = NULL,
    locked_by = NULL
  WHERE lore_article_id = v_article_id
    AND job_type = 'publish_discord'
    AND status IN ('pending', 'retry');

  UPDATE public.ai_event_requests SET execution_status = 'applying' WHERE id = p_action_id;

  FOR v_entry IN
    SELECT *
    FROM public.action_execution_ledger
    WHERE action_id = p_action_id
      AND execution_version = p_expected_version
      AND reverted_at IS NULL
    ORDER BY sequence_no DESC
    FOR UPDATE
  LOOP
    PERFORM public._rp_revert_consequence_entry(
      v_entry.target_table,
      v_entry.target_key,
      v_entry.before_state,
      v_entry.after_state
    );
    UPDATE public.action_execution_ledger
    SET reverted_at = now()
    WHERE id = v_entry.id;
  END LOOP;

  PERFORM public._rp_apply_consequence_plan(
    p_action_id,
    v_target_version,
    v_action.pending_consequence_plan
  );

  v_publish_failures := COALESCE(
    (v_action.world_snapshot #>> '{action,publish_failures}')::boolean,
    true
  );
  v_should_publish := v_outcome LIKE '%success' OR COALESCE(v_publish_failures, true);
  v_needs_discord := v_should_publish OR v_existing_message_id IS NOT NULL;

  UPDATE public.ai_event_requests
  SET
    d100_roll = v_roll,
    d100_outcome = v_outcome,
    dice_results = pending_dice_results,
    consequence_plan = pending_consequence_plan,
    execution_version = v_target_version,
    pending_dice_results = NULL,
    pending_consequence_plan = NULL,
    pending_execution_version = NULL,
    consequences_recalculated_at = now(),
    execution_status = CASE WHEN v_needs_discord THEN 'publishing' ELSE 'completed' END
  WHERE id = p_action_id;

  IF v_should_publish THEN
    INSERT INTO public.rp_pipeline_jobs (
      job_type, action_id, lore_article_id, payload, priority, idempotency_key
    ) VALUES (
      'publish_discord',
      p_action_id,
      v_article_id,
      jsonb_build_object(
        'execution_version', v_target_version,
        'edit_existing', v_existing_message_id IS NOT NULL
      ),
      10,
      'publish:' || v_article_id || ':v' || v_target_version
    )
    ON CONFLICT DO NOTHING;
  ELSIF v_existing_message_id IS NOT NULL THEN
    INSERT INTO public.rp_pipeline_jobs (
      job_type, action_id, lore_article_id, payload, priority, idempotency_key
    ) VALUES (
      'publish_discord',
      p_action_id,
      v_article_id,
      jsonb_build_object(
        'execution_version', v_target_version,
        'delete_existing', true,
        'discord_message_id', v_existing_message_id
      ),
      10,
      'publish:' || v_article_id || ':delete:v' || v_target_version
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_target_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_rp_action_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.action_automation_configs%ROWTYPE;
  v_action public.state_action_types%ROWTYPE;
  v_emitter public.countries%ROWTYPE;
  v_target public.countries%ROWTYPE;
  v_world_date jsonb;
  v_intel_config jsonb;
  v_rp_date record;
BEGIN
  PERFORM public._rp_assert_ideology_persistence_idle();

  SELECT * INTO v_config
  FROM public.action_automation_configs
  WHERE action_type_id = NEW.action_type_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuration d''automatisation manquante pour le type d''action.';
  END IF;

  SELECT * INTO v_action FROM public.state_action_types WHERE id = NEW.action_type_id;
  SELECT * INTO v_emitter FROM public.countries WHERE id = NEW.country_id;
  IF v_action.id IS NULL OR v_emitter.id IS NULL THEN
    RAISE EXCEPTION 'Type d''action ou pays émetteur introuvable.';
  END IF;

  IF NEW.target_country_id IS NULL
     AND COALESCE(NEW.payload->>'target_country_id', '') ~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    NEW.target_country_id := (NEW.payload->>'target_country_id')::uuid;
  END IF;
  IF NEW.target_country_id IS NOT NULL THEN
    SELECT * INTO v_target FROM public.countries WHERE id = NEW.target_country_id;
    IF v_target.id IS NULL THEN
      RAISE EXCEPTION 'Pays cible introuvable.';
    END IF;
    NEW.payload := COALESCE(NEW.payload, '{}'::jsonb)
      || jsonb_build_object('target_country_id', NEW.target_country_id);
  ELSIF v_config.requires_target THEN
    RAISE EXCEPTION 'Ce type d''action exige un pays cible.';
  END IF;
  NEW.admin_effect_added := public.normalize_rp_action_effects(
    NEW.admin_effect_added,
    NEW.country_id,
    NEW.target_country_id
  );

  NEW.roll_mode := v_config.roll_mode;
  NEW.validation_mode := v_config.validation_mode;
  NEW.article_profile := v_config.article_profile;
  IF NEW.source = 'manual' THEN
    NEW.manual_preconditions_bypassed := true;
  END IF;
  IF NEW.status = 'accepted' THEN
    NEW.decision_status := 'approved';
  ELSIF NEW.status = 'refused' THEN
    NEW.decision_status := 'rejected';
  END IF;

  IF NEW.decision_status = 'approved' AND NEW.roll_mode = 'auto' AND NEW.d100_roll IS NULL THEN
    NEW.d100_roll := 1 + floor(random() * 100)::integer;
  END IF;
  IF NEW.d100_roll IS NOT NULL THEN
    NEW.d100_outcome := public.rp_d100_outcome(NEW.d100_roll);
    NEW.dice_results := jsonb_build_object(
      'success_roll', jsonb_build_object(
        'roll', NEW.d100_roll, 'modifier', 0, 'total', NEW.d100_roll
      ),
      'outcome', NEW.d100_outcome
    );
  END IF;

  NEW.execution_status := CASE
    WHEN NEW.decision_status = 'rejected' THEN 'cancelled'
    WHEN NEW.decision_status <> 'approved' THEN 'waiting_decision'
    WHEN NEW.d100_roll IS NULL THEN 'waiting_roll'
    ELSE 'waiting_article'
  END;

  IF NEW.world_snapshot = '{}'::jsonb THEN
    SELECT value INTO v_world_date
    FROM public.rule_parameters
    WHERE key = 'world_date';
    SELECT value INTO v_intel_config
    FROM public.rule_parameters
    WHERE key = 'intel_config';
    SELECT * INTO v_rp_date FROM public.get_probable_rp_date(COALESCE(NEW.created_at, now()));
    NEW.world_snapshot := jsonb_build_object(
      'captured_at', COALESCE(NEW.created_at, now()),
      'world_date', v_world_date,
      'intel_config', COALESCE(v_intel_config, '{}'::jsonb),
      'roleplay_date', format(
        '%s-%s-%s',
        v_rp_date.rp_year,
        lpad(v_rp_date.rp_month::text, 2, '0'),
        lpad(v_rp_date.rp_day::text, 2, '0')
      ),
      'probable_rp_date', jsonb_build_object(
        'year', v_rp_date.rp_year,
        'month', v_rp_date.rp_month,
        'day', v_rp_date.rp_day,
        'week', v_rp_date.rp_week
      ),
      'emitter', jsonb_build_object(
        'id', v_emitter.id,
        'name', v_emitter.name,
        'continent_id', v_emitter.continent_id,
        'ai_status', v_emitter.ai_status,
        'stability', v_emitter.stability,
        'militarism', v_emitter.militarism,
        'industry', v_emitter.industry,
        'science', v_emitter.science,
        'ideology_germanic_monarchy', v_emitter.ideology_germanic_monarchy,
        'ideology_merina_monarchy', v_emitter.ideology_merina_monarchy,
        'ideology_french_republicanism', v_emitter.ideology_french_republicanism,
        'ideology_mughal_republicanism', v_emitter.ideology_mughal_republicanism,
        'ideology_nilotique_cultism', v_emitter.ideology_nilotique_cultism,
        'ideology_satoiste_cultism', v_emitter.ideology_satoiste_cultism
      ),
      'target', CASE WHEN NEW.target_country_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_target.id,
        'name', v_target.name,
        'continent_id', v_target.continent_id,
        'ai_status', v_target.ai_status,
        'stability', v_target.stability,
        'militarism', v_target.militarism,
        'industry', v_target.industry,
        'science', v_target.science,
        'ideology_germanic_monarchy', v_target.ideology_germanic_monarchy,
        'ideology_merina_monarchy', v_target.ideology_merina_monarchy,
        'ideology_french_republicanism', v_target.ideology_french_republicanism,
        'ideology_mughal_republicanism', v_target.ideology_mughal_republicanism,
        'ideology_nilotique_cultism', v_target.ideology_nilotique_cultism,
        'ideology_satoiste_cultism', v_target.ideology_satoiste_cultism
      ) END,
      'action', jsonb_build_object(
        'id', v_action.id,
        'key', v_action.key,
        'label', v_action.label_fr,
        'params', v_action.params_schema,
        'publish_failures', v_config.publish_failures
      ),
      'selection', NEW.payload->'selection'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_rp_article_after_action_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan jsonb;
  v_mechanics_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_mechanics_changed :=
      OLD.d100_roll IS DISTINCT FROM NEW.d100_roll
      OR OLD.admin_effect_added IS DISTINCT FROM NEW.admin_effect_added;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.decision_status IS DISTINCT FROM NEW.decision_status
     AND NEW.decision_status = 'rejected' THEN
    UPDATE public.rp_pipeline_jobs
    SET status = 'cancelled', finished_at = now(), locked_at = NULL, locked_by = NULL
    WHERE action_id = NEW.id
      AND status IN ('pending', 'retry', 'review', 'warning');
    RETURN NEW;
  END IF;

  IF NEW.decision_status = 'approved'
     AND NEW.d100_roll IS NOT NULL
     AND NEW.consequences_applied_at IS NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.decision_status IS DISTINCT FROM NEW.decision_status
       OR v_mechanics_changed
     ) THEN
    IF v_mechanics_changed THEN
      PERFORM 1
      FROM public.rp_pipeline_jobs
      WHERE action_id = NEW.id
        AND job_type = 'generate_article'
      FOR UPDATE;
      IF EXISTS (
        SELECT 1
        FROM public.rp_pipeline_jobs
        WHERE action_id = NEW.id
          AND job_type = 'generate_article'
          AND status = 'running'
      ) THEN
        RAISE EXCEPTION 'La rédaction Magnum est en cours ; réessayez après sa fin.';
      END IF;

      UPDATE public.lore_articles
      SET
        editorial_status = 'draft',
        approved_for_execution_version = NULL,
        nsfw_quarantined = false,
        quarantine_reason = NULL
      WHERE action_id = NEW.id
        AND source_platform = 'engine';
    END IF;

    v_plan := public.build_rp_action_consequence_plan(NEW.id, NEW.d100_roll);
    UPDATE public.ai_event_requests
    SET
      consequence_plan = v_plan,
      article_approved_at = CASE
        WHEN v_mechanics_changed THEN NULL
        ELSE article_approved_at
      END
    WHERE id = NEW.id
      AND (
        consequence_plan IS DISTINCT FROM v_plan
        OR (
          v_mechanics_changed
          AND article_approved_at IS NOT NULL
        )
      );

    INSERT INTO public.rp_pipeline_jobs (
      job_type, action_id, payload, priority, next_attempt_at, idempotency_key
    ) VALUES (
      'generate_article',
      NEW.id,
      jsonb_build_object('execution_version', NEW.execution_version + 1, 'recalculation', false),
      CASE NEW.importance WHEN 'major' THEN 10 ELSE 20 END,
      COALESCE(NEW.scheduled_trigger_at, now()),
      'article:' || NEW.id || ':v' || (NEW.execution_version + 1)
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      payload = EXCLUDED.payload,
      priority = EXCLUDED.priority,
      status = 'pending',
      attempt_count = 0,
      next_attempt_at = EXCLUDED.next_attempt_at,
      locked_at = NULL,
      locked_by = NULL,
      last_error = NULL,
      finished_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_rp_discord_publication(
  p_action_id uuid,
  p_article_id uuid,
  p_execution_version integer,
  p_route_id uuid,
  p_guild_id text,
  p_channel_id text,
  p_message_id text,
  p_webhook_id text,
  p_published_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.ai_event_requests%ROWTYPE;
  v_article public.lore_articles%ROWTYPE;
BEGIN
  IF COALESCE((SELECT auth.jwt())->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accès réservé au worker.';
  END IF;

  SELECT * INTO v_action
  FROM public.ai_event_requests
  WHERE id = p_action_id
  FOR UPDATE;
  SELECT * INTO v_article
  FROM public.lore_articles
  WHERE id = p_article_id
  FOR UPDATE;
  IF v_action.id IS NULL OR v_article.id IS NULL
     OR v_article.action_id IS DISTINCT FROM v_action.id
     OR v_article.source_platform <> 'engine'
     OR v_article.source_kind <> 'engine'
     OR v_article.editorial_status NOT IN ('approved', 'published')
     OR v_article.nsfw_quarantined
     OR v_action.consequences_applied_at IS NULL
     OR v_action.execution_version <> p_execution_version
     OR v_article.approved_for_execution_version <> p_execution_version THEN
    RAISE EXCEPTION 'Publication Discord incohérente.';
  END IF;

  -- Une collecte ayant gagné la course après le POST est une copie de cette même publication.
  DELETE FROM public.lore_articles
  WHERE id <> p_article_id
    AND discord_channel_id = p_channel_id
    AND discord_message_id = p_message_id
    AND source_platform = 'discord';

  UPDATE public.lore_articles
  SET
    editorial_status = 'published',
    published_output = current_output,
    published_version = current_version,
    discord_route_id = p_route_id,
    discord_guild_id = p_guild_id,
    discord_message_id = p_message_id,
    discord_channel_id = p_channel_id,
    discord_webhook_id = p_webhook_id,
    real_published_at = COALESCE(real_published_at, p_published_at, now()),
    deleted_at = NULL
  WHERE id = p_article_id;

  UPDATE public.ai_event_requests
  SET execution_status = 'completed'
  WHERE id = p_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_due_rp_actions(p_force boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_config jsonb;
  v_ai_config jsonb;
  v_last_run timestamptz;
  v_interval_hours numeric;
  v_importance text;
  v_count integer;
  v_index integer;
  v_created integer := 0;
  v_choice record;
  v_action_id uuid;
  v_amplitude_minutes integer;
  v_scheduled_at timestamptz;
  v_explanation text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('generate_due_rp_actions')) THEN
    RETURN 0;
  END IF;
  PERFORM public._rp_assert_ideology_persistence_idle();

  SELECT value INTO v_pipeline_config
  FROM public.rule_parameters
  WHERE key = 'rp_pipeline_config';
  IF NOT p_force AND NOT COALESCE((v_pipeline_config->>'enabled')::boolean, false) THEN
    RETURN 0;
  END IF;

  SELECT value INTO v_ai_config
  FROM public.rule_parameters
  WHERE key = 'ai_events_config';
  IF v_ai_config IS NULL THEN
    RETURN 0;
  END IF;

  v_interval_hours := COALESCE((v_ai_config->>'interval_hours')::numeric, 6);
  SELECT NULLIF(value #>> '{}', '')::timestamptz INTO v_last_run
  FROM public.rule_parameters
  WHERE key = 'ai_events_last_run';

  IF NOT p_force
     AND v_last_run IS NOT NULL
     AND now() - v_last_run < v_interval_hours * interval '1 hour' THEN
    RETURN 0;
  END IF;

  v_amplitude_minutes := GREATEST(
    0,
    COALESCE((v_ai_config->>'trigger_amplitude_minutes')::integer, 0)
  );

  FOREACH v_importance IN ARRAY ARRAY['major', 'minor'] LOOP
    v_count := CASE v_importance
      WHEN 'major' THEN GREATEST(0, COALESCE((v_ai_config->>'count_major_per_run')::integer, 0))
      ELSE GREATEST(0, COALESCE((v_ai_config->>'count_minor_per_run')::integer, 0))
    END;

    FOR v_index IN 1..v_count LOOP
      SELECT candidate.*
      INTO v_choice
      FROM (
        SELECT
          emitter.id AS emitter_id,
          target.id AS target_id,
          sat.id AS action_type_id,
          sat.key AS action_key,
          sat.label_fr AS action_label,
          cfg.weight,
          cfg.requires_target,
          cfg.preconditions,
          cfg.cooldown_hours,
          cfg.roll_mode,
          cfg.validation_mode,
          cfg.article_profile,
          COALESCE(rel.value, 0) AS relation_value
        FROM public.countries emitter
        JOIN public.action_automation_configs cfg
          ON CASE v_importance
            WHEN 'major' THEN cfg.enabled_for_major
            ELSE cfg.enabled_for_minor
          END
        JOIN public.state_action_types sat ON sat.id = cfg.action_type_id
        LEFT JOIN LATERAL (
          SELECT eligible_id AS target_id
          FROM unnest(
            public.get_eligible_ai_event_target_ids(emitter.id, v_ai_config, sat.key)
          ) AS eligible(eligible_id)
          WHERE cfg.requires_target
          UNION ALL
          SELECT NULL::uuid
          WHERE NOT cfg.requires_target
        ) AS eligible ON true
        LEFT JOIN public.countries target ON target.id = eligible.target_id
        LEFT JOIN public.country_relations rel
          ON cfg.requires_target
         AND rel.country_a_id = CASE WHEN emitter.id < target.id THEN emitter.id ELSE target.id END
         AND rel.country_b_id = CASE WHEN emitter.id < target.id THEN target.id ELSE emitter.id END
        WHERE emitter.ai_status = v_importance
          AND (NOT cfg.requires_target OR target.id IS NOT NULL)
          AND (
            COALESCE(jsonb_typeof(cfg.preconditions->'emitter_min_stability'), 'null') <> 'number'
            OR emitter.stability >= (cfg.preconditions->>'emitter_min_stability')::numeric
          )
          AND (
            COALESCE(jsonb_typeof(cfg.preconditions->'emitter_max_stability'), 'null') <> 'number'
            OR emitter.stability <= (cfg.preconditions->>'emitter_max_stability')::numeric
          )
          AND (
            NOT cfg.requires_target
            OR COALESCE(jsonb_typeof(cfg.preconditions->'target_min_stability'), 'null') <> 'number'
            OR target.stability >= (cfg.preconditions->>'target_min_stability')::numeric
          )
          AND (
            NOT cfg.requires_target
            OR COALESCE(jsonb_typeof(cfg.preconditions->'target_max_stability'), 'null') <> 'number'
            OR target.stability <= (cfg.preconditions->>'target_max_stability')::numeric
          )
          AND (
            COALESCE(jsonb_typeof(cfg.preconditions->'emitter_min_militarism'), 'null') <> 'number'
            OR emitter.militarism >= (cfg.preconditions->>'emitter_min_militarism')::numeric
          )
          AND (
            COALESCE(jsonb_typeof(cfg.preconditions->'emitter_max_militarism'), 'null') <> 'number'
            OR emitter.militarism <= (cfg.preconditions->>'emitter_max_militarism')::numeric
          )
          AND (
            NOT cfg.requires_target
            OR COALESCE(jsonb_typeof(cfg.preconditions->'target_min_militarism'), 'null') <> 'number'
            OR target.militarism >= (cfg.preconditions->>'target_min_militarism')::numeric
          )
          AND (
            NOT cfg.requires_target
            OR COALESCE(jsonb_typeof(cfg.preconditions->'target_max_militarism'), 'null') <> 'number'
            OR target.militarism <= (cfg.preconditions->>'target_max_militarism')::numeric
          )
          AND (
            NOT cfg.requires_target
            OR COALESCE(jsonb_typeof(cfg.preconditions->'min_relation'), 'null') <> 'number'
            OR COALESCE(rel.value, 0) >= (cfg.preconditions->>'min_relation')::numeric
          )
          AND (
            NOT cfg.requires_target
            OR COALESCE(jsonb_typeof(cfg.preconditions->'max_relation'), 'null') <> 'number'
            OR COALESCE(rel.value, 0) <= (cfg.preconditions->>'max_relation')::numeric
          )
          AND (
            NOT cfg.requires_target
            OR COALESCE(jsonb_typeof(cfg.preconditions->'same_continent'), 'null') <> 'boolean'
            OR NOT (cfg.preconditions->>'same_continent')::boolean
            OR emitter.continent_id = target.continent_id
          )
          AND (
            NOT cfg.requires_target
            OR COALESCE(jsonb_typeof(cfg.preconditions->'different_continent'), 'null') <> 'boolean'
            OR NOT (cfg.preconditions->>'different_continent')::boolean
            OR emitter.continent_id IS DISTINCT FROM target.continent_id
          )
          AND (
            COALESCE((sat.params_schema->>'requires_target_acceptance')::boolean, false) = false
            OR NOT EXISTS (
              SELECT 1
              FROM public.country_players target_player
              WHERE target_player.country_id = target.id
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.ai_event_requests previous
            WHERE previous.country_id = emitter.id
              AND previous.action_type_id = sat.id
              AND previous.target_country_id IS NOT DISTINCT FROM target.id
              AND previous.created_at >
                now() - cfg.cooldown_hours * interval '1 hour'
          )
      ) candidate
      ORDER BY -ln(GREATEST(random(), 0.000001)) / candidate.weight
      LIMIT 1;

      EXIT WHEN NOT FOUND;

      v_scheduled_at := now()
        + floor(random() * (v_amplitude_minutes + 1))::integer * interval '1 minute';
      v_explanation := format(
        'Couple valide sélectionné : %s → %s / %s. Poids %s, relation %s, délai anti-répétition %sh.',
        v_choice.emitter_id,
        COALESCE(v_choice.target_id::text, 'aucune cible'),
        v_choice.action_key,
        v_choice.weight,
        v_choice.relation_value,
        v_choice.cooldown_hours
      );

      INSERT INTO public.ai_event_requests (
        country_id,
        target_country_id,
        action_type_id,
        status,
        decision_status,
        importance,
        payload,
        source,
        scheduled_trigger_at,
        selection_explanation
      ) VALUES (
        v_choice.emitter_id,
        v_choice.target_id,
        v_choice.action_type_id,
        CASE v_choice.validation_mode WHEN 'auto' THEN 'accepted' ELSE 'pending' END,
        CASE v_choice.validation_mode WHEN 'auto' THEN 'approved' ELSE 'pending' END,
        v_importance,
        jsonb_build_object(
          'target_country_id', v_choice.target_id,
          'selection', jsonb_build_object(
            'weight', v_choice.weight,
            'preconditions', v_choice.preconditions,
            'cooldown_hours', v_choice.cooldown_hours,
            'relation_at_selection', v_choice.relation_value,
            'explanation', v_explanation
          )
        ),
        'cron',
        v_scheduled_at,
        v_explanation
      )
      RETURNING id INTO v_action_id;

      v_created := v_created + 1;
    END LOOP;
  END LOOP;

  INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
  VALUES (
    'ai_events_last_run',
    to_jsonb(now()::text),
    'Dernière génération du moteur RP unifié.',
    now(),
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();

  INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
  VALUES (
    'ai_events_cron_last_check',
    jsonb_build_object('at', now(), 'engine', 'rp_pipeline', 'created', v_created, 'forced', p_force),
    'Diagnostic de la génération RP unifiée.',
    now(),
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();

  RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_rp_pipeline_worker_heartbeat(
  p_status text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE((SELECT auth.jwt())->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accès réservé au worker.';
  END IF;
  IF p_status NOT IN ('running', 'succeeded', 'failed')
     OR jsonb_typeof(p_details) <> 'object' THEN
    RAISE EXCEPTION 'Signal de vie du worker invalide.';
  END IF;

  INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
  VALUES (
    'rp_pipeline_worker_heartbeat',
    jsonb_build_object(
      'status', p_status,
      'last_seen_at', clock_timestamp(),
      'details', p_details
    ) || CASE
      WHEN p_status = 'succeeded'
        THEN jsonb_build_object('last_success_at', clock_timestamp())
      ELSE '{}'::jsonb
    END,
    'Signal de vie du worker RP.',
    clock_timestamp(),
    clock_timestamp()
  )
  ON CONFLICT (key) DO UPDATE
  SET
    value = COALESCE(rule_parameters.value, '{}'::jsonb)
      || jsonb_build_object(
        'status', p_status,
        'last_seen_at', clock_timestamp(),
        'details', p_details
      )
      || CASE
        WHEN p_status = 'succeeded'
          THEN jsonb_build_object('last_success_at', clock_timestamp())
        ELSE '{}'::jsonb
      END,
    description = EXCLUDED.description,
    updated_at = clock_timestamp();
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_rp_pipeline_edge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_base_url text;
  v_secret text;
  v_request_id bigint;
BEGIN
  v_base_url := COALESCE(
    NULLIF(current_setting('app.settings.supabase_url', true), ''),
    'https://ssnqervwthlqvbewhtrd.supabase.co'
  );

  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'rp_pipeline_edge_secret'
    ORDER BY created_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Secret Vault rp_pipeline_edge_secret inaccessible.';
  END;

  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE EXCEPTION 'Secret Vault rp_pipeline_edge_secret manquant.';
  END IF;

  SELECT net.http_post(
    url := rtrim(v_base_url, '/') || '/functions/v1/rp-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-rp-pipeline-secret', v_secret
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;
END;
$$;

DROP TRIGGER IF EXISTS enrich_rp_control_ledger_trigger
  ON public.action_execution_ledger;
CREATE TRIGGER enrich_rp_control_ledger_trigger
  BEFORE INSERT ON public.action_execution_ledger
  FOR EACH ROW EXECUTE PROCEDURE public.enrich_rp_control_ledger();

REVOKE ALL ON FUNCTION public.enrich_rp_control_ledger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_lore_article(uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_lore_article(uuid, text, text, jsonb, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.upsert_discord_lore_article(jsonb, jsonb, text[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_discord_lore_article(jsonb, jsonb, text[])
  TO service_role;
REVOKE ALL ON FUNCTION public.record_rp_pipeline_worker_heartbeat(text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_rp_pipeline_worker_heartbeat(text, jsonb)
  TO service_role;

UPDATE public.rule_parameters
SET
  value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
    'model', 'anthracite-org-magnum-v4-72b-FP8-Dynamic',
    'enabled', false
  ),
  updated_at = now()
WHERE key = 'rp_pipeline_config';
