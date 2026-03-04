-- Bot Discord : types de dispatch, routage canaux, templates (formules texte + images).
-- Config éditée depuis l'admin "Bot Discord" ; l'app envoie les messages via l'API REST Discord.

-- Types d'événements envoyables vers Discord
CREATE TABLE public.discord_dispatch_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label_fr text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_discord_dispatch_types_sort ON public.discord_dispatch_types(sort_order);
CREATE INDEX idx_discord_dispatch_types_key ON public.discord_dispatch_types(key);

COMMENT ON TABLE public.discord_dispatch_types IS 'Types d''événements envoyables vers Discord (state_action_accepted, state_action_refused, etc.). Activables/désactivables par l''admin.';

ALTER TABLE public.discord_dispatch_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Discord dispatch types: lecture publique"
  ON public.discord_dispatch_types FOR SELECT USING (true);

CREATE POLICY "Discord dispatch types: écriture admin"
  ON public.discord_dispatch_types FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

CREATE TRIGGER discord_dispatch_types_updated_at
  BEFORE UPDATE ON public.discord_dispatch_types
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Routage : où envoyer chaque type (priorité pays > région > défaut)
CREATE TABLE public.discord_channel_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_type_id uuid NOT NULL REFERENCES public.discord_dispatch_types(id) ON DELETE CASCADE,
  discord_channel_id text NOT NULL,
  country_id uuid REFERENCES public.countries(id) ON DELETE CASCADE,
  region_id uuid REFERENCES public.map_regions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT discord_channel_routes_country_or_region CHECK (
    (country_id IS NULL AND region_id IS NULL) OR
    (country_id IS NOT NULL AND region_id IS NULL) OR
    (country_id IS NULL AND region_id IS NOT NULL)
  )
);

CREATE INDEX idx_discord_channel_routes_dispatch ON public.discord_channel_routes(dispatch_type_id);
CREATE INDEX idx_discord_channel_routes_country ON public.discord_channel_routes(country_id) WHERE country_id IS NOT NULL;
CREATE INDEX idx_discord_channel_routes_region ON public.discord_channel_routes(region_id) WHERE region_id IS NOT NULL;

COMMENT ON TABLE public.discord_channel_routes IS 'Où envoyer chaque type de dispatch : canal par défaut (sans pays/région), par pays ou par région.';

ALTER TABLE public.discord_channel_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Discord channel routes: lecture publique"
  ON public.discord_channel_routes FOR SELECT USING (true);

CREATE POLICY "Discord channel routes: écriture admin"
  ON public.discord_channel_routes FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- Templates : formules de texte et images par type (tirage aléatoire)
CREATE TABLE public.discord_dispatch_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_type_id uuid NOT NULL REFERENCES public.discord_dispatch_types(id) ON DELETE CASCADE,
  label_fr text NOT NULL,
  body_template text NOT NULL DEFAULT '',
  embed_color text,
  image_urls jsonb DEFAULT '[]',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_discord_dispatch_templates_type ON public.discord_dispatch_templates(dispatch_type_id);

COMMENT ON TABLE public.discord_dispatch_templates IS 'Formules de texte (body_template avec placeholders) et images par type. Plusieurs lignes = tirage aléatoire.';
COMMENT ON COLUMN public.discord_dispatch_templates.image_urls IS 'Tableau JSON d''URLs d''images ; une choisie au hasard à l''envoi.';
COMMENT ON COLUMN public.discord_dispatch_templates.embed_color IS 'Couleur embed en hex (ex. 0x00ff00).';

ALTER TABLE public.discord_dispatch_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Discord dispatch templates: lecture publique"
  ON public.discord_dispatch_templates FOR SELECT USING (true);

CREATE POLICY "Discord dispatch templates: écriture admin"
  ON public.discord_dispatch_templates FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

CREATE TRIGGER discord_dispatch_templates_updated_at
  BEFORE UPDATE ON public.discord_dispatch_templates
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Seed des premiers types de dispatch
INSERT INTO public.discord_dispatch_types (key, label_fr, enabled, sort_order) VALUES
  ('state_action_accepted', 'Action d''État acceptée', true, 10),
  ('state_action_refused', 'Action d''État refusée', true, 20);

-- Un template par défaut par type (pour que l'envoi fonctionne dès qu'une route est configurée)
INSERT INTO public.discord_dispatch_templates (dispatch_type_id, label_fr, body_template, embed_color, image_urls, sort_order)
SELECT id, 'Rapport acceptation', 'Décision ministérielle : la demande de {country_name} (« {action_label} ») a été acceptée. {date}', '2e7d32', '[]', 0
FROM public.discord_dispatch_types WHERE key = 'state_action_accepted';
INSERT INTO public.discord_dispatch_templates (dispatch_type_id, label_fr, body_template, embed_color, image_urls, sort_order)
SELECT id, 'Rapport refus', 'Décision ministérielle : la demande de {country_name} (« {action_label} ») a été refusée. {refusal_message} {date}', 'c62828', '[]', 0
FROM public.discord_dispatch_types WHERE key = 'state_action_refused';
