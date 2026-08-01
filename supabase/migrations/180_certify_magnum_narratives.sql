ALTER TABLE public.action_automation_configs
  ADD COLUMN IF NOT EXISTS creative_license text NOT NULL DEFAULT 'strict'
    CHECK (creative_license IN ('strict', 'controlled')),
  ADD COLUMN IF NOT EXISTS narrative_guidance text NOT NULL DEFAULT ''
    CHECK (char_length(narrative_guidance) <= 1000);

UPDATE public.action_automation_configs AS config
SET creative_license = 'controlled'
FROM public.state_action_types AS action_type
WHERE config.action_type_id = action_type.id
  AND action_type.key IN (
    'ouverture_diplomatique',
    'insulte_diplomatique',
    'investissements',
    'demande_up',
    'accord_commercial_politique',
    'alliance',
    'cooperation_militaire'
  );

ALTER TABLE public.lore_articles
  ADD COLUMN IF NOT EXISTS narrative_certified_at timestamptz,
  ADD COLUMN IF NOT EXISTS narrative_provenance jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(narrative_provenance) = 'object');

CREATE INDEX IF NOT EXISTS idx_lore_articles_narrative_certified
ON public.lore_articles(narrative_certified_at DESC)
WHERE action_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.action_lore_sources
  ADD COLUMN IF NOT EXISTS context_role text NOT NULL DEFAULT 'author_background'
    CHECK (context_role IN (
      'exact_pair',
      'author_background',
      'target_background',
      'regional_background'
    ));

ALTER TABLE public.lore_article_versions
  DROP CONSTRAINT IF EXISTS lore_article_versions_stage_check;

ALTER TABLE public.lore_article_versions
  ADD CONSTRAINT lore_article_versions_stage_check
  CHECK (stage IN ('analysis', 'draft', 'final', 'critic', 'repair', 'manual'));

COMMENT ON COLUMN public.action_automation_configs.creative_license IS
  'Liberté narrative Magnum: strict (faits seulement) ou controlled (détails non mécaniques tracés).';
COMMENT ON COLUMN public.lore_articles.narrative_certified_at IS
  'Présent uniquement après validation du contrat narratif et critique Magnum indépendante.';
COMMENT ON COLUMN public.lore_articles.narrative_provenance IS
  'Contrat, preuves, détails créatifs et verdict ayant produit la version courante.';

CREATE OR REPLACE FUNCTION public.enqueue_rp_narrative_repair(p_action_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.ai_event_requests%ROWTYPE;
  v_article public.lore_articles%ROWTYPE;
  v_job_id uuid;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  SELECT * INTO v_action
  FROM public.ai_event_requests
  WHERE id = p_action_id
  FOR UPDATE;
  IF NOT FOUND OR v_action.consequences_applied_at IS NULL THEN
    RAISE EXCEPTION 'Action exécutée introuvable.';
  END IF;

  SELECT * INTO v_article
  FROM public.lore_articles
  WHERE action_id = p_action_id
    AND source_platform = 'engine'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article moteur introuvable.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rp_pipeline_jobs
    WHERE action_id = p_action_id
      AND job_type = 'generate_article'
      AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'Une rédaction Magnum est déjà en cours.';
  END IF;

  UPDATE public.rp_pipeline_jobs
  SET status = 'cancelled', finished_at = now(), locked_at = NULL, locked_by = NULL
  WHERE action_id = p_action_id
    AND job_type = 'generate_article'
    AND status IN ('pending', 'retry', 'review', 'warning');

  UPDATE public.lore_articles
  SET narrative_certified_at = NULL, narrative_provenance = '{}'::jsonb
  WHERE id = v_article.id;

  INSERT INTO public.rp_pipeline_jobs (
    job_type, action_id, lore_article_id, payload, priority, idempotency_key
  ) VALUES (
    'generate_article',
    p_action_id,
    v_article.id,
    jsonb_build_object(
      'execution_version', v_action.execution_version,
      'recalculation', false,
      'article_only_repair', true
    ),
    10,
    'narrative-repair:' || v_article.id || ':v' || (v_article.current_version + 1)
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
    finished_at = NULL
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_rp_narrative_repair(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_rp_narrative_repair(uuid) TO authenticated, service_role;
