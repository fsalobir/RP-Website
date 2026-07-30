-- Correction révélée par le test SQL transactionnel : décomposer la ligne d'action.

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
  SELECT a.*
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

UPDATE public.rule_parameters
SET
  value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
    'model', 'anthracite-org-magnum-v4-72b-FP8-Dynamic',
    'enabled', false
  ),
  updated_at = now()
WHERE key = 'rp_pipeline_config';
