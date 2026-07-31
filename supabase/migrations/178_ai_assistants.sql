-- Assistants IA joueur et admin.
-- Cette migration est volontairement non appliquée lors du développement de la branche.

CREATE TABLE public.ai_assistant_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  player_enabled boolean NOT NULL DEFAULT false,
  player_model text NOT NULL DEFAULT 'gpt-5.6-luna'
    CHECK (player_model IN ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol')),
  player_effort text NOT NULL DEFAULT 'low'
    CHECK (player_effort IN ('none', 'low', 'medium', 'high', 'xhigh', 'max')),
  admin_simple_model text NOT NULL DEFAULT 'gpt-5.6-terra'
    CHECK (admin_simple_model IN ('gpt-5.6-terra', 'gpt-5.6-sol')),
  admin_complex_model text NOT NULL DEFAULT 'gpt-5.6-sol'
    CHECK (admin_complex_model IN ('gpt-5.6-terra', 'gpt-5.6-sol')),
  admin_effort text NOT NULL DEFAULT 'medium'
    CHECK (admin_effort IN ('none', 'low', 'medium', 'high', 'xhigh', 'max')),
  budget_usd numeric(12, 6) NOT NULL DEFAULT 20 CHECK (budget_usd > 0),
  prices jsonb NOT NULL DEFAULT '{
    "gpt-5.6-luna":{"input":0.20,"cached_input":0.02,"output":1.20},
    "gpt-5.6-terra":{"input":2.00,"cached_input":0.20,"output":12.00},
    "gpt-5.6-sol":{"input":5.00,"cached_input":0.50,"output":30.00}
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.ai_assistant_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UUID conservé sans clé étrangère : supprimer un compte ne doit jamais rouvrir le budget déjà dépensé.
  user_id uuid NOT NULL,
  surface text NOT NULL CHECK (surface IN ('player', 'admin_fallback')),
  model text NOT NULL CHECK (model IN ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol')),
  effort text NOT NULL CHECK (effort IN ('none', 'low', 'medium', 'high', 'xhigh', 'max')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released')),
  reserved_cost_usd numeric(12, 8) NOT NULL CHECK (reserved_cost_usd > 0),
  actual_cost_usd numeric(12, 8) CHECK (actual_cost_usd >= 0),
  input_tokens integer CHECK (input_tokens >= 0),
  cached_input_tokens integer CHECK (cached_input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX ai_usage_events_created_idx ON public.ai_usage_events(created_at DESC);
CREATE INDEX ai_usage_events_user_idx ON public.ai_usage_events(user_id, created_at DESC);
CREATE INDEX ai_usage_events_open_idx ON public.ai_usage_events(status, created_at)
  WHERE status = 'reserved';

CREATE TABLE public.ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating IN (-1, 1)),
  is_report boolean NOT NULL DEFAULT false,
  question text,
  answer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (is_report AND question IS NOT NULL AND answer IS NOT NULL
      AND char_length(question) BETWEEN 1 AND 1000 AND char_length(answer) BETWEEN 1 AND 12000)
    OR (NOT is_report AND question IS NULL AND answer IS NULL)
  )
);

CREATE INDEX ai_feedback_report_idx ON public.ai_feedback(created_at DESC)
  WHERE is_report;

CREATE TABLE public.ai_admin_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'Relais Windows',
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  sandbox_verified_at timestamptz,
  last_seen_at timestamptz,
  codex_version text,
  worker_version text,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('offline', 'idle', 'busy', 'disabled')),
  current_job_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_admin_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES public.ai_admin_workers(id) ON DELETE SET NULL,
  restore_of_job_id uuid REFERENCES public.ai_admin_jobs(id) ON DELETE SET NULL,
  execution_mode text NOT NULL CHECK (execution_mode IN ('local', 'api_fallback')),
  request_kind text NOT NULL CHECK (request_kind IN ('code_read', 'game_read', 'game_action')),
  model text,
  effort text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'claimed', 'analyzing', 'awaiting_first_approval',
    'preparing_preview', 'awaiting_second_approval', 'executing',
    'completed', 'partial', 'failed', 'cancelled', 'expired'
  )),
  stage text NOT NULL DEFAULT 'file' CHECK (stage IN (
    'file', 'analysis', 'lecture', 'plan', 'sauvegarde', 'validations', 'execution'
  )),
  prompt_text text CHECK (prompt_text IS NULL OR char_length(prompt_text) BETWEEN 1 AND 4000),
  summary text,
  plan jsonb,
  preview jsonb,
  preview_hash text,
  result jsonb,
  error_message text,
  paid_confirmed_at timestamptz,
  first_approved_at timestamptz,
  first_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  second_approved_at timestamptz,
  second_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  started_at timestamptz,
  closed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (execution_mode <> 'api_fallback' OR paid_confirmed_at IS NOT NULL)
);

CREATE INDEX ai_admin_jobs_fifo_idx ON public.ai_admin_jobs(created_at)
  WHERE status = 'queued' AND execution_mode = 'local';
CREATE INDEX ai_admin_jobs_author_idx ON public.ai_admin_jobs(author_user_id, created_at DESC);

ALTER TABLE public.ai_admin_workers
  ADD CONSTRAINT ai_admin_workers_current_job_fkey
  FOREIGN KEY (current_job_id) REFERENCES public.ai_admin_jobs(id) ON DELETE SET NULL;

CREATE TABLE public.ai_admin_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.ai_admin_jobs(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 0),
  action_id text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk text NOT NULL CHECK (risk IN ('read', 'reversible', 'isolated')),
  reversible boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'previewed', 'completed', 'failed', 'restored')),
  before_data jsonb,
  after_data jsonb,
  expected_hash text,
  result jsonb,
  error_message text,
  admin_change_log_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, sequence)
);

ALTER TABLE public.admin_change_log
  ADD COLUMN assistant_job_id uuid REFERENCES public.ai_admin_jobs(id) ON DELETE SET NULL;
CREATE INDEX admin_change_log_assistant_job_idx
  ON public.admin_change_log(assistant_job_id, created_at DESC)
  WHERE assistant_job_id IS NOT NULL;

ALTER TABLE public.ai_assistant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_admin_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_admin_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_admin_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI settings: lecture admin" ON public.ai_assistant_settings
  FOR SELECT USING ((SELECT public.is_admin()));
CREATE POLICY "AI settings: écriture admin" ON public.ai_assistant_settings
  FOR UPDATE USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "AI usage: lecture admin" ON public.ai_usage_events
  FOR SELECT USING ((SELECT public.is_admin()));

CREATE POLICY "AI feedback: création joueur" ON public.ai_feedback
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND country_id = public.get_country_for_player(auth.uid())
  );
CREATE POLICY "AI feedback: lecture admin" ON public.ai_feedback
  FOR SELECT USING ((SELECT public.is_admin()));

CREATE POLICY "AI workers: lecture admin" ON public.ai_admin_workers
  FOR SELECT USING ((SELECT public.is_admin()));

CREATE POLICY "AI jobs: auteur uniquement" ON public.ai_admin_jobs
  FOR SELECT USING (author_user_id = auth.uid() AND (SELECT public.is_admin()));
CREATE POLICY "AI jobs: création auteur" ON public.ai_admin_jobs
  FOR INSERT WITH CHECK (author_user_id = auth.uid() AND (SELECT public.is_admin()));
CREATE POLICY "AI jobs: modification auteur" ON public.ai_admin_jobs
  FOR UPDATE USING (author_user_id = auth.uid() AND (SELECT public.is_admin()))
  WITH CHECK (author_user_id = auth.uid() AND (SELECT public.is_admin()));

CREATE POLICY "AI job items: auteur uniquement" ON public.ai_admin_job_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ai_admin_jobs j
      WHERE j.id = job_id AND j.author_user_id = auth.uid()
    )
    AND (SELECT public.is_admin())
  );

CREATE OR REPLACE FUNCTION public.ai_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_settings_touch BEFORE UPDATE ON public.ai_assistant_settings
  FOR EACH ROW EXECUTE FUNCTION public.ai_touch_updated_at();
CREATE TRIGGER ai_workers_touch BEFORE UPDATE ON public.ai_admin_workers
  FOR EACH ROW EXECUTE FUNCTION public.ai_touch_updated_at();
CREATE TRIGGER ai_jobs_touch BEFORE UPDATE ON public.ai_admin_jobs
  FOR EACH ROW EXECUTE FUNCTION public.ai_touch_updated_at();
CREATE TRIGGER ai_job_items_touch BEFORE UPDATE ON public.ai_admin_job_items
  FOR EACH ROW EXECUTE FUNCTION public.ai_touch_updated_at();

CREATE OR REPLACE FUNCTION public.ai_guard_budget_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_committed numeric;
BEGIN
  SELECT COALESCE(SUM(
    CASE WHEN status = 'settled' THEN actual_cost_usd ELSE reserved_cost_usd END
  ), 0)
  INTO v_committed
  FROM public.ai_usage_events
  WHERE status IN ('reserved', 'settled');
  IF NEW.budget_usd < v_committed THEN
    RAISE EXCEPTION 'Le plafond ne peut pas être inférieur aux coûts déjà engagés.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_settings_budget_guard
  BEFORE UPDATE OF budget_usd ON public.ai_assistant_settings
  FOR EACH ROW EXECUTE FUNCTION public.ai_guard_budget_limit();

CREATE OR REPLACE FUNCTION public.ai_redact_closed_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed', 'partial', 'failed', 'cancelled', 'expired')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.prompt_text := NULL;
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_jobs_redact_before_close
  BEFORE UPDATE ON public.ai_admin_jobs
  FOR EACH ROW EXECUTE FUNCTION public.ai_redact_closed_job();

CREATE OR REPLACE FUNCTION public.ai_reserve_usage(
  p_user_id uuid,
  p_surface text,
  p_model text,
  p_effort text,
  p_reserved_cost_usd numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget numeric;
  v_committed numeric;
  v_event_id uuid;
BEGIN
  IF p_surface NOT IN ('player', 'admin_fallback')
     OR p_model NOT IN ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol')
     OR p_effort NOT IN ('none', 'low', 'medium', 'high', 'xhigh', 'max')
     OR p_reserved_cost_usd <= 0 THEN
    RAISE EXCEPTION 'Réservation IA invalide.';
  END IF;

  SELECT budget_usd INTO v_budget
  FROM public.ai_assistant_settings
  WHERE id = true
  FOR UPDATE;

  UPDATE public.ai_usage_events
  SET status = 'released', error_code = 'reservation_expired', settled_at = now()
  WHERE status = 'reserved' AND created_at < now() - interval '15 minutes';

  SELECT COALESCE(SUM(
    CASE WHEN status = 'settled' THEN actual_cost_usd ELSE reserved_cost_usd END
  ), 0)
  INTO v_committed
  FROM public.ai_usage_events
  WHERE status IN ('reserved', 'settled');

  IF v_committed + p_reserved_cost_usd > v_budget THEN
    RAISE EXCEPTION 'Le budget IA commun est atteint.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ai_usage_events (
    user_id, surface, model, effort, reserved_cost_usd
  ) VALUES (
    p_user_id, p_surface, p_model, p_effort, p_reserved_cost_usd
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_settle_usage(
  p_event_id uuid,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_output_tokens integer,
  p_actual_cost_usd numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.ai_usage_events%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.ai_assistant_settings WHERE id = true FOR UPDATE;
  SELECT * INTO v_event FROM public.ai_usage_events WHERE id = p_event_id FOR UPDATE;

  IF v_event.id IS NULL OR v_event.status <> 'reserved' THEN
    RAISE EXCEPTION 'Réservation IA introuvable ou déjà clôturée.';
  END IF;
  IF p_input_tokens < 0 OR p_cached_input_tokens < 0 OR p_output_tokens < 0
     OR p_cached_input_tokens > p_input_tokens OR p_actual_cost_usd < 0
     OR p_actual_cost_usd > v_event.reserved_cost_usd THEN
    RAISE EXCEPTION 'Coût IA incohérent avec la réservation.';
  END IF;

  UPDATE public.ai_usage_events
  SET status = 'settled', actual_cost_usd = p_actual_cost_usd,
      input_tokens = p_input_tokens, cached_input_tokens = p_cached_input_tokens,
      output_tokens = p_output_tokens, settled_at = now()
  WHERE id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_release_usage(p_event_id uuid, p_error_code text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_usage_events
  SET status = 'released', error_code = left(p_error_code, 120), settled_at = now()
  WHERE id = p_event_id AND status = 'reserved';
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_rotate_admin_worker(
  p_token_hash text,
  p_token_hint text,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id uuid;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR char_length(p_token_hint) <> 6 OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'Jeton de relais invalide.';
  END IF;

  UPDATE public.ai_admin_jobs
  SET status = 'queued', stage = 'file', worker_id = NULL, claimed_at = NULL
  WHERE worker_id IN (SELECT id FROM public.ai_admin_workers)
    AND status IN ('claimed', 'analyzing');
  DELETE FROM public.ai_admin_workers;
  INSERT INTO public.ai_admin_workers (token_hash, token_hint, created_by)
  VALUES (p_token_hash, p_token_hint, p_created_by)
  RETURNING id INTO v_worker_id;
  RETURN v_worker_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_claim_admin_job(p_worker_id uuid)
RETURNS public.ai_admin_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.ai_admin_jobs%ROWTYPE;
  v_current_job_id uuid;
BEGIN
  SELECT current_job_id INTO v_current_job_id
  FROM public.ai_admin_workers
  WHERE id = p_worker_id AND enabled AND sandbox_verified_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relais local désactivé.';
  END IF;

  IF v_current_job_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ai_admin_jobs
    WHERE id = v_current_job_id
      AND status IN ('claimed', 'analyzing', 'executing')
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE public.ai_admin_jobs
  SET status = 'expired'
  WHERE status NOT IN ('completed', 'partial', 'failed', 'cancelled', 'expired', 'executing')
    AND expires_at <= now();

  SELECT * INTO v_job
  FROM public.ai_admin_jobs
  WHERE execution_mode = 'local' AND status = 'queued' AND expires_at > now()
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.ai_admin_jobs
  SET status = 'claimed', stage = 'analysis', worker_id = p_worker_id,
      claimed_at = now(), started_at = COALESCE(started_at, now())
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  UPDATE public.ai_admin_workers
  SET current_job_id = v_job.id, status = 'busy', last_seen_at = now()
  WHERE id = p_worker_id;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_reserve_usage(uuid, text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_settle_usage(uuid, integer, integer, integer, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_release_usage(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_rotate_admin_worker(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_claim_admin_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_reserve_usage(uuid, text, text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_settle_usage(uuid, integer, integer, integer, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_release_usage(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_rotate_admin_worker(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_claim_admin_job(uuid) TO service_role;

COMMENT ON TABLE public.ai_usage_events IS 'Réservations atomiques et coûts réels des appels OpenAI, sans contenu de conversation.';
COMMENT ON TABLE public.ai_admin_jobs IS 'File persistante des demandes admin ; le texte initial est effacé à la clôture.';
