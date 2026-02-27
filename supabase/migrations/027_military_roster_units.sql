-- Roster militaire : unités templates + manpower par niveau.

-- 1) Étendre l'enum existant (terre/air/mer) avec "strategique"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'military_branch'
      AND n.nspname = 'public'
      AND e.enumlabel = 'strategique'
  ) THEN
    ALTER TYPE public.military_branch ADD VALUE 'strategique';
  END IF;
END
$$;

-- 2) Unités du roster (templates)
CREATE TABLE IF NOT EXISTS public.military_roster_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch public.military_branch NOT NULL,
  sub_type text,
  name_fr text NOT NULL,
  icon_url text,
  level_count smallint NOT NULL CHECK (level_count >= 1 AND level_count <= 10),
  base_count integer NOT NULL DEFAULT 0 CHECK (base_count >= 0),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_military_roster_units_branch_sort
  ON public.military_roster_units(branch, sort_order, name_fr);

-- 3) Niveaux (manpower par niveau)
CREATE TABLE IF NOT EXISTS public.military_roster_unit_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.military_roster_units(id) ON DELETE CASCADE,
  level smallint NOT NULL CHECK (level >= 1),
  manpower integer NOT NULL DEFAULT 0 CHECK (manpower >= 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(unit_id, level)
);

CREATE INDEX IF NOT EXISTS idx_military_roster_unit_levels_unit
  ON public.military_roster_unit_levels(unit_id, level);

-- 4) RLS
ALTER TABLE public.military_roster_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.military_roster_unit_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Military roster units: lecture publique" ON public.military_roster_units;
DROP POLICY IF EXISTS "Military roster units: écriture admin" ON public.military_roster_units;
CREATE POLICY "Military roster units: lecture publique"
  ON public.military_roster_units FOR SELECT USING (true);
CREATE POLICY "Military roster units: écriture admin"
  ON public.military_roster_units FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Military roster unit levels: lecture publique" ON public.military_roster_unit_levels;
DROP POLICY IF EXISTS "Military roster unit levels: écriture admin" ON public.military_roster_unit_levels;
CREATE POLICY "Military roster unit levels: lecture publique"
  ON public.military_roster_unit_levels FOR SELECT USING (true);
CREATE POLICY "Military roster unit levels: écriture admin"
  ON public.military_roster_unit_levels FOR ALL USING (public.is_admin());

-- 5) updated_at trigger pour roster_units
DROP TRIGGER IF EXISTS military_roster_units_updated_at ON public.military_roster_units;
CREATE TRIGGER military_roster_units_updated_at
  BEFORE UPDATE ON public.military_roster_units
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

