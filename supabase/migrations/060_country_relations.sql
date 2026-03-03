-- Matrice de relations diplomatiques : une valeur bilatérale par paire de pays (-100 à +100).
-- Une seule ligne par paire (country_a_id < country_b_id).

CREATE TABLE public.country_relations (
  country_a_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  country_b_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  value smallint NOT NULL DEFAULT 0 CHECK (value >= -100 AND value <= 100),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (country_a_id, country_b_id),
  CHECK (country_a_id < country_b_id)
);

CREATE INDEX idx_country_relations_b ON public.country_relations(country_b_id);

COMMENT ON TABLE public.country_relations IS 'Relation diplomatique bilatérale entre deux pays (-100 haine à +100 loyauté). Une ligne par paire (country_a_id < country_b_id).';

ALTER TABLE public.country_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Country relations: lecture publique"
  ON public.country_relations FOR SELECT USING (true);

CREATE POLICY "Country relations: écriture admin insert"
  ON public.country_relations FOR INSERT WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country relations: écriture admin update"
  ON public.country_relations FOR UPDATE USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "Country relations: écriture admin delete"
  ON public.country_relations FOR DELETE USING ((select public.is_admin()));

CREATE TRIGGER country_relations_updated_at
  BEFORE UPDATE ON public.country_relations
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
