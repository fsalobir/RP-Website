CREATE OR REPLACE FUNCTION public.prepare_rp_public_facts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blueprints jsonb;
  v_blueprint jsonb;
  v_action_label text;
  v_fact text;
  v_index integer := 0;
BEGIN
  IF jsonb_array_length(NEW.public_facts) = 0 THEN
    SELECT config.fact_blueprints, action_type.label_fr
    INTO v_blueprints, v_action_label
    FROM public.action_automation_configs AS config
    JOIN public.state_action_types AS action_type ON action_type.id = config.action_type_id
    WHERE config.action_type_id = NEW.action_type_id;

    IF jsonb_array_length(COALESCE(v_blueprints, '[]'::jsonb)) > 0 THEN
      v_blueprint := v_blueprints -> floor(random() * jsonb_array_length(v_blueprints))::integer;
      NEW.public_facts := '[]'::jsonb;
      FOR v_fact IN SELECT jsonb_array_elements_text(v_blueprint) LOOP
        v_index := v_index + 1;
        v_fact := replace(v_fact, '{auteur}', 'le pays auteur');
        v_fact := replace(v_fact, '{cible}', 'le pays cible');
        v_fact := replace(v_fact, '{action}', v_action_label);
        v_fact := replace(v_fact, 'de le pays', 'du pays');
        v_fact := replace(v_fact, 'à le pays', 'au pays');
        v_fact := replace(v_fact, 'auprès de le pays', 'auprès du pays');
        v_fact := upper(left(v_fact, 1)) || substring(v_fact FROM 2);
        NEW.public_facts := NEW.public_facts || jsonb_build_array(jsonb_build_object(
          'id', 'f' || v_index,
          'text', v_fact,
          'origin', 'engine'
        ));
      END LOOP;
    END IF;
  END IF;

  IF NEW.decision_status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.decision_status IS DISTINCT FROM NEW.decision_status)
     AND jsonb_array_length(NEW.public_facts) < 2 THEN
    RAISE EXCEPTION 'Ajoutez au moins deux faits publics avant de valider cette action.';
  END IF;
  RETURN NEW;
END;
$$;
