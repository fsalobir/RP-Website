-- Pipeline RP unifié : actions, contexte Discord, Magnum, conséquences et publication fiable.
-- IMPORTANT : exporter les anciennes tables Discord/IA avant d'appliquer cette migration en production.

-- La migration 159 a déjà suspendu les anciens processeurs dans une transaction séparée.
DO $$
DECLARE
  v_suspended_at timestamptz;
BEGIN
  SELECT COALESCE(
    (
      SELECT NULLIF(value #>> '{}', '')::timestamptz
      FROM public.rule_parameters
      WHERE key = 'legacy_rp_pipeline_suspended_at'
    ),
    (
      SELECT updated_at
      FROM public.rule_parameters
      WHERE key = 'process_due_edge_enabled'
        AND value = 'false'::jsonb
    )
  )
  INTO v_suspended_at
  ;

  IF EXISTS (SELECT 1 FROM public.ai_event_requests)
     AND (
       v_suspended_at IS NULL
       OR v_suspended_at > clock_timestamp() - interval '10 minutes'
     ) THEN
    RAISE EXCEPTION
      'Attendre 10 minutes après la coupure 159 avant la migration 160.';
  END IF;
END;
$$;

-- Le lancement prévoit explicitement de repartir sans ancien stock d'événements exporté.
TRUNCATE TABLE public.ai_event_requests;

-- ========= Personnel RP =========

CREATE TABLE public.rp_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'mj' CHECK (role IN ('admin', 'mj')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.rp_staff (user_id, role)
SELECT user_id, 'admin'
FROM public.admins
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

CREATE OR REPLACE FUNCTION public.is_rp_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.admins WHERE user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.rp_staff WHERE user_id = (SELECT auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_rp()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT auth.jwt())->>'role', '') = 'service_role'
    OR public.is_rp_staff();
$$;

ALTER TABLE public.rp_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RP staff: lecture équipe"
  ON public.rp_staff FOR SELECT USING ((SELECT public.is_rp_staff()));
CREATE POLICY "RP staff: gestion admin"
  ON public.rp_staff FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ========= Configuration des actions =========

CREATE OR REPLACE FUNCTION public.rp_d100_outcome(p_roll integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
  IF p_roll < 1 OR p_roll > 100 THEN
    RAISE EXCEPTION 'Le jet D100 doit être compris entre 1 et 100.';
  END IF;
  RETURN CASE
    WHEN p_roll = 1 THEN 'critical_failure'
    WHEN p_roll <= 24 THEN 'major_failure'
    WHEN p_roll <= 49 THEN 'minor_failure'
    WHEN p_roll <= 74 THEN 'minor_success'
    WHEN p_roll <= 99 THEN 'major_success'
    ELSE 'critical_success'
  END;
END;
$$;

CREATE TABLE public.action_automation_configs (
  action_type_id uuid PRIMARY KEY REFERENCES public.state_action_types(id) ON DELETE CASCADE,
  enabled_for_major boolean NOT NULL DEFAULT false,
  enabled_for_minor boolean NOT NULL DEFAULT false,
  weight numeric NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 1000),
  requires_target boolean NOT NULL DEFAULT true,
  preconditions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(preconditions) = 'object'),
  cooldown_hours numeric NOT NULL DEFAULT 24 CHECK (cooldown_hours >= 0),
  roll_mode text NOT NULL DEFAULT 'auto' CHECK (roll_mode IN ('auto', 'mj')),
  validation_mode text NOT NULL DEFAULT 'mj' CHECK (validation_mode IN ('auto', 'mj')),
  publish_failures boolean NOT NULL DEFAULT true,
  article_profile text NOT NULL DEFAULT 'standard' CHECK (article_profile IN ('brief', 'standard', 'dossier')),
  max_context_articles smallint NOT NULL DEFAULT 8 CHECK (max_context_articles BETWEEN 1 AND 8),
  context_window_rp_months smallint NOT NULL DEFAULT 12 CHECK (context_window_rp_months BETWEEN 1 AND 120),
  discord_destination text NOT NULL DEFAULT 'international'
    CHECK (discord_destination IN ('national', 'international')),
  embed_color integer NOT NULL DEFAULT 3046706 CHECK (embed_color BETWEEN 0 AND 16777215),
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(image_urls) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.action_automation_configs (
  action_type_id,
  enabled_for_major,
  enabled_for_minor,
  requires_target,
  validation_mode,
  discord_destination
)
SELECT
  sat.id,
  COALESCE(cfg.value->'allowed_action_type_keys_major', '[]'::jsonb) ? sat.key,
  COALESCE(cfg.value->'allowed_action_type_keys_minor', '[]'::jsonb) ? sat.key,
  sat.key NOT IN ('demande_up', 'effort_fortifications', 'investissements'),
  CASE
    WHEN COALESCE((cfg.value->'auto_accept_by_action_type'->>sat.key)::boolean, false) THEN 'auto'
    ELSE 'mj'
  END,
  COALESCE((
    SELECT ddt.destination
    FROM public.discord_dispatch_types ddt
    WHERE ddt.state_action_type_id = sat.id AND ddt.outcome = 'accepted'
    ORDER BY ddt.sort_order
    LIMIT 1
  ), 'international')
FROM public.state_action_types sat
LEFT JOIN public.rule_parameters cfg ON cfg.key = 'ai_events_config'
ON CONFLICT (action_type_id) DO NOTHING;

ALTER TABLE public.action_automation_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Action automation: lecture équipe RP"
  ON public.action_automation_configs FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "Action automation: gestion admin"
  ON public.action_automation_configs FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE TRIGGER action_automation_configs_updated_at
  BEFORE UPDATE ON public.action_automation_configs
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_rp_action_target_invariant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_key text;
BEGIN
  SELECT key INTO v_action_key
  FROM public.state_action_types
  WHERE id = NEW.action_type_id;

  IF v_action_key IN (
    'insulte_diplomatique', 'escarmouche_militaire', 'conflit_arme',
    'guerre_ouverte', 'ouverture_diplomatique', 'prise_influence', 'espionnage'
  ) AND NOT NEW.requires_target THEN
    RAISE EXCEPTION 'Ce type d''action exige mécaniquement un pays cible.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_rp_action_target_invariant_trigger
  BEFORE INSERT OR UPDATE OF action_type_id, requires_target
  ON public.action_automation_configs
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_rp_action_target_invariant();

ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS discord_role_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'countries_discord_role_id_digits'
      AND conrelid = 'public.countries'::regclass
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_discord_role_id_digits
      CHECK (discord_role_id IS NULL OR discord_role_id ~ '^[0-9]+$');
  END IF;
END
$$;

CREATE UNIQUE INDEX country_players_discord_user_unique
  ON public.country_players(discord_user_id)
  WHERE discord_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_country_discord_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.discord_role_id IS DISTINCT FROM OLD.discord_role_id
     AND COALESCE((SELECT auth.jwt())->>'role', '') <> 'service_role'
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut modifier le rôle Discord d''un pays.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_country_discord_role_trigger
  BEFORE UPDATE OF discord_role_id ON public.countries
  FOR EACH ROW EXECUTE PROCEDURE public.protect_country_discord_role();

ALTER TABLE public.ai_event_requests
  ADD COLUMN target_country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  ADD COLUMN decision_status text NOT NULL DEFAULT 'pending'
    CHECK (decision_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN execution_status text NOT NULL DEFAULT 'waiting_decision'
    CHECK (execution_status IN (
      'waiting_decision', 'waiting_roll', 'waiting_article', 'waiting_review',
      'ready', 'applying', 'publishing', 'completed', 'warning', 'cancelled'
    )),
  ADD COLUMN importance text NOT NULL DEFAULT 'minor' CHECK (importance IN ('major', 'minor')),
  ADD COLUMN world_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(world_snapshot) = 'object'),
  ADD COLUMN parent_action_id uuid REFERENCES public.ai_event_requests(id) ON DELETE SET NULL,
  ADD COLUMN selection_explanation text,
  ADD COLUMN intent text,
  ADD COLUMN stakes text,
  ADD COLUMN mj_notes text,
  ADD COLUMN manual_preconditions_bypassed boolean NOT NULL DEFAULT false,
  ADD COLUMN roll_mode text NOT NULL DEFAULT 'auto' CHECK (roll_mode IN ('auto', 'mj')),
  ADD COLUMN d100_roll smallint CHECK (d100_roll BETWEEN 1 AND 100),
  ADD COLUMN d100_outcome text CHECK (d100_outcome IS NULL OR d100_outcome IN (
    'critical_failure', 'major_failure', 'minor_failure',
    'minor_success', 'major_success', 'critical_success'
  )),
  ADD COLUMN pending_dice_results jsonb,
  ADD COLUMN pending_consequence_plan jsonb,
  ADD COLUMN pending_execution_version integer CHECK (pending_execution_version IS NULL OR pending_execution_version > 0),
  ADD COLUMN validation_mode text NOT NULL DEFAULT 'mj' CHECK (validation_mode IN ('auto', 'mj')),
  ADD COLUMN article_profile text NOT NULL DEFAULT 'standard'
    CHECK (article_profile IN ('brief', 'standard', 'dossier')),
  ADD COLUMN context_source_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN context_fact_sheet jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_fact_sheet) = 'object'),
  ADD COLUMN consequence_plan jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(consequence_plan) = 'array'),
  ADD COLUMN execution_version integer NOT NULL DEFAULT 0 CHECK (execution_version >= 0),
  ADD COLUMN article_invalid_attempts smallint NOT NULL DEFAULT 0 CHECK (article_invalid_attempts BETWEEN 0 AND 2),
  ADD COLUMN article_approved_at timestamptz,
  ADD COLUMN consequences_recalculated_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT ai_event_requests_parent_not_self CHECK (parent_action_id IS NULL OR parent_action_id <> id),
  ADD CONSTRAINT ai_event_requests_context_source_limit CHECK (cardinality(context_source_ids) <= 8);

CREATE INDEX idx_ai_event_requests_target ON public.ai_event_requests(target_country_id);
CREATE INDEX idx_ai_event_requests_parent ON public.ai_event_requests(parent_action_id);
CREATE INDEX idx_ai_event_requests_pipeline
  ON public.ai_event_requests(execution_status, scheduled_trigger_at, created_at);

DROP POLICY IF EXISTS "AI event requests: lecture et écriture admin" ON public.ai_event_requests;
CREATE POLICY "AI event requests: lecture équipe RP"
  ON public.ai_event_requests FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "AI event requests: gestion admin"
  ON public.ai_event_requests FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE TRIGGER ai_event_requests_updated_at
  BEFORE UPDATE ON public.ai_event_requests
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ========= Conversion date réelle / date RP =========

CREATE TABLE public.world_date_anchors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  real_at timestamptz NOT NULL DEFAULT now(),
  rp_year integer NOT NULL,
  rp_month smallint NOT NULL CHECK (rp_month BETWEEN 1 AND 12),
  rp_month_index integer GENERATED ALWAYS AS (rp_year * 12 + rp_month - 1) STORED,
  rp_month_fraction numeric NOT NULL DEFAULT 0
    CHECK (rp_month_fraction >= 0 AND rp_month_fraction < 1),
  rp_months_per_real_day numeric NOT NULL DEFAULT 1 CHECK (rp_months_per_real_day > 0),
  paused boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'engine' CHECK (source IN ('engine', 'manual', 'cadence', 'pause')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_world_date_anchors_real ON public.world_date_anchors(real_at);
CREATE INDEX idx_world_date_anchors_rp ON public.world_date_anchors(rp_month_index);

ALTER TABLE public.world_date_anchors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "World date anchors: lecture équipe RP"
  ON public.world_date_anchors FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "World date anchors: gestion admin"
  ON public.world_date_anchors FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.capture_world_date_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_world jsonb;
  v_rate numeric;
  v_paused boolean;
  v_source text;
  v_anchor_year integer;
  v_anchor_month integer;
  v_anchor_fraction numeric := 0;
  v_previous public.world_date_anchors%ROWTYPE;
  v_position numeric;
  v_index integer;
BEGIN
  IF NEW.key NOT IN ('world_date', 'world_date_advance_months', 'cron_paused') THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_world FROM public.rule_parameters WHERE key = 'world_date';
  IF v_world IS NULL OR jsonb_typeof(v_world) <> 'object' THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::numeric ELSE 1 END
  INTO v_rate
  FROM public.rule_parameters
  WHERE key = 'world_date_advance_months';

  SELECT CASE WHEN jsonb_typeof(value) = 'boolean' THEN (value #>> '{}')::boolean ELSE false END
  INTO v_paused
  FROM public.rule_parameters
  WHERE key = 'cron_paused';

  v_source := CASE NEW.key
    WHEN 'world_date' THEN 'engine'
    WHEN 'world_date_advance_months' THEN 'cadence'
    ELSE 'pause'
  END;

  IF NEW.key = 'world_date' THEN
    v_anchor_year := (v_world->>'year')::integer;
    v_anchor_month := (v_world->>'month')::integer;
  ELSE
    SELECT * INTO v_previous
    FROM public.world_date_anchors
    WHERE real_at <= now()
    ORDER BY real_at DESC, id DESC
    LIMIT 1;
    IF v_previous.id IS NULL THEN
      v_anchor_year := (v_world->>'year')::integer;
      v_anchor_month := (v_world->>'month')::integer;
    ELSE
      v_position := v_previous.rp_month_index + v_previous.rp_month_fraction;
      IF NOT v_previous.paused THEN
        v_position := v_position
          + EXTRACT(EPOCH FROM (now() - v_previous.real_at)) / 86400
          * v_previous.rp_months_per_real_day;
      END IF;
      v_index := floor(v_position)::integer;
      v_anchor_year := floor(v_index / 12.0)::integer;
      v_anchor_month := ((v_index % 12) + 12) % 12 + 1;
      v_anchor_fraction := v_position - v_index;
    END IF;
  END IF;

  INSERT INTO public.world_date_anchors (
    real_at, rp_year, rp_month, rp_month_fraction,
    rp_months_per_real_day, paused, source, created_by
  ) VALUES (
    now(),
    v_anchor_year,
    v_anchor_month,
    v_anchor_fraction,
    GREATEST(COALESCE(v_rate, 1), 0.0001),
    COALESCE(v_paused, false),
    v_source,
    (SELECT auth.uid())
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER capture_world_date_anchor_trigger
  AFTER INSERT OR UPDATE ON public.rule_parameters
  FOR EACH ROW EXECUTE PROCEDURE public.capture_world_date_anchor();

INSERT INTO public.world_date_anchors (
  rp_year, rp_month, rp_months_per_real_day, paused, source
)
SELECT
  (wd.value->>'year')::integer,
  (wd.value->>'month')::smallint,
  GREATEST(COALESCE((
    SELECT CASE WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::numeric ELSE 1 END
    FROM public.rule_parameters WHERE key = 'world_date_advance_months'
  ), 1), 0.0001),
  COALESCE((
    SELECT CASE WHEN jsonb_typeof(value) = 'boolean' THEN (value #>> '{}')::boolean ELSE false END
    FROM public.rule_parameters WHERE key = 'cron_paused'
  ), false),
  'manual'
FROM public.rule_parameters wd
WHERE wd.key = 'world_date'
  AND jsonb_typeof(wd.value) = 'object'
  AND NOT EXISTS (SELECT 1 FROM public.world_date_anchors);

CREATE OR REPLACE FUNCTION public.get_probable_rp_date(p_real_at timestamptz DEFAULT now())
RETURNS TABLE (
  rp_year integer,
  rp_month integer,
  rp_day integer,
  rp_week integer,
  estimated boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous public.world_date_anchors%ROWTYPE;
  v_next public.world_date_anchors%ROWTYPE;
  v_months numeric := 0;
  v_total numeric;
  v_previous_position numeric;
  v_next_position numeric;
  v_index integer;
  v_fraction numeric;
  v_days_in_month integer;
BEGIN
  SELECT * INTO v_previous
  FROM public.world_date_anchors
  WHERE real_at <= p_real_at
  ORDER BY real_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_previous
    FROM public.world_date_anchors
    ORDER BY real_at, id
    LIMIT 1;
  END IF;

  IF v_previous.id IS NULL THEN
    RETURN;
  END IF;

  v_previous_position := v_previous.rp_month_index + v_previous.rp_month_fraction;

  SELECT * INTO v_next
  FROM public.world_date_anchors
  WHERE real_at > v_previous.real_at
  ORDER BY real_at, id
  LIMIT 1;

  IF NOT v_previous.paused THEN
    v_next_position := CASE
      WHEN v_next.id IS NULL THEN NULL
      ELSE v_next.rp_month_index + v_next.rp_month_fraction
    END;
    IF v_next.id IS NOT NULL
       AND v_next_position > v_previous_position
       AND v_next.real_at > v_previous.real_at THEN
      v_months :=
        EXTRACT(EPOCH FROM (p_real_at - v_previous.real_at))
        / EXTRACT(EPOCH FROM (v_next.real_at - v_previous.real_at))
        * (v_next_position - v_previous_position);
    ELSE
      v_months :=
        EXTRACT(EPOCH FROM (p_real_at - v_previous.real_at))
        / 86400
        * v_previous.rp_months_per_real_day;
      IF v_next.id IS NOT NULL THEN
        v_months := LEAST(v_months, 0.999999);
      END IF;
    END IF;
  END IF;

  v_total := v_previous_position + GREATEST(v_months, 0);
  v_index := floor(v_total)::integer;
  v_fraction := v_total - v_index;

  rp_year := floor(v_index / 12.0)::integer;
  rp_month := ((v_index % 12) + 12) % 12 + 1;
  v_days_in_month := EXTRACT(day FROM (
    make_date(rp_year, rp_month, 1) + interval '1 month - 1 day'
  ))::integer;
  rp_day := LEAST(v_days_in_month, floor(v_fraction * v_days_in_month)::integer + 1);
  rp_week := LEAST(5, floor((rp_day - 1) / 7.0)::integer + 1);
  estimated := p_real_at <> v_previous.real_at;
  RETURN NEXT;
END;
$$;

-- ========= Routage Discord =========

CREATE TABLE public.discord_rp_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  guild_id text CHECK (guild_id IS NULL OR guild_id ~ '^[0-9]+$'),
  channel_id text NOT NULL CHECK (channel_id ~ '^[0-9]+$'),
  is_public boolean NOT NULL DEFAULT true CHECK (is_public),
  ingest_enabled boolean NOT NULL DEFAULT false,
  publish_enabled boolean NOT NULL DEFAULT false,
  route_scope text NOT NULL CHECK (route_scope IN ('country', 'action_type', 'continent', 'default')),
  channel_kind text NOT NULL DEFAULT 'international'
    CHECK (channel_kind IN ('national', 'international')),
  source_authority text NOT NULL DEFAULT 'player'
    CHECK (source_authority IN ('official', 'player')),
  country_id uuid REFERENCES public.countries(id) ON DELETE CASCADE,
  action_type_id uuid REFERENCES public.state_action_types(id) ON DELETE CASCADE,
  continent_id uuid REFERENCES public.continents(id) ON DELETE CASCADE,
  priority smallint NOT NULL DEFAULT 100,
  webhook_secret_name text CHECK (
    webhook_secret_name IS NULL OR webhook_secret_name ~ '^[A-Z][A-Z0-9_]*$'
  ),
  cursor_message_id text,
  last_sync_at timestamptz,
  sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      route_scope = 'country'
      AND country_id IS NOT NULL
      AND action_type_id IS NULL
      AND continent_id IS NULL
    )
    OR (
      route_scope = 'action_type'
      AND country_id IS NULL
      AND action_type_id IS NOT NULL
      AND continent_id IS NULL
    )
    OR (
      route_scope = 'continent'
      AND country_id IS NULL
      AND action_type_id IS NULL
      AND continent_id IS NOT NULL
    )
    OR (
      route_scope = 'default'
      AND country_id IS NULL
      AND action_type_id IS NULL
      AND continent_id IS NULL
    )
  ),
  CHECK (NOT (ingest_enabled OR publish_enabled) OR guild_id IS NOT NULL),
  CHECK (NOT publish_enabled OR webhook_secret_name IS NOT NULL)
);

CREATE INDEX idx_discord_rp_channels_route
  ON public.discord_rp_channels(route_scope, country_id, action_type_id, continent_id, channel_kind, priority);
CREATE UNIQUE INDEX discord_rp_channels_one_ingest_per_channel
  ON public.discord_rp_channels(channel_id)
  WHERE ingest_enabled;

INSERT INTO public.discord_rp_channels (
  label, channel_id, route_scope, channel_kind, continent_id, priority
)
SELECT
  c.label_fr || ' — ' || CASE drc.channel_kind
    WHEN 'national' THEN 'National'
    ELSE 'International'
  END,
  drc.discord_channel_id,
  'continent',
  drc.channel_kind,
  drc.continent_id,
  100
FROM public.discord_region_channels drc
JOIN public.continents c ON c.id = drc.continent_id
WHERE drc.discord_channel_id ~ '^[0-9]+$'
ON CONFLICT DO NOTHING;

ALTER TABLE public.discord_rp_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Discord RP channels: lecture équipe RP"
  ON public.discord_rp_channels FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "Discord RP channels: gestion admin"
  ON public.discord_rp_channels FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE TRIGGER discord_rp_channels_updated_at
  BEFORE UPDATE ON public.discord_rp_channels
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ========= Bibliothèque de contexte =========

CREATE TABLE public.lore_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('engine', 'mj', 'official', 'player', 'unclassified')),
  source_platform text NOT NULL CHECK (source_platform IN ('engine', 'discord', 'manual')),
  action_id uuid REFERENCES public.ai_event_requests(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sections) = 'array'),
  raw_content text NOT NULL DEFAULT '',
  clean_content text NOT NULL DEFAULT '',
  current_output jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(current_output) = 'object'),
  current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  published_output jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(published_output) = 'object'),
  published_version integer NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  source_ids uuid[] NOT NULL DEFAULT '{}'::uuid[] CHECK (cardinality(source_ids) <= 8),
  discord_route_id uuid REFERENCES public.discord_rp_channels(id) ON DELETE SET NULL,
  discord_guild_id text,
  discord_channel_id text,
  discord_message_id text,
  discord_author_user_id text,
  discord_author_name text,
  discord_webhook_id text,
  discord_is_bot boolean NOT NULL DEFAULT false,
  embeds jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(embeds) = 'array'),
  links text[] NOT NULL DEFAULT '{}'::text[],
  real_published_at timestamptz,
  source_edited_at timestamptz,
  rp_year integer,
  rp_month smallint CHECK (rp_month IS NULL OR rp_month BETWEEN 1 AND 12),
  rp_day smallint CHECK (rp_day IS NULL OR rp_day BETWEEN 1 AND 31),
  rp_week smallint CHECK (rp_week IS NULL OR rp_week BETWEEN 1 AND 5),
  editorial_status text NOT NULL DEFAULT 'draft'
    CHECK (editorial_status IN ('draft', 'review', 'approved', 'published', 'quarantined')),
  approved_for_execution_version integer
    CHECK (approved_for_execution_version IS NULL OR approved_for_execution_version > 0),
  classification_status text NOT NULL DEFAULT 'pending'
    CHECK (classification_status IN ('pending', 'classified', 'ambiguous', 'quarantined')),
  classification_locked boolean NOT NULL DEFAULT false,
  classified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  classified_at timestamptz,
  nsfw_quarantined boolean NOT NULL DEFAULT false,
  quarantine_reason text,
  content_hash text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX lore_articles_discord_message_unique
  ON public.lore_articles(discord_channel_id, discord_message_id)
  WHERE discord_message_id IS NOT NULL;
CREATE UNIQUE INDEX lore_articles_generated_action_unique
  ON public.lore_articles(action_id)
  WHERE action_id IS NOT NULL AND source_platform = 'engine';
CREATE INDEX idx_lore_articles_search
  ON public.lore_articles(rp_year DESC, rp_month DESC, source_kind, editorial_status);
CREATE INDEX idx_lore_articles_action ON public.lore_articles(action_id);

CREATE TABLE public.lore_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lore_article_id uuid NOT NULL REFERENCES public.lore_articles(id) ON DELETE CASCADE,
  action_execution_version integer NOT NULL DEFAULT 1 CHECK (action_execution_version > 0),
  stage text NOT NULL CHECK (stage IN ('analysis', 'draft', 'final', 'manual')),
  attempt_no smallint NOT NULL DEFAULT 1 CHECK (attempt_no > 0),
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_content text NOT NULL DEFAULT '',
  clean_content text NOT NULL DEFAULT '',
  validation_errors text[] NOT NULL DEFAULT '{}'::text[],
  source_ids uuid[] NOT NULL DEFAULT '{}'::uuid[] CHECK (cardinality(source_ids) <= 8),
  fact_sheet jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fact_sheet) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lore_article_id, action_execution_version, stage, attempt_no)
);

CREATE INDEX idx_lore_article_versions_article
  ON public.lore_article_versions(lore_article_id, action_execution_version, created_at);

CREATE TABLE public.lore_article_countries (
  lore_article_id uuid NOT NULL REFERENCES public.lore_articles(id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  relation_role text NOT NULL CHECK (relation_role IN ('author', 'target', 'mentioned')),
  PRIMARY KEY (lore_article_id, country_id, relation_role)
);

CREATE INDEX idx_lore_article_countries_country
  ON public.lore_article_countries(country_id, relation_role);

CREATE TABLE public.lore_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_-]+$'),
  label_fr text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.lore_tags (key, label_fr) VALUES
  ('diplomatie', 'Diplomatie'),
  ('militaire', 'Militaire'),
  ('economie', 'Économie'),
  ('politique', 'Politique intérieure'),
  ('societe', 'Société'),
  ('technologie', 'Technologie'),
  ('renseignement', 'Renseignement'),
  ('crise', 'Crise'),
  ('alliance', 'Alliance'),
  ('conflit', 'Conflit'),
  ('commerce', 'Commerce'),
  ('humanitaire', 'Humanitaire')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.lore_article_tags (
  lore_article_id uuid NOT NULL REFERENCES public.lore_articles(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.lore_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (lore_article_id, tag_id)
);

CREATE TABLE public.action_lore_sources (
  action_id uuid NOT NULL REFERENCES public.ai_event_requests(id) ON DELETE CASCADE,
  lore_article_id uuid NOT NULL REFERENCES public.lore_articles(id) ON DELETE CASCADE,
  source_rank smallint NOT NULL CHECK (source_rank BETWEEN 1 AND 8),
  authority_score numeric NOT NULL DEFAULT 0,
  relevance_score numeric NOT NULL DEFAULT 0,
  is_contradictory boolean NOT NULL DEFAULT false,
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action_id, lore_article_id),
  UNIQUE (action_id, source_rank)
);

ALTER TABLE public.lore_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lore_article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lore_article_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lore_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lore_article_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_lore_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lore articles: lecture équipe RP" ON public.lore_articles FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "Lore articles: gestion admin" ON public.lore_articles FOR ALL
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Lore versions: lecture équipe RP" ON public.lore_article_versions FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "Lore versions: gestion admin" ON public.lore_article_versions FOR ALL
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Lore countries: lecture équipe RP" ON public.lore_article_countries FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "Lore countries: gestion admin" ON public.lore_article_countries FOR ALL
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Lore tags: lecture équipe RP" ON public.lore_tags FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "Lore tags: gestion admin" ON public.lore_tags FOR ALL
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Lore article tags: lecture équipe RP" ON public.lore_article_tags FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "Lore article tags: gestion admin" ON public.lore_article_tags FOR ALL
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Action lore sources: lecture équipe RP" ON public.action_lore_sources FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "Action lore sources: gestion admin" ON public.action_lore_sources FOR ALL
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.keep_lore_article_version_monotonic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.clean_content IS DISTINCT FROM OLD.clean_content
     OR NEW.sections IS DISTINCT FROM OLD.sections
     OR NEW.current_output IS DISTINCT FROM OLD.current_output THEN
    NEW.current_version := GREATEST(OLD.current_version + 1, NEW.current_version);
  ELSE
    NEW.current_version := GREATEST(OLD.current_version, NEW.current_version);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lore_articles_monotonic_version
  BEFORE UPDATE ON public.lore_articles
  FOR EACH ROW EXECUTE PROCEDURE public.keep_lore_article_version_monotonic();

CREATE TRIGGER lore_articles_updated_at
  BEFORE UPDATE ON public.lore_articles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ========= File d'attente =========

CREATE TABLE public.rp_pipeline_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('generate_article', 'publish_discord', 'discord_sync')),
  action_id uuid REFERENCES public.ai_event_requests(id) ON DELETE CASCADE,
  lore_article_id uuid REFERENCES public.lore_articles(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  priority smallint NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'retry', 'review', 'succeeded', 'warning', 'cancelled')),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX idx_rp_pipeline_jobs_due
  ON public.rp_pipeline_jobs(priority, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry', 'running');
CREATE INDEX idx_rp_pipeline_jobs_action ON public.rp_pipeline_jobs(action_id, created_at DESC);
CREATE UNIQUE INDEX rp_pipeline_jobs_one_active_discord_sync_route
  ON public.rp_pipeline_jobs ((payload->>'route_id'))
  WHERE job_type = 'discord_sync'
    AND status IN ('pending', 'running', 'retry', 'warning');
CREATE UNIQUE INDEX rp_pipeline_jobs_one_active_publication
  ON public.rp_pipeline_jobs (lore_article_id)
  WHERE job_type = 'publish_discord'
    AND status IN ('pending', 'running', 'retry');

ALTER TABLE public.rp_pipeline_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RP pipeline jobs: lecture équipe RP"
  ON public.rp_pipeline_jobs FOR SELECT
  USING ((SELECT public.is_rp_staff()));
CREATE POLICY "RP pipeline jobs: gestion admin"
  ON public.rp_pipeline_jobs FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE TRIGGER rp_pipeline_jobs_updated_at
  BEFORE UPDATE ON public.rp_pipeline_jobs
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE OR REPLACE FUNCTION public.claim_rp_pipeline_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 2
)
RETURNS SETOF public.rp_pipeline_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 2), 1), 2);
  v_magnum_slots integer;
  v_claimed integer := 0;
  v_job public.rp_pipeline_jobs%ROWTYPE;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  IF NULLIF(btrim(p_worker_id), '') IS NULL THEN
    RAISE EXCEPTION 'Identifiant worker manquant.';
  END IF;

  -- Sérialise uniquement la réservation, pas l'exécution des appels.
  PERFORM pg_advisory_xact_lock(hashtext('claim_rp_pipeline_jobs'));

  SELECT GREATEST(0, 2 - count(*))::integer
  INTO v_magnum_slots
  FROM public.rp_pipeline_jobs
  WHERE job_type = 'generate_article'
    AND status = 'running'
    AND locked_at >= now() - interval '15 minutes';

  WHILE v_claimed < v_limit LOOP
    SELECT *
    INTO v_job
    FROM public.rp_pipeline_jobs
    WHERE (
      (status IN ('pending', 'retry') AND next_attempt_at <= now())
      OR (status = 'running' AND locked_at < now() - interval '15 minutes')
    )
      AND (job_type <> 'generate_article' OR v_magnum_slots > 0)
    ORDER BY priority, next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    EXIT WHEN NOT FOUND;

    UPDATE public.rp_pipeline_jobs
    SET
      status = 'running',
      attempt_count = attempt_count + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      last_error = NULL,
      finished_at = NULL
    WHERE id = v_job.id
    RETURNING * INTO v_job;

    IF v_job.job_type = 'generate_article' THEN
      v_magnum_slots := v_magnum_slots - 1;
    END IF;
    v_claimed := v_claimed + 1;
    RETURN NEXT v_job;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_rp_pipeline_jobs(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rp_pipeline_jobs(text, integer) TO service_role;

-- ========= Registre transactionnel des conséquences =========

-- Le tick quotidien et les conséquences RP ne doivent jamais se croiser.
INSERT INTO public.rule_parameters (key, value, description)
VALUES (
  'rp_world_tick_version',
  '0'::jsonb,
  'Compteur interne des ticks du monde, utilisé pour garantir les corrections de jet.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.rule_parameters (key, value, description)
VALUES (
  'rp_ideology_persistence',
  '{"active": false}'::jsonb,
  'Verrou interne couvrant le calcul TypeScript des idéologies du monde.'
)
ON CONFLICT (key) DO NOTHING;

ALTER FUNCTION public.run_daily_country_update()
  RENAME TO _rp_run_daily_country_update_unlocked;

REVOKE ALL ON FUNCTION public._rp_run_daily_country_update_unlocked()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._rp_assert_ideology_persistence_idle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('rp:world-tick', 0));
  SELECT value INTO v_state
  FROM public.rule_parameters
  WHERE key = 'rp_ideology_persistence'
  FOR UPDATE;

  IF COALESCE((v_state->>'active')::boolean, false)
     AND COALESCE((v_state->>'started_at')::timestamptz, '-infinity'::timestamptz)
       > clock_timestamp() - interval '10 minutes' THEN
    RAISE EXCEPTION 'Le calcul des idéologies du monde est encore en cours.';
  END IF;

  IF COALESCE((v_state->>'active')::boolean, false) THEN
    UPDATE public.rule_parameters
    SET value = '{"active": false}'::jsonb, updated_at = clock_timestamp()
    WHERE key = 'rp_ideology_persistence';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_rp_ideology_persistence()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  PERFORM public._rp_assert_ideology_persistence_idle();
  UPDATE public.rule_parameters
  SET
    value = jsonb_build_object(
      'active', true,
      'token', v_token,
      'started_at', clock_timestamp()
    ),
    updated_at = clock_timestamp()
  WHERE key = 'rp_ideology_persistence';
  RETURN v_token;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.abort_rp_ideology_persistence(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('rp:world-tick', 0));
  UPDATE public.rule_parameters
  SET value = '{"active": false}'::jsonb, updated_at = clock_timestamp()
  WHERE key = 'rp_ideology_persistence'
    AND COALESCE((value->>'active')::boolean, false)
    AND NULLIF(value->>'token', '')::uuid = p_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_daily_country_update(
  p_force boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paused boolean;
BEGIN
  IF NOT p_force THEN
    SELECT COALESCE((value #>> '{}')::boolean, false)
    INTO v_paused
    FROM public.rule_parameters
    WHERE key = 'cron_paused';
    IF COALESCE(v_paused, false) THEN
      RETURN;
    END IF;
  END IF;

  PERFORM public._rp_assert_ideology_persistence_idle();
  PERFORM public._rp_run_daily_country_update_unlocked();
  UPDATE public.rule_parameters
  SET
    value = to_jsonb(COALESCE((value #>> '{}')::bigint, 0) + 1),
    updated_at = clock_timestamp()
  WHERE key = 'rp_world_tick_version';
END;
$$;

REVOKE ALL ON FUNCTION public._rp_assert_ideology_persistence_idle()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.begin_rp_ideology_persistence()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_rp_ideology_persistence(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abort_rp_ideology_persistence(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_daily_country_update(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_rp_ideology_persistence()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_rp_ideology_persistence(uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.abort_rp_ideology_persistence(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.run_daily_country_update(boolean)
  TO service_role;

CREATE TABLE public.action_execution_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_id uuid NOT NULL REFERENCES public.ai_event_requests(id) ON DELETE CASCADE,
  execution_version integer NOT NULL CHECK (execution_version > 0),
  sequence_no smallint NOT NULL CHECK (sequence_no > 0),
  world_tick_version bigint NOT NULL DEFAULT 0 CHECK (world_tick_version >= 0),
  operation_kind text NOT NULL CHECK (operation_kind IN (
    'relation_delta', 'control_delta', 'country_delta',
    'military_unit_delta', 'intel_delta', 'effect_insert'
  )),
  target_table text NOT NULL CHECK (target_table IN (
    'country_relations', 'country_control', 'countries',
    'country_military_units', 'country_intel', 'country_effects'
  )),
  target_key jsonb NOT NULL CHECK (jsonb_typeof(target_key) = 'object'),
  before_state jsonb NOT NULL CHECK (jsonb_typeof(before_state) = 'object'),
  after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reverted_at timestamptz,
  UNIQUE (action_id, execution_version, sequence_no)
);

CREATE INDEX idx_action_execution_ledger_active
  ON public.action_execution_ledger(action_id, execution_version, sequence_no)
  WHERE reverted_at IS NULL;

ALTER TABLE public.action_execution_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Action ledger: équipe RP"
  ON public.action_execution_ledger FOR SELECT
  USING ((SELECT public.is_rp_staff()));

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

CREATE TRIGGER enrich_rp_control_ledger_trigger
  BEFORE INSERT ON public.action_execution_ledger
  FOR EACH ROW EXECUTE PROCEDURE public.enrich_rp_control_ledger();
REVOKE ALL ON FUNCTION public.enrich_rp_control_ledger()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._rp_apply_consequence_operation(p_operation jsonb)
RETURNS TABLE (
  operation_kind text,
  target_table text,
  target_key jsonb,
  before_state jsonb,
  after_state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := p_operation->>'kind';
  v_country_id uuid;
  v_target_country_id uuid;
  v_roster_unit_id uuid;
  v_country_a_id uuid;
  v_country_b_id uuid;
  v_effect_id uuid;
  v_column text;
  v_existed boolean;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_actual_delta numeric;
  v_before_level integer;
  v_before_extra integer;
  v_after_level integer;
  v_after_extra integer;
  v_level_delta integer;
  v_extra_delta integer;
  v_level_max integer;
  v_before_seed integer;
  v_after_seed integer;
  v_min numeric;
  v_max numeric;
  v_before_json jsonb;
  v_after_json jsonb;
  v_effect jsonb;
BEGIN
  IF jsonb_typeof(p_operation) <> 'object' THEN
    RAISE EXCEPTION 'Chaque conséquence doit être un objet JSON.';
  END IF;

  IF v_kind = 'relation_delta' THEN
    v_country_id := (p_operation->>'country_id')::uuid;
    v_target_country_id := (p_operation->>'target_country_id')::uuid;
    IF v_country_id = v_target_country_id THEN
      RAISE EXCEPTION 'Une relation ne peut pas cibler le même pays.';
    END IF;
    IF v_country_id < v_target_country_id THEN
      v_country_a_id := v_country_id;
      v_country_b_id := v_target_country_id;
    ELSE
      v_country_a_id := v_target_country_id;
      v_country_b_id := v_country_id;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:relation:' || v_country_a_id || ':' || v_country_b_id,
      0
    ));
    v_delta := COALESCE((p_operation->>'delta')::numeric, 0);
    SELECT value INTO v_before
    FROM public.country_relations
    WHERE country_a_id = v_country_a_id AND country_b_id = v_country_b_id
    FOR UPDATE;
    v_existed := FOUND;
    v_before := COALESCE(v_before, 0);
    v_after := GREATEST(-100, LEAST(100, round(v_before + v_delta)));
    v_actual_delta := v_after - v_before;

    INSERT INTO public.country_relations (country_a_id, country_b_id, value, updated_at)
    VALUES (v_country_a_id, v_country_b_id, v_after::smallint, now())
    ON CONFLICT (country_a_id, country_b_id)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    operation_kind := v_kind;
    target_table := 'country_relations';
    target_key := jsonb_build_object('country_a_id', v_country_a_id, 'country_b_id', v_country_b_id);
    before_state := jsonb_build_object('exists', v_existed, 'value', v_before);
    after_state := jsonb_build_object('value', v_after, 'applied_delta', v_actual_delta);
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'control_delta' THEN
    v_country_id := (p_operation->>'country_id')::uuid;
    v_target_country_id := (p_operation->>'controller_country_id')::uuid;
    IF v_country_id = v_target_country_id THEN
      RAISE EXCEPTION 'Un pays ne peut pas se contrôler lui-même.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:control:' || v_country_id || ':' || v_target_country_id,
      0
    ));
    v_delta := COALESCE((p_operation->>'delta')::numeric, 0);

    SELECT share_pct INTO v_before
    FROM public.country_control
    WHERE country_id = v_country_id AND controller_country_id = v_target_country_id
    FOR UPDATE;
    v_existed := FOUND;
    v_before := COALESCE(v_before, 0);
    v_after := GREATEST(0, LEAST(100, v_before + v_delta));
    v_actual_delta := v_after - v_before;

    INSERT INTO public.country_control (
      country_id, controller_country_id, share_pct, is_annexed, updated_at
    ) VALUES (
      v_country_id, v_target_country_id, v_after, false, now()
    )
    ON CONFLICT (country_id, controller_country_id)
    DO UPDATE SET share_pct = EXCLUDED.share_pct, updated_at = now();

    operation_kind := v_kind;
    target_table := 'country_control';
    target_key := jsonb_build_object(
      'country_id', v_country_id,
      'controller_country_id', v_target_country_id
    );
    before_state := jsonb_build_object('exists', v_existed, 'share_pct', v_before);
    after_state := jsonb_build_object('share_pct', v_after, 'applied_delta', v_actual_delta);
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'country_delta' THEN
    v_country_id := (p_operation->>'country_id')::uuid;
    v_column := p_operation->>'column';
    IF v_column NOT IN (
      'militarism', 'industry', 'science', 'stability',
      'ideology_germanic_monarchy', 'ideology_merina_monarchy',
      'ideology_french_republicanism', 'ideology_mughal_republicanism',
      'ideology_nilotique_cultism', 'ideology_satoiste_cultism'
    ) THEN
      RAISE EXCEPTION 'Colonne pays non autorisée : %', v_column;
    END IF;

    v_delta := COALESCE((p_operation->>'delta')::numeric, 0);
    IF v_column = 'stability' THEN
      v_min := -3; v_max := 3;
    ELSIF v_column IN ('militarism', 'industry', 'science') THEN
      v_min := 0; v_max := 10;
    ELSE
      v_min := 0; v_max := 100;
    END IF;

    v_existed := false;
    EXECUTE format(
      'SELECT %I::numeric, true FROM public.countries WHERE id = $1 FOR UPDATE',
      v_column
    ) INTO v_before, v_existed USING v_country_id;
    IF NOT v_existed THEN
      RAISE EXCEPTION 'Pays introuvable : %', v_country_id;
    END IF;
    v_after := GREATEST(v_min, LEAST(v_max, v_before + v_delta));
    v_actual_delta := v_after - v_before;
    EXECUTE format(
      'UPDATE public.countries SET %I = $1, updated_at = now() WHERE id = $2',
      v_column
    ) USING v_after, v_country_id;

    operation_kind := v_kind;
    target_table := 'countries';
    target_key := jsonb_build_object('country_id', v_country_id, 'column', v_column);
    before_state := jsonb_build_object('value', v_before);
    after_state := jsonb_build_object('value', v_after, 'applied_delta', v_actual_delta);
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'military_unit_delta' THEN
    v_country_id := (p_operation->>'country_id')::uuid;
    v_roster_unit_id := (p_operation->>'roster_unit_id')::uuid;
    v_level_delta := COALESCE((p_operation->>'current_level_delta')::integer, 0);
    v_extra_delta := COALESCE((p_operation->>'extra_count_delta')::integer, 0);

    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:military:' || v_country_id || ':' || v_roster_unit_id,
      0
    ));
    SELECT current_level, extra_count
    INTO v_before_level, v_before_extra
    FROM public.country_military_units
    WHERE country_id = v_country_id AND roster_unit_id = v_roster_unit_id
    FOR UPDATE;
    v_existed := FOUND;
    v_before_level := COALESCE(v_before_level, 0);
    v_before_extra := COALESCE(v_before_extra, 0);

    SELECT level_count * 100 INTO v_level_max
    FROM public.military_roster_units
    WHERE id = v_roster_unit_id;
    IF v_level_max IS NULL THEN
      RAISE EXCEPTION 'Unité militaire introuvable : %', v_roster_unit_id;
    END IF;

    v_after_level := GREATEST(0, LEAST(v_level_max, v_before_level + v_level_delta));
    v_after_extra := GREATEST(0, v_before_extra + v_extra_delta);

    INSERT INTO public.country_military_units (
      country_id, roster_unit_id, current_level, extra_count, updated_at
    ) VALUES (
      v_country_id, v_roster_unit_id, v_after_level, v_after_extra, now()
    )
    ON CONFLICT (country_id, roster_unit_id)
    DO UPDATE SET
      current_level = EXCLUDED.current_level,
      extra_count = EXCLUDED.extra_count,
      updated_at = now();

    operation_kind := v_kind;
    target_table := 'country_military_units';
    target_key := jsonb_build_object('country_id', v_country_id, 'roster_unit_id', v_roster_unit_id);
    before_state := jsonb_build_object(
      'exists', v_existed,
      'current_level', v_before_level,
      'extra_count', v_before_extra
    );
    after_state := jsonb_build_object(
      'current_level', v_after_level,
      'extra_count', v_after_extra,
      'applied_current_level_delta', v_after_level - v_before_level,
      'applied_extra_count_delta', v_after_extra - v_before_extra
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'intel_delta' THEN
    v_country_id := (p_operation->>'observer_country_id')::uuid;
    v_target_country_id := (p_operation->>'target_country_id')::uuid;
    IF v_country_id = v_target_country_id THEN
      RAISE EXCEPTION 'Le renseignement ne peut pas cibler le même pays.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rp:intel:' || v_country_id || ':' || v_target_country_id,
      0
    ));
    v_delta := GREATEST(0, COALESCE((p_operation->>'delta')::numeric, 0));

    SELECT intel_level, display_seed
    INTO v_before, v_before_seed
    FROM public.country_intel
    WHERE observer_country_id = v_country_id
      AND target_country_id = v_target_country_id
    FOR UPDATE;
    v_existed := FOUND;
    v_before := COALESCE(v_before, 0);
    v_before_seed := COALESCE(v_before_seed, 0);
    v_after := GREATEST(0, LEAST(100, v_before + v_delta));
    v_actual_delta := v_after - v_before;
    v_after_seed := floor(random() * 2147483647)::integer;

    INSERT INTO public.country_intel (
      observer_country_id, target_country_id, intel_level, display_seed, updated_at
    ) VALUES (
      v_country_id, v_target_country_id, v_after, v_after_seed, now()
    )
    ON CONFLICT (observer_country_id, target_country_id)
    DO UPDATE SET
      intel_level = EXCLUDED.intel_level,
      display_seed = EXCLUDED.display_seed,
      updated_at = now();

    operation_kind := v_kind;
    target_table := 'country_intel';
    target_key := jsonb_build_object(
      'observer_country_id', v_country_id,
      'target_country_id', v_target_country_id
    );
    before_state := jsonb_build_object(
      'exists', v_existed,
      'intel_level', v_before,
      'display_seed', v_before_seed
    );
    after_state := jsonb_build_object(
      'intel_level', v_after,
      'display_seed', v_after_seed,
      'applied_delta', v_actual_delta
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind = 'effect_insert' THEN
    v_effect := COALESCE(p_operation->'effect', p_operation);
    v_effect_id := COALESCE(NULLIF(v_effect->>'id', '')::uuid, gen_random_uuid());
    v_country_id := (v_effect->>'country_id')::uuid;
    IF NULLIF(btrim(v_effect->>'name'), '') IS NULL
       OR NULLIF(btrim(v_effect->>'effect_kind'), '') IS NULL THEN
      RAISE EXCEPTION 'Effet temporaire incomplet.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.country_effects WHERE id = v_effect_id) THEN
      RAISE EXCEPTION 'Identifiant effet déjà utilisé : %', v_effect_id;
    END IF;

    INSERT INTO public.country_effects (
      id, country_id, name, effect_kind, effect_target, effect_subtype,
      value, duration_kind, duration_remaining
    ) VALUES (
      v_effect_id,
      v_country_id,
      v_effect->>'name',
      v_effect->>'effect_kind',
      NULLIF(v_effect->>'effect_target', ''),
      NULLIF(v_effect->>'effect_subtype', ''),
      COALESCE((v_effect->>'value')::numeric, 0),
      COALESCE(NULLIF(v_effect->>'duration_kind', ''), 'days'),
      COALESCE((v_effect->>'duration_remaining')::integer, 0)
    )
    RETURNING to_jsonb(country_effects.*) INTO v_after_json;

    operation_kind := v_kind;
    target_table := 'country_effects';
    target_key := jsonb_build_object('id', v_effect_id);
    before_state := jsonb_build_object('exists', false);
    after_state := v_after_json;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Type de conséquence non autorisé : %', COALESCE(v_kind, '<vide>');
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
  v_country_found boolean;
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
    v_country_found := false;
    EXECUTE format(
      'SELECT %I::numeric, true FROM public.countries WHERE id = $1 FOR UPDATE',
      v_column
    ) INTO v_current, v_country_found USING v_country_id;
    IF NOT v_country_found THEN
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

CREATE OR REPLACE FUNCTION public._rp_assert_action_revertible(
  p_action_id uuid,
  p_execution_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_world_tick_version bigint;
BEGIN
  SELECT COALESCE((value #>> '{}')::bigint, 0)
  INTO v_world_tick_version
  FROM public.rule_parameters
  WHERE key = 'rp_world_tick_version';

  IF EXISTS (
    SELECT 1
    FROM public.action_execution_ledger ledger
    WHERE ledger.action_id = p_action_id
      AND ledger.execution_version = p_execution_version
      AND ledger.reverted_at IS NULL
      AND ledger.world_tick_version <> COALESCE(v_world_tick_version, 0)
  ) THEN
    RAISE EXCEPTION
      'Correction refusée : le monde a déjà évolué depuis cette action.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.action_execution_ledger ledger
    JOIN public.action_execution_ledger newer
      ON newer.id > ledger.id
     AND newer.target_table = ledger.target_table
     AND newer.target_key = ledger.target_key
     AND newer.reverted_at IS NULL
     AND (
       newer.action_id IS DISTINCT FROM ledger.action_id
       OR newer.execution_version IS DISTINCT FROM ledger.execution_version
     )
    WHERE ledger.action_id = p_action_id
      AND ledger.execution_version = p_execution_version
      AND ledger.reverted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Correction refusée : une action plus récente dépend déjà de la même donnée.';
  END IF;

  PERFORM 1
  FROM public.action_execution_ledger ledger
  JOIN public.country_effects effect
    ON effect.id = (ledger.target_key->>'id')::uuid
  WHERE ledger.action_id = p_action_id
    AND ledger.execution_version = p_execution_version
    AND ledger.target_table = 'country_effects'
    AND ledger.reverted_at IS NULL
  FOR UPDATE OF effect;

  IF EXISTS (
    SELECT 1
    FROM public.action_execution_ledger ledger
    LEFT JOIN public.country_effects effect
      ON effect.id = (ledger.target_key->>'id')::uuid
    WHERE ledger.action_id = p_action_id
      AND ledger.execution_version = p_execution_version
      AND ledger.target_table = 'country_effects'
      AND ledger.reverted_at IS NULL
      AND (
        effect.id IS NULL
        OR (to_jsonb(effect) - 'updated_at')
          IS DISTINCT FROM (ledger.after_state - 'updated_at')
      )
  ) THEN
    RAISE EXCEPTION
      'Correction refusée : un effet de cette action a déjà été consommé ou modifié par le monde.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._rp_apply_consequence_plan(
  p_action_id uuid,
  p_execution_version integer,
  p_operations jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_result record;
  v_world_tick_version bigint;
BEGIN
  IF jsonb_typeof(p_operations) <> 'array' THEN
    RAISE EXCEPTION 'Le plan de conséquences doit être un tableau JSON.';
  END IF;
  IF jsonb_array_length(p_operations) > 100 THEN
    RAISE EXCEPTION 'Le plan dépasse 100 opérations.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('rp:world-tick', 0));
  PERFORM public._rp_assert_ideology_persistence_idle();
  SELECT COALESCE((value #>> '{}')::bigint, 0)
  INTO v_world_tick_version
  FROM public.rule_parameters
  WHERE key = 'rp_world_tick_version';

  FOR v_item IN
    SELECT value AS operation, ordinality::smallint AS sequence_no
    FROM jsonb_array_elements(p_operations) WITH ORDINALITY
  LOOP
    SELECT * INTO v_result
    FROM public._rp_apply_consequence_operation(v_item.operation);

    INSERT INTO public.action_execution_ledger (
      action_id, execution_version, sequence_no, world_tick_version, operation_kind,
      target_table, target_key, before_state, after_state
    ) VALUES (
      p_action_id, p_execution_version, v_item.sequence_no,
      COALESCE(v_world_tick_version, 0), v_result.operation_kind,
      v_result.target_table, v_result.target_key, v_result.before_state, v_result.after_state
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._rp_apply_consequence_operation(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rp_revert_consequence_entry(text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._rp_apply_consequence_plan(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.normalize_rp_action_effects(
  p_effects jsonb,
  p_country_id uuid,
  p_target_country_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_effect jsonb;
  v_result jsonb := '[]'::jsonb;
  v_kind text;
  v_name text;
  v_target text;
  v_subtype text;
  v_application text;
  v_scope text;
  v_duration_kind text;
  v_duration numeric;
  v_value numeric;
BEGIN
  p_effects := COALESCE(p_effects, '[]'::jsonb);
  IF jsonb_typeof(p_effects) <> 'array' OR jsonb_array_length(p_effects) > 16 THEN
    RAISE EXCEPTION 'Les conséquences doivent former une liste de 16 éléments maximum.';
  END IF;

  FOR v_effect IN SELECT value FROM jsonb_array_elements(p_effects) LOOP
    IF jsonb_typeof(v_effect) <> 'object'
       OR COALESCE(jsonb_typeof(v_effect->'name'), '') <> 'string'
       OR COALESCE(jsonb_typeof(v_effect->'effect_kind'), '') <> 'string'
       OR COALESCE(jsonb_typeof(v_effect->'value'), '') <> 'number' THEN
      RAISE EXCEPTION 'Structure de conséquence invalide.';
    END IF;

    v_name := btrim(v_effect->>'name');
    v_kind := v_effect->>'effect_kind';
    v_target := NULLIF(btrim(v_effect->>'effect_target'), '');
    v_subtype := NULLIF(btrim(v_effect->>'effect_subtype'), '');
    v_application := COALESCE(NULLIF(v_effect->>'application', ''), 'duration');
    v_scope := COALESCE(NULLIF(v_effect->>'scope', ''), 'emitter');
    v_duration_kind := COALESCE(NULLIF(v_effect->>'duration_kind', ''), 'days');
    v_value := (v_effect->>'value')::numeric;

    IF v_name = '' OR char_length(v_name) > 120 OR v_kind NOT IN (
         'gdp_growth_base', 'gdp_growth_per_stat',
         'population_growth_base', 'population_growth_per_stat',
         'stat_delta', 'budget_ministry_min_pct',
         'budget_ministry_effect_multiplier', 'budget_allocation_cap',
         'military_unit_extra', 'military_unit_tech_rate',
         'military_unit_limit_modifier', 'military_unit_limit_modifier_sub_type',
         'military_unit_limit_modifier_roster',
         'influence_modifier_global', 'influence_modifier_gdp',
         'influence_modifier_population', 'influence_modifier_hard_power',
         'relation_delta',
         'ideology_drift_germanic_monarchy', 'ideology_drift_merina_monarchy',
         'ideology_drift_french_republicanism', 'ideology_drift_mughal_republicanism',
         'ideology_drift_nilotique_cultism', 'ideology_drift_satoiste_cultism',
         'ideology_snap_germanic_monarchy', 'ideology_snap_merina_monarchy',
         'ideology_snap_french_republicanism', 'ideology_snap_mughal_republicanism',
         'ideology_snap_nilotique_cultism', 'ideology_snap_satoiste_cultism',
         'procuration_points_per_day', 'recrutement_bonus_percent',
         'design_bonus_percent', 'procuration_bonus_percent'
       )
       OR v_value < -1000 OR v_value > 1000
       OR char_length(COALESCE(v_subtype, '')) > 100 THEN
      RAISE EXCEPTION 'Conséquence inconnue ou hors limites.';
    END IF;
    IF v_application NOT IN ('duration', 'immediate') THEN
      RAISE EXCEPTION 'Moment d''application invalide.';
    END IF;
    IF v_scope NOT IN ('emitter', 'target')
       OR (v_scope = 'target' AND p_target_country_id IS NULL) THEN
      RAISE EXCEPTION 'Pays affecté invalide.';
    END IF;
    IF v_kind LIKE 'ideology_snap_%' THEN
      v_application := 'immediate';
    ELSIF v_application = 'immediate' AND v_kind NOT IN (
      'stat_delta', 'military_unit_extra', 'military_unit_tech_rate',
      'relation_delta',
      'ideology_snap_germanic_monarchy', 'ideology_snap_merina_monarchy',
      'ideology_snap_french_republicanism', 'ideology_snap_mughal_republicanism',
      'ideology_snap_nilotique_cultism', 'ideology_snap_satoiste_cultism'
    ) THEN
      RAISE EXCEPTION 'Cette conséquence ne peut pas être immédiate : %.', v_kind;
    END IF;

    IF v_kind IN ('gdp_growth_per_stat', 'population_growth_per_stat', 'stat_delta') THEN
      IF v_target IS NULL OR v_target NOT IN ('militarism', 'industry', 'science', 'stability') THEN
        RAISE EXCEPTION 'Statistique de conséquence invalide.';
      END IF;
    ELSIF v_kind IN ('budget_ministry_min_pct', 'budget_ministry_effect_multiplier') THEN
      IF v_target IS NULL OR v_target NOT IN (
        'budget_etat', 'budget_education', 'budget_recherche',
        'budget_infrastructure', 'budget_sante', 'budget_industrie',
        'budget_defense', 'budget_interieur',
        'budget_affaires_etrangeres', 'budget_procuration_militaire'
      ) THEN
        RAISE EXCEPTION 'Ministère de conséquence invalide.';
      END IF;
    ELSIF v_kind = 'military_unit_limit_modifier' THEN
      IF v_target IS NULL OR v_target NOT IN ('terre', 'air', 'mer', 'strategique') THEN
        RAISE EXCEPTION 'Branche militaire invalide.';
      END IF;
    ELSIF v_kind = 'military_unit_limit_modifier_sub_type' THEN
      IF v_target IS NULL
         OR split_part(v_target, ':', 1) NOT IN ('terre', 'air', 'mer', 'strategique')
         OR char_length(v_target) > 100 THEN
        RAISE EXCEPTION 'Type d''unité invalide.';
      END IF;
    ELSIF v_kind IN (
      'military_unit_extra', 'military_unit_tech_rate',
      'military_unit_limit_modifier_roster'
    ) THEN
      IF v_target IS NULL
         OR v_target !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR NOT EXISTS (
           SELECT 1 FROM public.military_roster_units WHERE id = v_target::uuid
         ) THEN
        RAISE EXCEPTION 'Unité militaire invalide.';
      END IF;
    ELSIF v_kind = 'relation_delta' THEN
      IF p_target_country_id IS NULL
         OR v_target IS NULL
         OR v_target !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR (v_scope = 'target' AND v_target::uuid IS DISTINCT FROM p_country_id)
         OR (v_scope <> 'target' AND v_target::uuid IS DISTINCT FROM p_target_country_id) THEN
        RAISE EXCEPTION 'La relation doit viser l''autre pays de l''action.';
      END IF;
    ELSE
      v_target := NULL;
    END IF;

    IF v_application = 'duration' THEN
      IF v_kind LIKE 'ideology_snap_%' OR v_duration_kind NOT IN ('days', 'permanent') THEN
        RAISE EXCEPTION 'Durée de conséquence invalide.';
      END IF;
      IF v_duration_kind = 'permanent' THEN
        v_duration := 0;
      ELSE
        IF COALESCE(jsonb_typeof(v_effect->'duration_remaining'), '') <> 'number' THEN
          RAISE EXCEPTION 'Nombre de jours manquant.';
        END IF;
        v_duration := (v_effect->>'duration_remaining')::numeric;
        IF v_duration <> trunc(v_duration) OR v_duration < 1 OR v_duration > 100 THEN
          RAISE EXCEPTION 'La durée doit être comprise entre 1 et 100 jours.';
        END IF;
      END IF;
    ELSE
      v_duration_kind := 'days';
      v_duration := 0;
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'name', v_name,
      'effect_kind', v_kind,
      'effect_target', v_target,
      'effect_subtype', v_subtype,
      'value', v_value,
      'application', v_application,
      'scope', v_scope,
      'duration_kind', v_duration_kind,
      'duration_remaining', v_duration::integer
    ));
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_rp_action_effects(jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.normalize_rp_ideology_scores(
  p_scores jsonb,
  p_preferred_key text DEFAULT NULL,
  p_round_scores boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_keys CONSTANT text[] := ARRAY[
    'ideology_germanic_monarchy',
    'ideology_satoiste_cultism',
    'ideology_nilotique_cultism',
    'ideology_mughal_republicanism',
    'ideology_french_republicanism',
    'ideology_merina_monarchy'
  ];
  v_scores numeric[] := ARRAY[]::numeric[];
  v_used boolean[] := ARRAY[false, false, false, false, false, false];
  v_sum numeric := 0;
  v_pair_total numeric;
  v_delta numeric;
  v_applied numeric;
  v_best integer;
  v_preferred integer;
  v_index integer;
  v_pass integer;
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF p_preferred_key IS NOT NULL AND NOT (p_preferred_key = ANY(v_keys)) THEN
    RAISE EXCEPTION 'Idéologie préférée inconnue.';
  END IF;

  FOR v_index IN 1..6 LOOP
    v_scores := array_append(
      v_scores,
      GREATEST(0, COALESCE((p_scores->>v_keys[v_index])::numeric, 0))
    );
    v_sum := v_sum + v_scores[v_index];
    IF v_keys[v_index] = p_preferred_key THEN
      v_preferred := v_index;
    END IF;
  END LOOP;

  IF v_sum <= 0 THEN
    v_scores := ARRAY[
      100::numeric / 6, 100::numeric / 6, 100::numeric / 6,
      100::numeric / 6, 100::numeric / 6, 100::numeric / 6
    ];
  ELSE
    -- Paires antithétiques : Germanique/Moghol, Français/Satoiste, Nilotique/Mérinais.
    FOREACH v_index IN ARRAY ARRAY[1, 5, 3] LOOP
      v_best := CASE v_index WHEN 1 THEN 4 WHEN 5 THEN 2 ELSE 6 END;
      v_pair_total := v_scores[v_index] + v_scores[v_best];
      CONTINUE WHEN v_pair_total <= 0;
      IF v_scores[v_index] >= v_scores[v_best] THEN
        v_scores[v_index] := v_pair_total;
        v_scores[v_best] := 0;
      ELSE
        v_scores[v_best] := v_pair_total;
        v_scores[v_index] := 0;
      END IF;
    END LOOP;
    SELECT sum(value) INTO v_sum FROM unnest(v_scores) value;
    FOR v_index IN 1..6 LOOP
      v_scores[v_index] := v_scores[v_index] / v_sum * 100;
    END LOOP;
  END IF;

  IF p_round_scores THEN
    v_sum := 0;
    FOR v_index IN 1..6 LOOP
      v_scores[v_index] := GREATEST(0, round(v_scores[v_index], 4));
      v_sum := v_sum + v_scores[v_index];
    END LOOP;
    v_delta := round(100 - v_sum, 4);

    IF v_preferred IS NOT NULL AND v_delta <> 0 THEN
      v_applied := CASE
        WHEN v_delta > 0 THEN v_delta
        ELSE -LEAST(v_scores[v_preferred], -v_delta)
      END;
      v_scores[v_preferred] := round(v_scores[v_preferred] + v_applied, 4);
      v_delta := round(v_delta - v_applied, 4);
      v_used[v_preferred] := true;
    END IF;

    FOR v_pass IN 1..6 LOOP
      EXIT WHEN v_delta = 0;
      v_best := NULL;
      FOR v_index IN 1..6 LOOP
        IF NOT v_used[v_index]
           AND (v_best IS NULL OR v_scores[v_index] > v_scores[v_best]) THEN
          v_best := v_index;
        END IF;
      END LOOP;
      EXIT WHEN v_best IS NULL;
      v_used[v_best] := true;
      v_applied := CASE
        WHEN v_delta > 0 THEN v_delta
        ELSE -LEAST(v_scores[v_best], -v_delta)
      END;
      v_scores[v_best] := round(v_scores[v_best] + v_applied, 4);
      v_delta := round(v_delta - v_applied, 4);
    END LOOP;
  END IF;

  FOR v_index IN 1..6 LOOP
    v_result := v_result || jsonb_build_object(v_keys[v_index], v_scores[v_index]);
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_rp_ideology_scores(jsonb, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

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

REVOKE ALL ON FUNCTION public.build_rp_action_consequence_plan(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.classify_lore_article(
  p_article_id uuid,
  p_source_kind text,
  p_author_country_id uuid,
  p_target_country_id uuid,
  p_mentioned_country_ids uuid[],
  p_tag_keys text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article public.lore_articles%ROWTYPE;
  v_unknown_tag text;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  IF p_source_kind NOT IN ('official', 'player', 'mj') THEN
    RAISE EXCEPTION 'Autorité de source invalide.';
  END IF;

  SELECT * INTO v_article
  FROM public.lore_articles
  WHERE id = p_article_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article introuvable.';
  END IF;
  IF v_article.source_platform = 'engine' OR v_article.action_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un article moteur ne peut pas être reclassé comme source externe.';
  END IF;
  IF v_article.nsfw_quarantined
     OR v_article.editorial_status = 'quarantined'
     OR v_article.classification_status = 'quarantined' THEN
    RAISE EXCEPTION 'Une quarantaine NSFW ne peut pas être levée par le classement.';
  END IF;

  SELECT requested INTO v_unknown_tag
  FROM unnest(COALESCE(p_tag_keys, '{}'::text[])) AS requested
  WHERE NOT EXISTS (SELECT 1 FROM public.lore_tags WHERE key = requested)
  LIMIT 1;
  IF v_unknown_tag IS NOT NULL THEN
    RAISE EXCEPTION 'Tag contrôlé inconnu : %', v_unknown_tag;
  END IF;

  DELETE FROM public.lore_article_countries WHERE lore_article_id = p_article_id;
  IF p_author_country_id IS NOT NULL THEN
    INSERT INTO public.lore_article_countries (lore_article_id, country_id, relation_role)
    VALUES (p_article_id, p_author_country_id, 'author');
  END IF;
  IF p_target_country_id IS NOT NULL THEN
    INSERT INTO public.lore_article_countries (lore_article_id, country_id, relation_role)
    VALUES (p_article_id, p_target_country_id, 'target')
    ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.lore_article_countries (lore_article_id, country_id, relation_role)
  SELECT p_article_id, country_id, 'mentioned'
  FROM (
    SELECT DISTINCT unnest(COALESCE(p_mentioned_country_ids, '{}'::uuid[])) AS country_id
  ) mentioned
  WHERE country_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  DELETE FROM public.lore_article_tags WHERE lore_article_id = p_article_id;
  INSERT INTO public.lore_article_tags (lore_article_id, tag_id)
  SELECT p_article_id, tag.id
  FROM public.lore_tags tag
  WHERE tag.key = ANY(COALESCE(p_tag_keys, '{}'::text[]))
  ON CONFLICT DO NOTHING;

  UPDATE public.lore_articles
  SET
    source_kind = p_source_kind,
    classification_status = 'classified',
    classification_locked = true,
    classified_by = (SELECT auth.uid()),
    classified_at = now(),
    editorial_status = CASE
      WHEN editorial_status = 'review' THEN 'approved'
      ELSE editorial_status
    END
  WHERE id = p_article_id;
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

CREATE OR REPLACE FUNCTION public.request_ai_action_roll_change(
  p_action_id uuid,
  p_expected_version integer,
  p_new_roll integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.ai_event_requests%ROWTYPE;
  v_target_version integer;
  v_outcome text;
  v_new_operations jsonb;
  v_article_id uuid;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  v_outcome := public.rp_d100_outcome(p_new_roll);

  SELECT * INTO v_action
  FROM public.ai_event_requests
  WHERE id = p_action_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action introuvable.';
  END IF;
  IF v_action.execution_version <> p_expected_version THEN
    RAISE EXCEPTION 'Version d''action obsolète.';
  END IF;
  IF v_action.consequences_applied_at IS NOT NULL
     AND v_action.pending_execution_version IS NULL
     AND v_action.d100_roll = p_new_roll THEN
    RETURN v_action.execution_version;
  END IF;
  IF v_action.consequences_applied_at IS NOT NULL
     AND v_action.execution_status <> 'completed' THEN
    RAISE EXCEPTION 'La publication courante doit être terminée avant de corriger le jet.';
  END IF;
  IF v_action.consequences_applied_at IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('rp:world-tick', 0));
    PERFORM public._rp_assert_action_revertible(
      p_action_id,
      p_expected_version
    );
  END IF;
  IF v_action.consequences_applied_at IS NULL
     AND p_expected_version = 0
     AND v_action.d100_roll = p_new_roll
     AND EXISTS (
       SELECT 1 FROM public.rp_pipeline_jobs
       WHERE idempotency_key = 'article:' || p_action_id || ':v1'
     ) THEN
    RETURN 1;
  END IF;
  v_new_operations := public.build_rp_action_consequence_plan(p_action_id, p_new_roll);

  -- Premier jet manuel : il n'existe encore aucun effet à inverser.
  IF v_action.consequences_applied_at IS NULL THEN
    IF p_expected_version <> 0 THEN
      RAISE EXCEPTION 'Version initiale incohérente.';
    END IF;
    UPDATE public.ai_event_requests
    SET
      d100_roll = p_new_roll,
      d100_outcome = v_outcome,
      dice_results = jsonb_build_object(
        'success_roll', jsonb_build_object('roll', p_new_roll, 'modifier', 0, 'total', p_new_roll),
        'outcome', v_outcome
      ),
      consequence_plan = v_new_operations,
      execution_status = 'waiting_article'
    WHERE id = p_action_id;

    INSERT INTO public.rp_pipeline_jobs (
      job_type, action_id, payload, priority, idempotency_key
    ) VALUES (
      'generate_article',
      p_action_id,
      jsonb_build_object('execution_version', 1, 'recalculation', false),
      20,
      'article:' || p_action_id || ':v1'
    )
    ON CONFLICT DO NOTHING;
    RETURN 1;
  END IF;

  IF v_action.pending_execution_version IS NOT NULL THEN
    IF v_action.pending_execution_version = p_expected_version + 1
       AND (v_action.pending_dice_results->'success_roll'->>'total')::integer = p_new_roll THEN
      RETURN v_action.pending_execution_version;
    END IF;
    RAISE EXCEPTION 'Une modification de jet est déjà en préparation.';
  END IF;

  v_target_version := p_expected_version + 1;
  SELECT id INTO v_article_id
  FROM public.lore_articles
  WHERE action_id = p_action_id
    AND source_platform = 'engine'
  FOR UPDATE;
  IF v_article_id IS NULL THEN
    RAISE EXCEPTION 'Article initial introuvable pour cette action exécutée.';
  END IF;

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
    RAISE EXCEPTION 'Une livraison Discord est déjà en cours ; réessayez après sa fin.';
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

  UPDATE public.ai_event_requests
  SET
    pending_dice_results = jsonb_build_object(
      'success_roll', jsonb_build_object('roll', p_new_roll, 'modifier', 0, 'total', p_new_roll),
      'outcome', v_outcome
    ),
    pending_consequence_plan = v_new_operations,
    pending_execution_version = v_target_version,
    execution_status = 'waiting_article'
  WHERE id = p_action_id;

  INSERT INTO public.rp_pipeline_jobs (
    job_type, action_id, lore_article_id, payload, priority, idempotency_key
  ) VALUES (
    'generate_article',
    p_action_id,
    v_article_id,
    jsonb_build_object(
      'execution_version', v_target_version,
      'recalculation', true,
      'previous_execution_version', p_expected_version
    ),
    10,
    'article:' || p_action_id || ':v' || v_target_version
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_target_version;
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

REVOKE ALL ON FUNCTION public.review_lore_article(uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.classify_lore_article(uuid, text, uuid, uuid, uuid[], text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_discord_lore_article(jsonb, jsonb, text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_rp_action_consequences(uuid, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_ai_action_roll_change(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_rp_action_roll(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_lore_article(uuid, text, text, jsonb, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.classify_lore_article(uuid, text, uuid, uuid, uuid[], text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_discord_lore_article(jsonb, jsonb, text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_rp_action_consequences(uuid, integer, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_ai_action_roll_change(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_rp_action_roll(uuid, integer) TO service_role;

-- Les inserts manuels et automatiques empruntent exactement la même orchestration.
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

CREATE OR REPLACE FUNCTION public.protect_rp_action_roll_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.country_id IS DISTINCT FROM OLD.country_id
     OR NEW.action_type_id IS DISTINCT FROM OLD.action_type_id
     OR NEW.target_country_id IS DISTINCT FROM OLD.target_country_id
     OR NEW.world_snapshot IS DISTINCT FROM OLD.world_snapshot THEN
    RAISE EXCEPTION 'Le cadre initial d''une action est immuable ; créez une nouvelle phase liée.';
  END IF;
  IF OLD.consequences_applied_at IS NOT NULL
     AND NEW.d100_roll IS DISTINCT FROM OLD.d100_roll
     AND COALESCE((OLD.pending_dice_results->'success_roll'->>'total')::integer, -1)
       <> COALESCE(NEW.d100_roll, -1) THEN
    RAISE EXCEPTION 'Utiliser request_ai_action_roll_change pour modifier un jet exécuté.';
  END IF;
  IF NEW.admin_effect_added IS DISTINCT FROM OLD.admin_effect_added THEN
    IF OLD.consequences_applied_at IS NOT NULL THEN
      RAISE EXCEPTION 'Les conséquences d''une action exécutée sont immuables.';
    END IF;
    NEW.admin_effect_added := public.normalize_rp_action_effects(
      NEW.admin_effect_added,
      NEW.country_id,
      NEW.target_country_id
    );
  END IF;

  IF OLD.decision_status IS DISTINCT FROM NEW.decision_status
     AND NEW.decision_status = 'approved'
     AND NEW.consequences_applied_at IS NULL THEN
    NEW.status := 'accepted';
    IF NEW.roll_mode = 'auto' AND NEW.d100_roll IS NULL THEN
      NEW.d100_roll := 1 + floor(random() * 100)::integer;
    END IF;
  ELSIF OLD.decision_status IS DISTINCT FROM NEW.decision_status
        AND NEW.decision_status = 'rejected'
        AND NEW.consequences_applied_at IS NULL THEN
    NEW.status := 'refused';
  END IF;

  IF NEW.consequences_applied_at IS NULL
     AND (
       NEW.d100_roll IS DISTINCT FROM OLD.d100_roll
       OR NEW.decision_status IS DISTINCT FROM OLD.decision_status
     ) THEN
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

CREATE TRIGGER prepare_rp_action_insert_trigger
  BEFORE INSERT ON public.ai_event_requests
  FOR EACH ROW EXECUTE PROCEDURE public.prepare_rp_action_insert();

CREATE TRIGGER protect_rp_action_roll_update_trigger
  BEFORE UPDATE ON public.ai_event_requests
  FOR EACH ROW EXECUTE PROCEDURE public.protect_rp_action_roll_update();

CREATE TRIGGER enqueue_rp_article_after_action_ready_trigger
  AFTER INSERT OR UPDATE ON public.ai_event_requests
  FOR EACH ROW EXECUTE PROCEDURE public.enqueue_rp_article_after_action_ready();

CREATE OR REPLACE FUNCTION public.create_manual_rp_action(
  p_country_id uuid,
  p_action_type_id uuid,
  p_target_country_id uuid,
  p_importance text,
  p_intent text,
  p_stakes text DEFAULT NULL,
  p_mj_notes text DEFAULT NULL,
  p_parent_action_id uuid DEFAULT NULL,
  p_effects jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_id uuid;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  IF p_importance NOT IN ('minor', 'major') THEN
    RAISE EXCEPTION 'Importance invalide.';
  END IF;
  IF NULLIF(btrim(p_intent), '') IS NULL OR char_length(p_intent) > 500
     OR char_length(COALESCE(p_stakes, '')) > 1000
     OR char_length(COALESCE(p_mj_notes, '')) > 1000 THEN
    RAISE EXCEPTION 'Contenu narratif invalide.';
  END IF;

  INSERT INTO public.ai_event_requests (
    country_id, action_type_id, target_country_id, status, source, importance,
    decision_status, resolved_by, resolved_at, intent, stakes, mj_notes,
    parent_action_id, manual_preconditions_bypassed, payload, selection_explanation,
    admin_effect_added
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
    p_effects
  )
  RETURNING id INTO v_action_id;

  RETURN v_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_rp_action_effects(
  p_action_id uuid,
  p_effects jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  UPDATE public.ai_event_requests
  SET admin_effect_added = p_effects
  WHERE id = p_action_id
    AND consequences_applied_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action introuvable ou conséquences déjà appliquées.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_rp_action(
  p_action_id uuid,
  p_decision text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Décision invalide.';
  END IF;

  UPDATE public.ai_event_requests
  SET
    decision_status = p_decision,
    status = CASE WHEN p_decision = 'approved' THEN 'accepted' ELSE 'refused' END,
    resolved_by = (SELECT auth.uid()),
    resolved_at = now()
  WHERE id = p_action_id
    AND decision_status = 'pending'
    AND consequences_applied_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action introuvable ou déjà décidée.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_rp_pipeline_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  UPDATE public.rp_pipeline_jobs
  SET
    status = 'pending',
    attempt_count = 0,
    next_attempt_at = now(),
    locked_at = NULL,
    locked_by = NULL,
    last_error = NULL,
    finished_at = NULL
  WHERE id = p_job_id
    AND status IN ('retry', 'warning');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tâche introuvable ou non relançable.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_manual_discord_sync()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_job_status text;
  v_first_job_id uuid;
  v_route record;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  FOR v_route IN
    SELECT id
    FROM public.discord_rp_channels
    WHERE is_public AND ingest_enabled
    ORDER BY priority, id
  LOOP
    v_job_id := NULL;
    v_job_status := NULL;
    SELECT id, status INTO v_job_id, v_job_status
    FROM public.rp_pipeline_jobs
    WHERE job_type = 'discord_sync'
      AND payload->>'route_id' = v_route.id::text
      AND status IN ('pending', 'running', 'retry', 'warning')
    ORDER BY created_at
    LIMIT 1;

    IF v_job_status = 'warning' THEN
      UPDATE public.rp_pipeline_jobs
      SET
        status = 'pending',
        attempt_count = 0,
        next_attempt_at = now(),
        locked_at = NULL,
        locked_by = NULL,
        last_error = NULL,
        finished_at = NULL
      WHERE id = v_job_id;
    END IF;

    IF v_job_id IS NULL THEN
      INSERT INTO public.rp_pipeline_jobs (
        job_type, status, priority, next_attempt_at, idempotency_key, payload
      ) VALUES (
        'discord_sync', 'pending', 50, now(),
        'discord-sync-manual:' || v_route.id || ':' || gen_random_uuid(),
        jsonb_build_object(
          'route_id', v_route.id,
          'requested_manually', true,
          'requested_by', (SELECT auth.uid())
        )
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_job_id;

      IF v_job_id IS NULL THEN
        SELECT id INTO v_job_id
        FROM public.rp_pipeline_jobs
        WHERE job_type = 'discord_sync'
          AND payload->>'route_id' = v_route.id::text
          AND status IN ('pending', 'running', 'retry', 'warning')
        ORDER BY created_at
        LIMIT 1;
      END IF;
    END IF;
    v_first_job_id := COALESCE(v_first_job_id, v_job_id);
  END LOOP;

  IF v_first_job_id IS NULL THEN
    RAISE EXCEPTION 'Aucun salon public avec collecte active.';
  END IF;
  RETURN v_first_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_manual_discord_delivery(
  p_action_id uuid,
  p_article_id uuid,
  p_operation text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.ai_event_requests%ROWTYPE;
  v_article public.lore_articles%ROWTYPE;
  v_job_id uuid;
  v_key text;
  v_payload jsonb;
BEGIN
  IF NOT public.can_manage_rp() THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;
  IF p_operation NOT IN ('resend', 'delete') THEN
    RAISE EXCEPTION 'Opération Discord invalide.';
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
     OR v_article.approved_for_execution_version IS DISTINCT FROM v_action.execution_version THEN
    RAISE EXCEPTION 'Action ou article non publiable.';
  END IF;
  IF p_operation = 'delete' AND v_article.discord_message_id IS NULL THEN
    RAISE EXCEPTION 'Aucun message Discord à supprimer.';
  END IF;
  IF v_action.pending_execution_version IS NOT NULL THEN
    RAISE EXCEPTION 'La livraison Discord est bloquée pendant la préparation d''un nouveau jet.';
  END IF;

  v_key := CASE p_operation
    WHEN 'delete' THEN 'publish:' || p_article_id || ':delete:v' || v_action.execution_version
    ELSE 'publish:' || p_article_id || ':v' || v_action.execution_version
  END;
  v_payload := jsonb_build_object(
    'execution_version', v_action.execution_version,
    CASE WHEN p_operation = 'delete' THEN 'delete_existing' ELSE 'edit_existing' END,
    CASE WHEN p_operation = 'delete' THEN true ELSE v_article.discord_message_id IS NOT NULL END
  );

  IF EXISTS (
    SELECT 1
    FROM public.rp_pipeline_jobs
    WHERE lore_article_id = p_article_id
      AND job_type = 'publish_discord'
      AND status = 'running'
  ) THEN
    RAISE EXCEPTION 'Une livraison Discord est déjà en cours ; réessayez après sa fin.';
  END IF;

  UPDATE public.rp_pipeline_jobs
  SET
    status = 'cancelled',
    finished_at = now(),
    locked_at = NULL,
    locked_by = NULL
  WHERE lore_article_id = p_article_id
    AND job_type = 'publish_discord'
    AND status IN ('pending', 'retry')
    AND idempotency_key <> v_key;

  SELECT id INTO v_job_id
  FROM public.rp_pipeline_jobs
  WHERE idempotency_key = v_key
  FOR UPDATE;
  IF v_job_id IS NULL THEN
    INSERT INTO public.rp_pipeline_jobs (
      job_type, action_id, lore_article_id, payload, priority, idempotency_key
    ) VALUES (
      'publish_discord', p_action_id, p_article_id, v_payload, 10, v_key
    )
    RETURNING id INTO v_job_id;
  ELSE
    UPDATE public.rp_pipeline_jobs
    SET
      payload = v_payload,
      status = CASE WHEN status = 'running' THEN status ELSE 'pending' END,
      attempt_count = CASE WHEN status = 'running' THEN attempt_count ELSE 0 END,
      next_attempt_at = CASE WHEN status = 'running' THEN next_attempt_at ELSE now() END,
      locked_at = CASE WHEN status = 'running' THEN locked_at ELSE NULL END,
      locked_by = CASE WHEN status = 'running' THEN locked_by ELSE NULL END,
      last_error = CASE WHEN status = 'running' THEN last_error ELSE NULL END,
      finished_at = CASE WHEN status = 'running' THEN finished_at ELSE NULL END
    WHERE id = v_job_id;
  END IF;
  RETURN v_job_id;
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

CREATE OR REPLACE FUNCTION public.set_rp_pipeline_enabled(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès administrateur requis.';
  END IF;
  UPDATE public.rule_parameters
  SET
    value = COALESCE(value, '{}'::jsonb)
      || jsonb_build_object('enabled', p_enabled),
    updated_at = now()
  WHERE key = 'rp_pipeline_config';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuration du pipeline absente.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_rp_action(uuid, uuid, uuid, text, text, text, text, uuid, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_rp_action_effects(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_rp_action(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retry_rp_pipeline_job(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enqueue_manual_discord_sync() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enqueue_manual_discord_delivery(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_rp_discord_publication(
  uuid, uuid, integer, uuid, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_rp_pipeline_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_rp_action(uuid, uuid, uuid, text, text, text, text, uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_rp_action_effects(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_rp_action(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retry_rp_pipeline_job(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_manual_discord_sync() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_manual_discord_delivery(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_rp_discord_publication(
  uuid, uuid, integer, uuid, text, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_rp_pipeline_enabled(boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_action_automation_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.action_automation_configs (action_type_id, requires_target)
  VALUES (
    NEW.id,
    NEW.key NOT IN ('demande_up', 'effort_fortifications', 'investissements')
  )
  ON CONFLICT (action_type_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_action_automation_config_trigger
  AFTER INSERT ON public.state_action_types
  FOR EACH ROW EXECUTE PROCEDURE public.ensure_action_automation_config();

-- ========= Génération déterministe des actions dues =========

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
VALUES (
  'rp_pipeline_config',
  jsonb_build_object(
    'enabled', false,
    'model', 'anthracite-org-magnum-v4-72b-FP8-Dynamic',
    'max_parallel_magnum', 2,
    'provider_calls_per_minute', 18,
    'context_token_budget', 24000
  ),
  'Pipeline RP Magnum. enabled reste faux jusqu''à validation sur le serveur Discord de test.',
  now(),
  now()
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
VALUES (
  'rp_pipeline_worker_heartbeat',
  jsonb_build_object('status', 'never'),
  'Signal de vie du worker RP, affiché dans les alertes lorsque la file ne progresse plus.',
  now(),
  now()
)
ON CONFLICT (key) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.run_ai_events_cron(p_force boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.generate_due_rp_actions(p_force);
END;
$$;

REVOKE ALL ON FUNCTION public.run_ai_events_cron(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_ai_events_cron(boolean) TO service_role;

COMMENT ON FUNCTION public.generate_due_rp_actions(boolean) IS
  'Sélection pondérée parmi les seuls couples émetteur/action/cible valides, avec préconditions, seuils militaires, cooldown, vrai D100 et photographie initiale.';

REVOKE ALL ON FUNCTION public.generate_due_rp_actions(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_rp_actions(boolean) TO service_role;

-- ========= Planification Discord et worker unique =========

CREATE OR REPLACE FUNCTION public.enqueue_scheduled_discord_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paris timestamp := now() AT TIME ZONE 'Europe/Paris';
  v_hour integer;
  v_route record;
BEGIN
  v_hour := EXTRACT(hour FROM v_paris)::integer;
  IF v_hour NOT IN (6, 18) THEN
    RETURN;
  END IF;

  FOR v_route IN
    SELECT id
    FROM public.discord_rp_channels
    WHERE is_public AND ingest_enabled
    ORDER BY priority, id
  LOOP
    INSERT INTO public.rp_pipeline_jobs (
      job_type, payload, priority, idempotency_key
    ) VALUES (
      'discord_sync',
      jsonb_build_object(
        'route_id', v_route.id,
        'scheduled_at', now(),
        'timezone', 'Europe/Paris'
      ),
      30,
      'discord-sync:' || to_char(v_paris, 'YYYY-MM-DD-HH24') || ':' || v_route.id
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_scheduled_discord_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_scheduled_discord_sync() TO service_role;

DO $$
DECLARE
  v_edge_secret text;
  v_vault_secret_id uuid;
BEGIN
  SELECT NULLIF(value #>> '{}', '') INTO v_edge_secret
  FROM public.rule_parameters
  WHERE key = 'process_due_edge_secret';
  IF v_edge_secret IS NULL THEN
    RAISE EXCEPTION 'Secret historique process_due_edge_secret absent : synchroniser le secret Edge avant la migration.';
  END IF;

  SELECT id INTO v_vault_secret_id
  FROM vault.secrets
  WHERE name = 'rp_pipeline_edge_secret'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_vault_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      v_edge_secret,
      'rp_pipeline_edge_secret',
      'Authentification pg_cron vers la Edge Function rp-pipeline'
    );
  ELSE
    PERFORM vault.update_secret(
      v_vault_secret_id,
      v_edge_secret,
      'rp_pipeline_edge_secret',
      'Authentification pg_cron vers la Edge Function rp-pipeline'
    );
  END IF;
END
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

REVOKE ALL ON FUNCTION public.record_rp_pipeline_worker_heartbeat(text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_rp_pipeline_worker_heartbeat(text, jsonb)
  TO service_role;

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

REVOKE ALL ON FUNCTION public.invoke_rp_pipeline_edge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_rp_pipeline_edge() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('ai-events-generation');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('rp-pipeline-worker');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('rp-discord-sync-planner');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'ai-events-generation',
      '0 * * * *',
      'SELECT public.generate_due_rp_actions(false)'
    );
    PERFORM cron.schedule(
      'rp-pipeline-worker',
      '* * * * *',
      'SELECT public.invoke_rp_pipeline_edge()'
    );
    PERFORM cron.schedule(
      'rp-discord-sync-planner',
      '0 * * * *',
      'SELECT public.enqueue_scheduled_discord_sync()'
    );
  ELSE
    RAISE NOTICE 'pg_cron indisponible : jobs RP non planifiés.';
  END IF;
END
$$;

-- ========= Retrait de l'ancien moteur de fragments =========

DROP TRIGGER IF EXISTS sync_discord_dispatch_types_trigger ON public.state_action_types;
DROP FUNCTION IF EXISTS public.sync_discord_dispatch_types_on_state_action_type_insert();
DROP FUNCTION IF EXISTS public.invoke_process_ai_events_due_edge();

DROP TABLE IF EXISTS public.discord_dispatch_snippet_pools;
DROP TABLE IF EXISTS public.discord_dispatch_templates;
DROP TABLE IF EXISTS public.discord_dispatch_types;
DROP TABLE IF EXISTS public.discord_region_channels;

DELETE FROM public.rule_parameters
WHERE key IN ('process_due_edge_secret', 'ai_events_cron_last_check');

-- Contrat fixe : aucun sélecteur de modèle ni ancien nom de moteur.
UPDATE public.rule_parameters
SET value = value || jsonb_build_object(
  'model', 'anthracite-org-magnum-v4-72b-FP8-Dynamic',
  'enabled', false
)
WHERE key = 'rp_pipeline_config';

-- Vérification minimale des six frontières D100 pendant la migration.
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
    RAISE EXCEPTION 'Régression détectée dans les seuils D100.';
  END IF;
END
$$;
