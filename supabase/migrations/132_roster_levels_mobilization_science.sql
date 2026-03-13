-- État Major : coût de mobilisation et science requise par niveau d'unité.

ALTER TABLE public.military_roster_unit_levels
  ADD COLUMN IF NOT EXISTS mobilization_cost integer NOT NULL DEFAULT 100 CHECK (mobilization_cost >= 0);

ALTER TABLE public.military_roster_unit_levels
  ADD COLUMN IF NOT EXISTS science_required numeric(5,2) NOT NULL DEFAULT 0 CHECK (science_required >= 0);

COMMENT ON COLUMN public.military_roster_unit_levels.mobilization_cost IS 'Coût en points pour acquérir un extra à ce niveau (Recrutement, Procuration, Stock).';
COMMENT ON COLUMN public.military_roster_unit_levels.science_required IS 'Seuil de science pour débloquer ce niveau en Design (ex. 4.0 = niveau 4).';
