-- État Major : points accumulés pour Recrutement, Procuration, Stock (vers prochain extra).

ALTER TABLE public.country_military_units
  ADD COLUMN IF NOT EXISTS recrutement_points integer NOT NULL DEFAULT 0 CHECK (recrutement_points >= 0);

ALTER TABLE public.country_military_units
  ADD COLUMN IF NOT EXISTS procuration_points integer NOT NULL DEFAULT 0 CHECK (procuration_points >= 0);

ALTER TABLE public.country_military_units
  ADD COLUMN IF NOT EXISTS stock_points integer NOT NULL DEFAULT 0 CHECK (stock_points >= 0);

COMMENT ON COLUMN public.country_military_units.recrutement_points IS 'Points accumulés vers le prochain extra (Recrutement État Major).';
COMMENT ON COLUMN public.country_military_units.procuration_points IS 'Points accumulés vers le prochain extra (Procuration État Major).';
COMMENT ON COLUMN public.country_military_units.stock_points IS 'Points accumulés vers le prochain extra (Stock Stratégique État Major).';
