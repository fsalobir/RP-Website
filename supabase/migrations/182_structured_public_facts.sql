ALTER TABLE public.action_automation_configs
  ADD COLUMN fact_blueprints jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.ai_event_requests
  ADD COLUMN public_facts jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.rp_public_facts_are_valid(p_facts jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p_facts) = 'array'
    AND jsonb_array_length(p_facts) <= 8
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_facts) AS item(value)
      WHERE jsonb_typeof(item.value) <> 'object'
         OR jsonb_typeof(item.value->'text') <> 'string'
         OR length(btrim(item.value->>'text')) NOT BETWEEN 1 AND 500
         OR COALESCE(item.value->>'origin', 'engine') NOT IN ('engine', 'mechanics', 'mj')
         OR (
           item.value ? 'attribution'
           AND (
             jsonb_typeof(item.value->'attribution') <> 'string'
             OR length(item.value->>'attribution') > 120
           )
         )
    );
$$;

CREATE OR REPLACE FUNCTION public.rp_fact_blueprints_are_valid(p_blueprints jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p_blueprints) = 'array'
    AND jsonb_array_length(p_blueprints) <= 12
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_blueprints) AS blueprint(value)
      WHERE jsonb_typeof(blueprint.value) <> 'array'
         OR jsonb_array_length(blueprint.value) NOT BETWEEN 2 AND 6
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(blueprint.value) AS fact(value)
           WHERE jsonb_typeof(fact.value) <> 'string'
              OR length(btrim(fact.value #>> '{}')) NOT BETWEEN 1 AND 500
         )
    );
$$;

ALTER TABLE public.ai_event_requests
  ADD CONSTRAINT ai_event_requests_public_facts_valid
  CHECK (public.rp_public_facts_are_valid(public_facts));

ALTER TABLE public.action_automation_configs
  ADD CONSTRAINT action_automation_configs_fact_blueprints_valid
  CHECK (public.rp_fact_blueprints_are_valid(fact_blueprints));

UPDATE public.action_automation_configs AS config
SET fact_blueprints = CASE action_type.key
  WHEN 'insulte_diplomatique' THEN '[
    ["{auteur} prépare une note officielle volontairement offensante à l’adresse de {cible}.", "Le texte attaque directement la position défendue par {cible} et assume un ton de confrontation.", "La note est rendue publique par {auteur} après sa transmission."],
    ["Lors d’un échange diplomatique public, {auteur} choisit de provoquer directement {cible}.", "La formule employée rompt avec les usages de courtoisie suivis jusque-là.", "{auteur} maintient son propos au lieu de le retirer."]
  ]'::jsonb
  WHEN 'ouverture_diplomatique' THEN '[
    ["{auteur} propose à {cible} de rouvrir un canal de contact officiel.", "La proposition porte sur des échanges directs entre leurs représentants, sans accord politique préalable.", "Les deux pays doivent encore fixer la suite concrète de ce contact."],
    ["{auteur} transmet à {cible} une invitation à reprendre des discussions interrompues.", "La démarche reste exploratoire et ne contient ni traité ni engagement sectoriel.", "La réponse de {cible} détermine si le canal officiel peut fonctionner."]
  ]'::jsonb
  WHEN 'accord_commercial_politique' THEN '[
    ["{auteur} et {cible} achèvent une séquence de négociation consacrée à un accord bilatéral.", "Un texte commun fixe uniquement le périmètre prévu par l’action.", "Les deux gouvernements présentent publiquement ce texte sans y ajouter d’engagement militaire."],
    ["Les délégations de {auteur} et de {cible} arrêtent une version commune de leur accord.", "Les points non prévus par l’action restent hors du texte.", "La conclusion est annoncée conjointement par les deux pays."]
  ]'::jsonb
  WHEN 'alliance' THEN '[
    ["{auteur} et {cible} ouvrent une réunion finale consacrée à la formation de leur alliance.", "Le texte soumis aux deux parties se limite aux engagements prévus par l’action.", "Aucun déploiement militaire n’est annoncé avec cette décision."],
    ["Les représentants de {auteur} et de {cible} rendent publique leur volonté de former une alliance.", "La décision ne crée ni commandement commun ni base militaire en dehors des faits prévus.", "Les modalités futures restent à définir séparément."]
  ]'::jsonb
  WHEN 'cooperation_militaire' THEN '[
    ["{auteur} propose à {cible} un programme limité de coopération militaire.", "Le programme porte sur des échanges professionnels et ne prévoit aucun stationnement permanent.", "Les deux pays distinguent cette coopération d’une alliance de défense."],
    ["Des représentants militaires de {auteur} et de {cible} arrêtent le principe d’une coopération ciblée.", "La démarche ne comprend ni transfert d’arme ni garantie d’intervention.", "Son périmètre reste celui fixé par l’action."]
  ]'::jsonb
  WHEN 'investissements' THEN '[
    ["{auteur} ouvre une nouvelle phase d’investissement correspondant au projet prévu par l’action.", "Les autorités présentent le chantier comme engagé, sans annoncer son achèvement.", "Aucun montant ni calendrier supplémentaire n’est rendu public."],
    ["{auteur} valide le lancement administratif du programme d’investissement prévu.", "Les premières décisions portent sur sa mise en route et non sur une mise en service complète.", "Le périmètre annoncé reste limité aux faits de l’action."]
  ]'::jsonb
  WHEN 'demande_up' THEN '[
    ["{auteur} soumet le projet technique prévu à un examen officiel.", "La demande porte sur un jalon précis et non sur un déploiement général.", "La décision obtenue ne vaut que pour le périmètre décrit par l’action."],
    ["{auteur} présente une demande formelle concernant le programme prévu.", "Le dossier distingue la phase d’essai d’une adoption à grande échelle.", "Aucune capacité supplémentaire n’est annoncée hors du résultat de l’action."]
  ]'::jsonb
  WHEN 'prise_influence' THEN '[
    ["{auteur} lance auprès de {cible} une initiative destinée à accroître son influence politique.", "La démarche utilise les canaux officiels déjà disponibles entre les deux pays.", "Elle ne confère à {auteur} ni contrôle territorial ni droit militaire."],
    ["{auteur} intensifie son travail d’influence auprès de {cible}.", "L’initiative vise les décisions bilatérales sans modifier le gouvernement de {cible}.", "Aucun traité ni accès militaire n’en découle automatiquement."]
  ]'::jsonb
  WHEN 'espionnage' THEN '[
    ["{auteur} engage une tentative clandestine de collecte d’informations visant {cible}.", "L’opération recherche uniquement l’objectif de renseignement prévu par l’action.", "L’identité des personnes impliquées et la méthode employée ne sont pas rendues publiques."],
    ["Une opération de renseignement attribuée à {auteur} vise des informations détenues par {cible}.", "Son périmètre reste limité à la cible prévue.", "Aucun dommage matériel ni arrestation n’est établi par l’action."]
  ]'::jsonb
  WHEN 'sabotage' THEN '[
    ["{auteur} engage la tentative de sabotage prévue contre {cible}.", "L’opération se limite à l’objectif désigné par l’action.", "Aucune victime, destruction ou méthode supplémentaire n’est établie."],
    ["Une opération attribuée à {auteur} cherche à perturber la capacité visée chez {cible}.", "La tentative n’a pas d’autre cible que celle prévue.", "Les faits ne permettent pas d’annoncer de dégâts au-delà du résultat mécanique." ]
  ]'::jsonb
  WHEN 'effort_fortifications' THEN '[
    ["{auteur} ouvre la phase de renforcement défensif prévue par l’action.", "Les travaux annoncés restent au stade correspondant au résultat obtenu.", "Aucun emplacement, armement ou achèvement supplémentaire n’est communiqué."],
    ["{auteur} valide une nouvelle étape de son programme de fortifications.", "La décision porte sur le renforcement prévu et non sur une mise en service générale.", "Les capacités exactes restent limitées aux faits mécaniques de l’action."]
  ]'::jsonb
  WHEN 'escarmouche_militaire' THEN '[
    ["Des forces de {auteur} et de {cible} entrent dans l’affrontement limité prévu par l’action.", "L’incident reste circonscrit et ne constitue pas une déclaration de guerre.", "Aucune conquête ni perte humaine supplémentaire n’est établie."],
    ["Un contact armé limité oppose {auteur} à {cible}.", "Les deux pays maintiennent l’affrontement sous le seuil d’une guerre ouverte.", "Le résultat ne permet pas d’inventer occupation, destruction ou victime." ]
  ]'::jsonb
  WHEN 'conflit_arme' THEN '[
    ["{auteur} engage contre {cible} l’opération militaire prévue par l’action.", "L’affrontement dépasse l’incident isolé sans devenir une guerre ouverte par simple déduction.", "Aucun front, bilan humain ou changement territorial supplémentaire n’est établi."],
    ["Le face-à-face entre {auteur} et {cible} se transforme en conflit armé limité.", "Les opérations restent dans le périmètre défini par l’action.", "Le résultat ne désigne ni vainqueur stratégique ni territoire occupé." ]
  ]'::jsonb
  WHEN 'guerre_ouverte' THEN '[
    ["{auteur} tente de faire basculer sa confrontation avec {cible} dans une guerre ouverte.", "La décision porte sur l’ouverture du conflit et non sur l’issue de futures batailles.", "Aucun bilan humain, territoire occupé ou vainqueur n’est encore établi."],
    ["La crise entre {auteur} et {cible} atteint le seuil de la guerre ouverte prévu par l’action.", "Ce basculement ne préjuge d’aucune bataille ni conquête.", "Les faits disponibles ne permettent pas d’ajouter destruction ou victime." ]
  ]'::jsonb
  ELSE '[["{auteur} engage l’action suivante : {action}.", "La démarche reste strictement limitée au périmètre prévu par l’action."]]'::jsonb
END
FROM public.state_action_types AS action_type
WHERE action_type.id = config.action_type_id;

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
  v_author_name text;
  v_target_name text;
  v_fact text;
  v_index integer := 0;
BEGIN
  IF jsonb_array_length(NEW.public_facts) = 0 THEN
    SELECT config.fact_blueprints, action_type.label_fr, author.name, target.name
    INTO v_blueprints, v_action_label, v_author_name, v_target_name
    FROM public.action_automation_configs AS config
    JOIN public.state_action_types AS action_type ON action_type.id = config.action_type_id
    JOIN public.countries AS author ON author.id = NEW.country_id
    LEFT JOIN public.countries AS target ON target.id = NEW.target_country_id
    WHERE config.action_type_id = NEW.action_type_id;

    IF jsonb_array_length(COALESCE(v_blueprints, '[]'::jsonb)) > 0 THEN
      v_blueprint := v_blueprints -> floor(random() * jsonb_array_length(v_blueprints))::integer;
      NEW.public_facts := '[]'::jsonb;
      FOR v_fact IN SELECT jsonb_array_elements_text(v_blueprint) LOOP
        v_index := v_index + 1;
        v_fact := replace(v_fact, '{auteur}', v_author_name);
        v_fact := replace(v_fact, '{cible}', COALESCE(v_target_name, 'le destinataire prévu'));
        v_fact := replace(v_fact, '{action}', v_action_label);
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

DROP TRIGGER IF EXISTS zz_prepare_rp_public_facts_trigger ON public.ai_event_requests;
CREATE TRIGGER zz_prepare_rp_public_facts_trigger
BEFORE INSERT OR UPDATE OF decision_status, d100_roll, action_type_id, country_id, target_country_id
ON public.ai_event_requests
FOR EACH ROW EXECUTE PROCEDURE public.prepare_rp_public_facts();

CREATE OR REPLACE FUNCTION public.create_manual_rp_action(
  p_country_id uuid,
  p_action_type_id uuid,
  p_target_country_id uuid,
  p_importance text,
  p_intent text,
  p_stakes text DEFAULT NULL,
  p_mj_notes text DEFAULT NULL,
  p_parent_action_id uuid DEFAULT NULL,
  p_effects jsonb DEFAULT '[]'::jsonb,
  p_public_facts jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_id uuid;
BEGIN
  IF NOT public.can_manage_rp() THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  IF p_importance NOT IN ('minor', 'major') THEN RAISE EXCEPTION 'Importance invalide.'; END IF;
  IF NULLIF(btrim(p_intent), '') IS NULL OR char_length(p_intent) > 500
     OR char_length(COALESCE(p_stakes, '')) > 1000
     OR char_length(COALESCE(p_mj_notes, '')) > 1000 THEN
    RAISE EXCEPTION 'Contenu narratif invalide.';
  END IF;
  IF NOT public.rp_public_facts_are_valid(p_public_facts)
     OR jsonb_array_length(p_public_facts) < 2 THEN
    RAISE EXCEPTION 'Deux à huit faits publics valides sont requis.';
  END IF;

  INSERT INTO public.ai_event_requests (
    country_id, action_type_id, target_country_id, status, source, importance,
    decision_status, resolved_by, resolved_at, intent, stakes, mj_notes,
    parent_action_id, manual_preconditions_bypassed, payload, selection_explanation,
    admin_effect_added, public_facts
  ) VALUES (
    p_country_id, p_action_type_id, p_target_country_id, 'accepted', 'manual', p_importance,
    'approved', (SELECT auth.uid()), now(), btrim(p_intent), NULLIF(btrim(p_stakes), ''),
    NULLIF(btrim(p_mj_notes), ''), p_parent_action_id, true,
    jsonb_build_object(
      'target_country_id', p_target_country_id,
      'intent', btrim(p_intent),
      'stakes', NULLIF(btrim(p_stakes), ''),
      'bypassed_preconditions', true
    ),
    'Action narrative créée manuellement par un MJ.',
    p_effects,
    p_public_facts
  ) RETURNING id INTO v_action_id;
  RETURN v_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_rp_action_public_facts(
  p_action_id uuid,
  p_public_facts jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.ai_event_requests%ROWTYPE;
  v_article public.lore_articles%ROWTYPE;
  v_target_version integer;
BEGIN
  IF NOT public.can_manage_rp() THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  IF NOT public.rp_public_facts_are_valid(p_public_facts)
     OR jsonb_array_length(p_public_facts) < 2 THEN
    RAISE EXCEPTION 'Deux à huit faits publics valides sont requis.';
  END IF;

  SELECT * INTO v_action FROM public.ai_event_requests WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action introuvable.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.rp_pipeline_jobs
    WHERE action_id = p_action_id AND job_type = 'generate_article' AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'La rédaction Magnum est en cours ; réessayez après sa fin.';
  END IF;

  UPDATE public.ai_event_requests
  SET public_facts = p_public_facts, context_fact_sheet = '{}'::jsonb
  WHERE id = p_action_id;

  SELECT * INTO v_article
  FROM public.lore_articles
  WHERE action_id = p_action_id AND source_platform = 'engine'
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.lore_articles
    SET narrative_certified_at = NULL,
        narrative_provenance = '{}'::jsonb,
        editorial_status = 'draft',
        approved_for_execution_version = NULL
    WHERE id = v_article.id;
  END IF;

  UPDATE public.rp_pipeline_jobs
  SET status = 'cancelled', finished_at = now(), locked_at = NULL, locked_by = NULL
  WHERE action_id = p_action_id
    AND job_type = 'generate_article'
    AND status IN ('pending', 'retry', 'review', 'warning');

  IF v_action.decision_status = 'approved' AND v_action.d100_roll IS NOT NULL THEN
    v_target_version := CASE
      WHEN v_action.pending_execution_version IS NOT NULL THEN v_action.pending_execution_version
      WHEN v_action.consequences_applied_at IS NOT NULL THEN GREATEST(v_action.execution_version, 1)
      ELSE v_action.execution_version + 1
    END;
    INSERT INTO public.rp_pipeline_jobs (
      job_type, action_id, lore_article_id, payload, priority, idempotency_key
    ) VALUES (
      'generate_article', p_action_id, CASE WHEN v_article.id IS NULL THEN NULL ELSE v_article.id END,
      jsonb_build_object(
        'execution_version', v_target_version,
        'recalculation', v_action.pending_execution_version IS NOT NULL,
        'article_only_repair', v_action.consequences_applied_at IS NOT NULL
      ),
      10,
      'facts:' || p_action_id || ':v' || v_target_version || ':a' || COALESCE(v_article.current_version + 1, 1)
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      payload = EXCLUDED.payload,
      priority = EXCLUDED.priority,
      status = 'pending',
      attempt_count = 0,
      next_attempt_at = now(),
      locked_at = NULL,
      locked_by = NULL,
      last_error = NULL,
      finished_at = NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.ai_event_requests.public_facts IS
  'Faits publics atomiques décidés par le moteur ou un MJ avant toute rédaction Magnum.';
COMMENT ON COLUMN public.action_automation_configs.fact_blueprints IS
  'Scènes factuelles possibles. Une scène est tirée à la création puis figée dans public_facts.';
