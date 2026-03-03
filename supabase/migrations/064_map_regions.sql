-- Régions de la carte : géométries GeoJSON (un pays ou fusion de pays). Carte dynamique.

CREATE TABLE public.map_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  geometry jsonb NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_map_regions_slug ON public.map_regions(slug);

COMMENT ON TABLE public.map_regions IS 'Régions affichées sur la carte (une forme = un pays ou une fusion). Géométrie en GeoJSON.';

CREATE TABLE public.map_region_countries (
  region_id uuid NOT NULL REFERENCES public.map_regions(id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  PRIMARY KEY (region_id, country_id)
);

CREATE INDEX idx_map_region_countries_country ON public.map_region_countries(country_id);

COMMENT ON TABLE public.map_region_countries IS 'Pays rattachés à chaque région (1 pays = région simple, plusieurs = fusion).';

ALTER TABLE public.map_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_region_countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Map regions: lecture publique"
  ON public.map_regions FOR SELECT USING (true);
CREATE POLICY "Map regions: écriture admin insert"
  ON public.map_regions FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Map regions: écriture admin update"
  ON public.map_regions FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Map regions: écriture admin delete"
  ON public.map_regions FOR DELETE USING ((select public.is_admin()));

CREATE POLICY "Map region countries: lecture publique"
  ON public.map_region_countries FOR SELECT USING (true);
CREATE POLICY "Map region countries: écriture admin insert"
  ON public.map_region_countries FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Map region countries: écriture admin update"
  ON public.map_region_countries FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Map region countries: écriture admin delete"
  ON public.map_region_countries FOR DELETE USING ((select public.is_admin()));

CREATE TRIGGER map_regions_updated_at
  BEFORE UPDATE ON public.map_regions
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
