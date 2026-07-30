-- Collaboration entre administrateurs : historique commun et sauvegardes
-- protégées contre l'écrasement pour les deux grands écrans de réglages.

CREATE TABLE public.admin_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  table_name text NOT NULL,
  record_key text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  reverted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX admin_change_log_created_at_idx
  ON public.admin_change_log(created_at DESC);
CREATE INDEX admin_change_log_record_idx
  ON public.admin_change_log(table_name, record_key, created_at DESC);

ALTER TABLE public.admin_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin change log: lecture admin"
  ON public.admin_change_log FOR SELECT
  USING ((select public.is_admin()));

CREATE POLICY "Admin change log: marquage admin"
  ON public.admin_change_log FOR UPDATE
  USING ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

DROP TRIGGER IF EXISTS country_budget_updated_at ON public.country_budget;
CREATE TRIGGER country_budget_updated_at
  BEFORE UPDATE ON public.country_budget
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS country_laws_updated_at ON public.country_laws;
CREATE TRIGGER country_laws_updated_at
  BEFORE UPDATE ON public.country_laws
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.log_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_record_key text;
BEGIN
  -- Les passages automatiques et les modifications des joueurs ne polluent pas
  -- l'historique réservé aux interventions humaines de l'administration.
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = v_actor
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NEW;
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_record_key := concat_ws(
    ':',
    COALESCE(v_row->>'id', v_row->>'country_id', v_row->>'user_id', v_row->>'key', 'ligne'),
    NULLIF(v_row->>'law_key', ''),
    NULLIF(v_row->>'roster_unit_id', ''),
    NULLIF(v_row->>'perk_id', '')
  );

  INSERT INTO public.admin_change_log (
    actor_user_id,
    actor_email,
    table_name,
    record_key,
    operation,
    before_data,
    after_data
  )
  VALUES (
    v_actor,
    COALESCE(auth.jwt()->>'email', 'Administrateur'),
    TG_TABLE_NAME,
    v_record_key,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'countries',
    'rule_parameters',
    'state_action_types',
    'military_roster_units',
    'military_roster_unit_levels',
    'perk_categories',
    'perks',
    'perk_effects',
    'perk_requirements',
    'country_budget',
    'country_laws',
    'country_military_units',
    'country_military_limits',
    'country_etat_major_focus',
    'country_control',
    'country_perks',
    'country_effects',
    'country_players',
    'country_relations',
    'country_state_action_balance',
    'wiki_pages'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS admin_change_log_trigger ON public.%I', v_table);
      EXECUTE format(
        'CREATE TRIGGER admin_change_log_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_admin_change()',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_rule_parameters(p_rows jsonb)
RETURNS TABLE(result_id uuid, result_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_expected timestamptz;
  v_current timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs.';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 250 THEN
    RAISE EXCEPTION 'Lot de réglages invalide.';
  END IF;

  -- Verrouiller puis contrôler tout le lot avant la première écriture :
  -- aucune sauvegarde partielle si un autre admin est passé avant.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_id := (v_item->>'id')::uuid;
    v_expected := (v_item->>'expected_updated_at')::timestamptz;
    SELECT rp.updated_at INTO v_current
    FROM public.rule_parameters rp
    WHERE rp.id = v_id
    FOR UPDATE;

    IF v_current IS NULL THEN
      RAISE EXCEPTION 'Un réglage n’existe plus. Rechargez la page.';
    END IF;
    IF v_current IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'Un autre administrateur a modifié ces règles. Rechargez la page avant de recommencer.';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_id := (v_item->>'id')::uuid;
    UPDATE public.rule_parameters
    SET
      key = v_item->>'key',
      value = v_item->'value',
      description = CASE
        WHEN v_item ? 'description' AND v_item->'description' <> 'null'::jsonb
          THEN v_item->>'description'
        ELSE NULL
      END
    WHERE rule_parameters.id = v_id;

    RETURN QUERY
      SELECT rp.id, rp.updated_at
      FROM public.rule_parameters rp
      WHERE rp.id = v_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_state_action_types(p_rows jsonb)
RETURNS TABLE(result_id uuid, result_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_expected timestamptz;
  v_current timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs.';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'Lot d’actions invalide.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_id := (v_item->>'id')::uuid;
    v_expected := (v_item->>'expected_updated_at')::timestamptz;
    SELECT sat.updated_at INTO v_current
    FROM public.state_action_types sat
    WHERE sat.id = v_id
    FOR UPDATE;

    IF v_current IS NULL THEN
      RAISE EXCEPTION 'Une action n’existe plus. Rechargez la page.';
    END IF;
    IF v_current IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'Un autre administrateur a modifié ces actions. Rechargez la page avant de recommencer.';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_id := (v_item->>'id')::uuid;
    UPDATE public.state_action_types
    SET
      key = v_item->>'key',
      label_fr = v_item->>'label_fr',
      cost = (v_item->>'cost')::integer,
      params_schema = COALESCE(v_item->'params_schema', '{}'::jsonb),
      sort_order = (v_item->>'sort_order')::integer
    WHERE state_action_types.id = v_id;

    RETURN QUERY
      SELECT sat.id, sat.updated_at
      FROM public.state_action_types sat
      WHERE sat.id = v_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_country_military_units_guarded(
  p_country_id uuid,
  p_rows jsonb
)
RETURNS TABLE(result_roster_unit_id uuid, result_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_roster_id uuid;
  v_expected timestamptz;
  v_current timestamptz;
  v_found boolean;
BEGIN
  IF NOT (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.country_players cp
      WHERE cp.user_id = auth.uid() AND cp.country_id = p_country_id
    )
  ) THEN
    RAISE EXCEPTION 'Vous ne pouvez modifier que le pays qui vous est assigné.';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Lot d’unités invalide.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_roster_id := (v_item->>'roster_unit_id')::uuid;
    v_expected := NULLIF(v_item->>'expected_updated_at', '')::timestamptz;
    SELECT cmu.updated_at INTO v_current
    FROM public.country_military_units cmu
    WHERE cmu.country_id = p_country_id
      AND cmu.roster_unit_id = v_roster_id
    FOR UPDATE;
    v_found := FOUND;

    IF v_found AND v_current IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'Un autre administrateur a modifié cette armée. Rechargez la page avant de recommencer.';
    END IF;
    IF NOT v_found AND v_expected IS NOT NULL THEN
      RAISE EXCEPTION 'Cette armée a changé. Rechargez la page avant de recommencer.';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_roster_id := (v_item->>'roster_unit_id')::uuid;
    INSERT INTO public.country_military_units (
      country_id,
      roster_unit_id,
      current_level,
      extra_count
    )
    VALUES (
      p_country_id,
      v_roster_id,
      GREATEST(0, (v_item->>'current_level')::integer),
      GREATEST(0, (v_item->>'extra_count')::integer)
    )
    ON CONFLICT (country_id, roster_unit_id) DO UPDATE SET
      current_level = EXCLUDED.current_level,
      extra_count = EXCLUDED.extra_count;

    RETURN QUERY
      SELECT cmu.roster_unit_id, cmu.updated_at
      FROM public.country_military_units cmu
      WHERE cmu.country_id = p_country_id
        AND cmu.roster_unit_id = v_roster_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_change(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log public.admin_change_log%ROWTYPE;
  v_allowed text[];
  v_keys text[];
  v_column text;
  v_set_parts text[] := ARRAY[]::text[];
  v_where_parts text[] := ARRAY[]::text[];
  v_current_parts text[] := ARRAY[]::text[];
  v_sql text;
  v_count integer;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs.';
  END IF;

  SELECT * INTO v_log
  FROM public.admin_change_log
  WHERE id = p_log_id
  FOR UPDATE;

  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'Modification introuvable.';
  END IF;
  IF v_log.operation <> 'UPDATE' OR v_log.before_data IS NULL OR v_log.after_data IS NULL THEN
    RAISE EXCEPTION 'Cette opération ne peut pas être restaurée automatiquement.';
  END IF;
  IF v_log.reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cette modification a déjà été restaurée.';
  END IF;

  CASE v_log.table_name
    WHEN 'countries' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['name','slug','regime','flag_url','continent_id','militarism','industry','science','stability','population','gdp','growth','ai_status'];
    WHEN 'rule_parameters' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['key','value','description'];
    WHEN 'state_action_types' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['key','label_fr','cost','params_schema','sort_order'];
    WHEN 'country_budget' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['budget_fraction','pct_etat','pct_education','pct_recherche','pct_infrastructure','pct_sante','pct_industrie','pct_defense','pct_interieur','pct_affaires_etrangeres','pct_procuration_militaire'];
    WHEN 'country_laws' THEN
      v_keys := ARRAY['country_id','law_key'];
      v_allowed := ARRAY['score','target_score'];
    WHEN 'country_military_units' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['current_level','extra_count','recrutement_points','procuration_points','stock_points'];
    WHEN 'country_military_limits' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['limit_value'];
    WHEN 'country_etat_major_focus' THEN
      v_keys := ARRAY['country_id'];
      v_allowed := ARRAY['design_roster_unit_id','recrutement_roster_unit_id','procuration_roster_unit_id','stock_roster_unit_id'];
    WHEN 'country_control' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['controller_country_id','share_pct','is_annexed'];
    WHEN 'country_perks' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['perk_id'];
    WHEN 'country_effects' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['name','effect_kind','effect_target','effect_subtype','value','duration_kind','duration_remaining'];
    WHEN 'country_players' THEN
      v_keys := ARRAY['user_id'];
      v_allowed := ARRAY['country_id','name','email'];
    WHEN 'country_relations' THEN
      v_keys := ARRAY['country_a_id','country_b_id'];
      v_allowed := ARRAY['value'];
    WHEN 'country_state_action_balance' THEN
      v_keys := ARRAY['country_id'];
      v_allowed := ARRAY['balance'];
    WHEN 'military_roster_units' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['branch','sub_type','name_fr','icon_url','level_count','base_count','sort_order'];
    WHEN 'military_roster_unit_levels' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['level','manpower','hard_power','mobilization_cost','science_required'];
    WHEN 'perk_categories' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['name_fr','sort_order'];
    WHEN 'perks' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['name_fr','description_fr','modifier','min_militarism','min_industry','min_science','min_stability','sort_order','category_id','icon_url','icon_size'];
    WHEN 'perk_effects' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['effect_kind','effect_target','effect_subtype','value'];
    WHEN 'perk_requirements' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['requirement_kind','requirement_target','value'];
    WHEN 'wiki_pages' THEN
      v_keys := ARRAY['id'];
      v_allowed := ARRAY['title','slug','content','parent_id','sort_order','is_published'];
    ELSE
      RAISE EXCEPTION 'La restauration de cette donnée n’est pas autorisée.';
  END CASE;

  FOREACH v_column IN ARRAY v_keys
  LOOP
    v_where_parts := array_append(
      v_where_parts,
      format('(to_jsonb(t)->%L) IS NOT DISTINCT FROM ($1->%L)', v_column, v_column)
    );
  END LOOP;

  FOREACH v_column IN ARRAY v_allowed
  LOOP
    IF (v_log.before_data->v_column) IS DISTINCT FROM (v_log.after_data->v_column) THEN
      v_set_parts := array_append(
        v_set_parts,
        format(
          '%1$I = (jsonb_populate_record(NULL::public.%2$I, $1)).%1$I',
          v_column,
          v_log.table_name
        )
      );
      v_current_parts := array_append(
        v_current_parts,
        format('(to_jsonb(t)->%L) IS NOT DISTINCT FROM ($2->%L)', v_column, v_column)
      );
    END IF;
  END LOOP;

  IF cardinality(v_set_parts) = 0 THEN
    RAISE EXCEPTION 'Aucune valeur restaurable dans cette modification.';
  END IF;

  v_sql := format(
    'UPDATE public.%I AS t SET %s WHERE %s AND %s',
    v_log.table_name,
    array_to_string(v_set_parts, ', '),
    array_to_string(v_where_parts, ' AND '),
    array_to_string(v_current_parts, ' AND ')
  );
  EXECUTE v_sql USING v_log.before_data, v_log.after_data;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Cette donnée a encore changé depuis. Rechargez l’historique avant de la restaurer.';
  END IF;

  UPDATE public.admin_change_log
  SET reverted_at = now(), reverted_by = v_actor
  WHERE id = p_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_rule_parameters(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_save_state_action_types(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_country_military_units_guarded(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_restore_change(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_rule_parameters(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_state_action_types(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_country_military_units_guarded(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_change(uuid) TO authenticated;
