-- Adapter country_military_units.current_level pour représenter une progression en points (0..level_count*100).

ALTER TABLE public.country_military_units
  ALTER COLUMN current_level TYPE integer USING current_level::integer;

ALTER TABLE public.country_military_units
  ALTER COLUMN current_level SET DEFAULT 0;

ALTER TABLE public.country_military_units
  DROP CONSTRAINT IF EXISTS country_military_units_current_level_check;

ALTER TABLE public.country_military_units
  ADD CONSTRAINT country_military_units_current_level_check CHECK (current_level >= 0);

