-- Effets en cours par pays : bonus/malus temporaires (admin-only CRUD, lecture publique).
-- La durée restante est décrémentée par le cron ; à 0 l'effet est supprimé.

CREATE TABLE public.country_effects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  name text NOT NULL,
  effect_kind text NOT NULL,
  effect_target text,
  effect_subtype text,
  value numeric NOT NULL,
  duration_kind text NOT NULL CHECK (duration_kind IN ('days', 'updates')),
  duration_remaining integer NOT NULL CHECK (duration_remaining >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_country_effects_country ON public.country_effects(country_id);

ALTER TABLE public.country_effects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Country effects: lecture publique"
  ON public.country_effects FOR SELECT USING (true);

CREATE POLICY "Country effects: écriture admin"
  ON public.country_effects FOR ALL USING (public.is_admin());

CREATE TRIGGER country_effects_updated_at
  BEFORE UPDATE ON public.country_effects
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON TABLE public.country_effects IS 'Effets temporaires par pays (croissance, stats, budget ministère). CRUD admin ; durée décrémentée par le cron.';
