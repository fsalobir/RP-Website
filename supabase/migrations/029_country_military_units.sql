-- État militaire par pays : niveau et delta d'unités par rapport au template (roster).
-- total_count = base_count (roster) + extra_count (cette table).

CREATE TABLE IF NOT EXISTS public.country_military_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  roster_unit_id uuid NOT NULL REFERENCES public.military_roster_units(id) ON DELETE CASCADE,
  current_level smallint NOT NULL DEFAULT 1 CHECK (current_level >= 1),
  extra_count integer NOT NULL DEFAULT 0 CHECK (extra_count >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(country_id, roster_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_country_military_units_country
  ON public.country_military_units(country_id);
CREATE INDEX IF NOT EXISTS idx_country_military_units_roster
  ON public.country_military_units(roster_unit_id);

ALTER TABLE public.country_military_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Country military units: lecture publique" ON public.country_military_units;
DROP POLICY IF EXISTS "Country military units: écriture admin" ON public.country_military_units;
CREATE POLICY "Country military units: lecture publique"
  ON public.country_military_units FOR SELECT USING (true);
CREATE POLICY "Country military units: écriture admin"
  ON public.country_military_units FOR ALL USING (public.is_admin());

DROP TRIGGER IF EXISTS country_military_units_updated_at ON public.country_military_units;
CREATE TRIGGER country_military_units_updated_at
  BEFORE UPDATE ON public.country_military_units
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
