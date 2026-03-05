-- Events IA : voisinage des régions (PostGIS), table ai_event_requests, config et types d'actions (escarmouche, conflit, guerre).

-- ========== PostGIS (optionnel : peut être activé via le dashboard) ==========
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ========== Voisinage des régions ==========
CREATE TABLE public.map_region_neighbors (
  region_a_id uuid NOT NULL REFERENCES public.map_regions(id) ON DELETE CASCADE,
  region_b_id uuid NOT NULL REFERENCES public.map_regions(id) ON DELETE CASCADE,
  PRIMARY KEY (region_a_id, region_b_id),
  CHECK (region_a_id < region_b_id)
);

CREATE INDEX idx_map_region_neighbors_a ON public.map_region_neighbors(region_a_id);
CREATE INDEX idx_map_region_neighbors_b ON public.map_region_neighbors(region_b_id);

COMMENT ON TABLE public.map_region_neighbors IS 'Paires de régions limitrophes (remplies par compute_map_region_neighbors). Utilisé pour la distance « Voisins » des events IA.';

ALTER TABLE public.map_region_neighbors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Map region neighbors: lecture publique"
  ON public.map_region_neighbors FOR SELECT USING (true);
CREATE POLICY "Map region neighbors: écriture admin"
  ON public.map_region_neighbors FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- Fonction de calcul des voisinages (PostGIS)
CREATE OR REPLACE FUNCTION public.compute_map_region_neighbors()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  TRUNCATE public.map_region_neighbors;

  INSERT INTO public.map_region_neighbors (region_a_id, region_b_id)
  SELECT r1.id, r2.id
  FROM public.map_regions r1
  JOIN public.map_regions r2 ON r1.id < r2.id
  WHERE extensions.ST_Touches(
    extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(r1.geometry::text), 4326)),
    extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(r2.geometry::text), 4326))
  );
END;
$$;

COMMENT ON FUNCTION public.compute_map_region_neighbors() IS 'Remplit map_region_neighbors à partir des géométries map_regions (PostGIS ST_Touches). ST_MakeValid utilisé pour tolérer des géométries invalides.';

-- Pas d'appel initial : la table reste vide jusqu''au recalcul manuel (bouton admin « Recalculer les voisinages ») pour éviter d''échouer sur des géométries invalides en base.

-- ========== Table ai_event_requests (événements IA) ==========
CREATE TABLE public.ai_event_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  action_type_id uuid NOT NULL REFERENCES public.state_action_types(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'refused')) DEFAULT 'pending',
  payload jsonb DEFAULT '{}',
  admin_effect_added jsonb,
  dice_results jsonb,
  refusal_message text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_trigger_at timestamptz,
  consequences_applied_at timestamptz,
  source text CHECK (source IS NULL OR source IN ('cron', 'manual'))
);

CREATE INDEX idx_ai_event_requests_country ON public.ai_event_requests(country_id);
CREATE INDEX idx_ai_event_requests_created ON public.ai_event_requests(created_at DESC);
CREATE INDEX idx_ai_event_requests_status ON public.ai_event_requests(status);
CREATE INDEX idx_ai_event_requests_due ON public.ai_event_requests(consequences_applied_at, scheduled_trigger_at)
  WHERE status = 'accepted' AND consequences_applied_at IS NULL;

COMMENT ON TABLE public.ai_event_requests IS 'Événements IA (actions d''État générées par le cron ou créées manuellement). pending → admin accepte/refuse ; accepted → job Process due applique les conséquences.';

ALTER TABLE public.ai_event_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI event requests: lecture et écriture admin"
  ON public.ai_event_requests FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- ========== Règles : ai_events_config (défauts sûrs) ==========
INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
SELECT
  'ai_events_config',
  '{
    "interval_hours": 1,
    "count_major_per_run": 0,
    "count_minor_per_run": 0,
    "allowed_action_type_keys_major": [],
    "allowed_action_type_keys_minor": [],
    "target_major_ai": false,
    "target_minor_ai": false,
    "target_players": false,
    "distance_modes": ["world"],
    "auto_accept_by_action_type": {},
    "trigger_amplitude_minutes": 0
  }'::jsonb,
  'Configuration des events IA (temporalité, quantités, actions/cibles autorisées, automatisation).',
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM public.rule_parameters WHERE key = 'ai_events_config');

-- ========== Types d'actions : Escarmouche, Conflit, Guerre ==========
INSERT INTO public.state_action_types (key, label_fr, cost, params_schema, sort_order) VALUES
  ('escarmouche_militaire', 'Escarmouche Militaire', 1, '{"relation_delta": -10, "impact_maximum": 50}'::jsonb, 40),
  ('conflit_arme', 'Conflit Armé', 1, '{"relation_delta": -15, "impact_maximum": 60}'::jsonb, 50),
  ('guerre_ouverte', 'Guerre Ouverte', 1, '{"relation_delta": -20, "impact_maximum": 80}'::jsonb, 60)
ON CONFLICT (key) DO NOTHING;
