-- Nation Simulator - Schéma initial
-- Exécuter dans Supabase : SQL Editor > New query > coller et Run

-- Extensions utiles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========== ADMINS (liste des utilisateurs admin) ==========
CREATE TABLE public.admins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- ========== COUNTRIES (généralités, société, macros) ==========
CREATE TABLE public.countries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  regime text,
  flag_url text,
  -- Société (scores)
  militarism smallint CHECK (militarism >= 0 AND militarism <= 10) DEFAULT 5,
  industry smallint CHECK (industry >= 0 AND industry <= 10) DEFAULT 5,
  science smallint CHECK (science >= 0 AND science <= 10) DEFAULT 5,
  stability smallint CHECK (stability >= -3 AND stability <= 3) DEFAULT 0,
  -- Macros
  population bigint DEFAULT 0,
  gdp numeric(20, 2) DEFAULT 0,
  growth numeric(6, 2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_countries_slug ON public.countries(slug);

-- ========== COUNTRY_MACROS (clé-valeur pour "Autres" macros) ==========
CREATE TABLE public.country_macros (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  key text NOT NULL,
  value numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(country_id, key)
);

CREATE INDEX idx_country_macros_country ON public.country_macros(country_id);

-- ========== RULE_PARAMETERS (règles de simulation) ==========
CREATE TABLE public.rule_parameters (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ========== MILITARY BRANCHES (Terre, Air, Mer) ==========
CREATE TYPE military_branch AS ENUM ('terre', 'air', 'mer');

CREATE TABLE public.military_unit_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch military_branch NOT NULL,
  name_fr text NOT NULL,
  sort_order smallint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.country_military_limits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  unit_type_id uuid NOT NULL REFERENCES public.military_unit_types(id) ON DELETE CASCADE,
  limit_value integer NOT NULL DEFAULT 0 CHECK (limit_value >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(country_id, unit_type_id)
);

CREATE INDEX idx_country_military_country ON public.country_military_limits(country_id);

-- ========== PERKS (avantages / achievements) ==========
CREATE TABLE public.perks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_fr text NOT NULL,
  description_fr text,
  modifier text,
  min_militarism smallint CHECK (min_militarism >= 0 AND min_militarism <= 10),
  min_industry smallint CHECK (min_industry >= 0 AND min_industry <= 10),
  min_science smallint CHECK (min_science >= 0 AND min_science <= 10),
  min_stability smallint CHECK (min_stability >= -3 AND min_stability <= 3),
  sort_order smallint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.country_perks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  perk_id uuid NOT NULL REFERENCES public.perks(id) ON DELETE CASCADE,
  unlocked_at timestamptz DEFAULT now(),
  UNIQUE(country_id, perk_id)
);

CREATE INDEX idx_country_perks_country ON public.country_perks(country_id);

-- ========== RLS ==========
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.military_unit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_military_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_perks ENABLE ROW LEVEL SECURITY;

-- Fonction : est admin ?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Countries : lecture publique, écriture admin
CREATE POLICY "Countries: lecture publique"
  ON public.countries FOR SELECT USING (true);

CREATE POLICY "Countries: écriture admin"
  ON public.countries FOR ALL USING (public.is_admin());

-- Country macros
CREATE POLICY "Country macros: lecture publique"
  ON public.country_macros FOR SELECT USING (true);
CREATE POLICY "Country macros: écriture admin"
  ON public.country_macros FOR ALL USING (public.is_admin());

-- Rule parameters
CREATE POLICY "Rule parameters: lecture publique"
  ON public.rule_parameters FOR SELECT USING (true);
CREATE POLICY "Rule parameters: écriture admin"
  ON public.rule_parameters FOR ALL USING (public.is_admin());

-- Military unit types (lecture publique, écriture admin)
CREATE POLICY "Military unit types: lecture publique"
  ON public.military_unit_types FOR SELECT USING (true);
CREATE POLICY "Military unit types: écriture admin"
  ON public.military_unit_types FOR ALL USING (public.is_admin());

-- Country military limits
CREATE POLICY "Country military: lecture publique"
  ON public.country_military_limits FOR SELECT USING (true);
CREATE POLICY "Country military: écriture admin"
  ON public.country_military_limits FOR ALL USING (public.is_admin());

-- Perks
CREATE POLICY "Perks: lecture publique"
  ON public.perks FOR SELECT USING (true);
CREATE POLICY "Perks: écriture admin"
  ON public.perks FOR ALL USING (public.is_admin());

-- Country perks
CREATE POLICY "Country perks: lecture publique"
  ON public.country_perks FOR SELECT USING (true);
CREATE POLICY "Country perks: écriture admin"
  ON public.country_perks FOR ALL USING (public.is_admin());

-- Admins : seul un admin peut lire la liste (ou on restreint à soi-même)
CREATE POLICY "Admins: lecture par admin"
  ON public.admins FOR SELECT USING (public.is_admin());

-- ========== TRIGGER updated_at ==========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER rule_parameters_updated_at
  BEFORE UPDATE ON public.rule_parameters
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER country_military_limits_updated_at
  BEFORE UPDATE ON public.country_military_limits
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER perks_updated_at
  BEFORE UPDATE ON public.perks
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ========== DONNÉES INITIALES ==========
-- Paramètres de règle (exemples)
INSERT INTO public.rule_parameters (key, value, description) VALUES
  ('population_growth_base_rate', '0.001'::jsonb, 'Taux de croissance de base de la population (par jour)'),
  ('gdp_growth_base_rate', '0.0005'::jsonb, 'Taux de croissance de base du PIB (par jour)');

-- Types d'unités militaires (exemples à personnaliser)
INSERT INTO public.military_unit_types (branch, name_fr, sort_order) VALUES
  ('terre', 'Infanterie', 1),
  ('terre', 'Blindés', 2),
  ('terre', 'Artillerie', 3),
  ('air', 'Chasseurs', 1),
  ('air', 'Bombardiers', 2),
  ('air', 'Hélicoptères', 3),
  ('mer', 'Navires de surface', 1),
  ('mer', 'Sous-marins', 2),
  ('mer', 'Porte-avions', 3);
