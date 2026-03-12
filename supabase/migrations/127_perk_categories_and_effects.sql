-- ========== PERK CATEGORIES ==========
CREATE TABLE public.perk_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_fr text NOT NULL,
  sort_order smallint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.perk_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perk categories: lecture publique"
  ON public.perk_categories FOR SELECT USING (true);
CREATE POLICY "Perk categories: écriture admin insert"
  ON public.perk_categories FOR INSERT WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Perk categories: écriture admin update"
  ON public.perk_categories FOR UPDATE USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Perk categories: écriture admin delete"
  ON public.perk_categories FOR DELETE USING ((SELECT public.is_admin()));

-- ========== EVOLUTION PERKS (category_id, icon_url) ==========
ALTER TABLE public.perks
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.perk_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS icon_url text;

CREATE INDEX IF NOT EXISTS idx_perks_category ON public.perks(category_id);

-- ========== PERK EFFECTS ==========
CREATE TABLE public.perk_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perk_id uuid NOT NULL REFERENCES public.perks(id) ON DELETE CASCADE,
  effect_kind text NOT NULL,
  effect_target text,
  effect_subtype text,
  value numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_perk_effects_perk ON public.perk_effects(perk_id);

ALTER TABLE public.perk_effects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perk effects: lecture publique"
  ON public.perk_effects FOR SELECT USING (true);
CREATE POLICY "Perk effects: écriture admin insert"
  ON public.perk_effects FOR INSERT WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Perk effects: écriture admin update"
  ON public.perk_effects FOR UPDATE USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Perk effects: écriture admin delete"
  ON public.perk_effects FOR DELETE USING ((SELECT public.is_admin()));

-- Triggers updated_at (set_updated_at exists in 001 / 029)
DROP TRIGGER IF EXISTS perk_categories_updated_at ON public.perk_categories;
CREATE TRIGGER perk_categories_updated_at
  BEFORE UPDATE ON public.perk_categories
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS perk_effects_updated_at ON public.perk_effects;
CREATE TRIGGER perk_effects_updated_at
  BEFORE UPDATE ON public.perk_effects
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
