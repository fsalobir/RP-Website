-- Continents, canaux par continent (national/international), types de dispatch dérivés des actions d'État.

-- Table continents (Europe, Asie, Afrique, Amérique)
CREATE TABLE public.continents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label_fr text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_continents_slug ON public.continents(slug);

INSERT INTO public.continents (slug, label_fr, sort_order) VALUES
  ('europe', 'Europe', 10),
  ('asie', 'Asie', 20),
  ('afrique', 'Afrique', 30),
  ('amerique', 'Amérique', 40);

ALTER TABLE public.continents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Continents: lecture publique"
  ON public.continents FOR SELECT USING (true);
CREATE POLICY "Continents: écriture admin"
  ON public.continents FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- Pays : lien vers continent
ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS continent_id uuid REFERENCES public.continents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_countries_continent ON public.countries(continent_id);

-- Canaux Discord par continent (national / international)
CREATE TABLE public.discord_region_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  continent_id uuid NOT NULL REFERENCES public.continents(id) ON DELETE CASCADE,
  channel_kind text NOT NULL CHECK (channel_kind IN ('national', 'international')),
  discord_channel_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(continent_id, channel_kind)
);

CREATE INDEX idx_discord_region_channels_continent ON public.discord_region_channels(continent_id);

ALTER TABLE public.discord_region_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Discord region channels: lecture publique"
  ON public.discord_region_channels FOR SELECT USING (true);
CREATE POLICY "Discord region channels: écriture admin"
  ON public.discord_region_channels FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- Types de dispatch : lien vers action d'État + destination (national/international)
ALTER TABLE public.discord_dispatch_types
  ADD COLUMN IF NOT EXISTS state_action_type_id uuid REFERENCES public.state_action_types(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IS NULL OR outcome IN ('accepted', 'refused')),
  ADD COLUMN IF NOT EXISTS destination text NOT NULL DEFAULT 'international' CHECK (destination IN ('national', 'international'));

CREATE INDEX IF NOT EXISTS idx_discord_dispatch_types_state_action ON public.discord_dispatch_types(state_action_type_id) WHERE state_action_type_id IS NOT NULL;

-- Backfill : pour chaque type d'action d'État, créer deux lignes (acceptée, refusée)
INSERT INTO public.discord_dispatch_types (key, label_fr, enabled, sort_order, state_action_type_id, outcome, destination)
SELECT t.key || '_accepted', t.label_fr || ' acceptée', true, (t.sort_order * 2), t.id, 'accepted', 'international'
FROM public.state_action_types t
WHERE NOT EXISTS (SELECT 1 FROM public.discord_dispatch_types d WHERE d.key = t.key || '_accepted');

INSERT INTO public.discord_dispatch_types (key, label_fr, enabled, sort_order, state_action_type_id, outcome, destination)
SELECT t.key || '_refused', t.label_fr || ' refusée', true, (t.sort_order * 2 + 1), t.id, 'refused', 'international'
FROM public.state_action_types t
WHERE NOT EXISTS (SELECT 1 FROM public.discord_dispatch_types d WHERE d.key = t.key || '_refused');

-- Templates par défaut pour chaque nouveau type
INSERT INTO public.discord_dispatch_templates (dispatch_type_id, label_fr, body_template, embed_color, image_urls, sort_order)
SELECT d.id, 'Rapport acceptation', 'Décision ministérielle : la demande de {country_name} (« {action_label} ») a été acceptée. {date}', '2e7d32', '[]', 0
FROM public.discord_dispatch_types d
WHERE d.outcome = 'accepted' AND d.state_action_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.discord_dispatch_templates t WHERE t.dispatch_type_id = d.id);

INSERT INTO public.discord_dispatch_templates (dispatch_type_id, label_fr, body_template, embed_color, image_urls, sort_order)
SELECT d.id, 'Rapport refus', 'Décision ministérielle : la demande de {country_name} (« {action_label} ») a été refusée. {refusal_message} {date}', 'c62828', '[]', 0
FROM public.discord_dispatch_types d
WHERE d.outcome = 'refused' AND d.state_action_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.discord_dispatch_templates t WHERE t.dispatch_type_id = d.id);

-- Supprimer les anciens types génériques (et leurs templates en CASCADE si FK ON DELETE CASCADE sur templates)
DELETE FROM public.discord_dispatch_types WHERE key IN ('state_action_accepted', 'state_action_refused');

-- Trigger : à l'ajout d'un type d'action d'État, créer les deux types de dispatch + templates
CREATE OR REPLACE FUNCTION public.sync_discord_dispatch_types_on_state_action_type_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  id_acc uuid;
  id_ref uuid;
BEGIN
  INSERT INTO public.discord_dispatch_types (key, label_fr, enabled, sort_order, state_action_type_id, outcome, destination)
  VALUES (NEW.key || '_accepted', NEW.label_fr || ' acceptée', true, NEW.sort_order * 2, NEW.id, 'accepted', 'international')
  RETURNING id INTO id_acc;
  INSERT INTO public.discord_dispatch_types (key, label_fr, enabled, sort_order, state_action_type_id, outcome, destination)
  VALUES (NEW.key || '_refused', NEW.label_fr || ' refusée', true, NEW.sort_order * 2 + 1, NEW.id, 'refused', 'international')
  RETURNING id INTO id_ref;
  INSERT INTO public.discord_dispatch_templates (dispatch_type_id, label_fr, body_template, embed_color, image_urls, sort_order)
  VALUES (id_acc, 'Rapport acceptation', 'Décision ministérielle : la demande de {country_name} (« {action_label} ») a été acceptée. {date}', '2e7d32', '[]', 0);
  INSERT INTO public.discord_dispatch_templates (dispatch_type_id, label_fr, body_template, embed_color, image_urls, sort_order)
  VALUES (id_ref, 'Rapport refus', 'Décision ministérielle : la demande de {country_name} (« {action_label} ») a été refusée. {refusal_message} {date}', 'c62828', '[]', 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_discord_dispatch_types_trigger ON public.state_action_types;
CREATE TRIGGER sync_discord_dispatch_types_trigger
  AFTER INSERT ON public.state_action_types
  FOR EACH ROW EXECUTE PROCEDURE public.sync_discord_dispatch_types_on_state_action_type_insert();

-- Supprimer l'ancienne table de routage
DROP TABLE IF EXISTS public.discord_channel_routes;
