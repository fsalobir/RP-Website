-- État Major : choix de focus par pays (une unité par slot Design, Recrutement, Procuration, Stock).

CREATE TABLE IF NOT EXISTS public.country_etat_major_focus (
  country_id uuid PRIMARY KEY REFERENCES public.countries(id) ON DELETE CASCADE,
  design_roster_unit_id uuid REFERENCES public.military_roster_units(id) ON DELETE SET NULL,
  recrutement_roster_unit_id uuid REFERENCES public.military_roster_units(id) ON DELETE SET NULL,
  procuration_roster_unit_id uuid REFERENCES public.military_roster_units(id) ON DELETE SET NULL,
  stock_roster_unit_id uuid REFERENCES public.military_roster_units(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_country_etat_major_focus_design ON public.country_etat_major_focus(design_roster_unit_id) WHERE design_roster_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_country_etat_major_focus_recrutement ON public.country_etat_major_focus(recrutement_roster_unit_id) WHERE recrutement_roster_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_country_etat_major_focus_procuration ON public.country_etat_major_focus(procuration_roster_unit_id) WHERE procuration_roster_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_country_etat_major_focus_stock ON public.country_etat_major_focus(stock_roster_unit_id) WHERE stock_roster_unit_id IS NOT NULL;

ALTER TABLE public.country_etat_major_focus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Country etat major focus: lecture publique" ON public.country_etat_major_focus;
DROP POLICY IF EXISTS "Country etat major focus: écriture joueur ou admin" ON public.country_etat_major_focus;

CREATE POLICY "Country etat major focus: lecture publique"
  ON public.country_etat_major_focus FOR SELECT USING (true);

CREATE POLICY "Country etat major focus: écriture joueur ou admin"
  ON public.country_etat_major_focus FOR ALL USING (true);

COMMENT ON TABLE public.country_etat_major_focus IS 'Focus État Major par pays : unité choisie pour Design, Recrutement, Procuration, Stock.';
