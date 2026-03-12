-- Requis dynamiques pour les avantages (comme les effets : liste ajoutable/supprimable).
-- Types : stat (militarism/industry/science/stability), gdp, population, influence, law_level.

CREATE TABLE public.perk_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perk_id uuid NOT NULL REFERENCES public.perks(id) ON DELETE CASCADE,
  requirement_kind text NOT NULL,
  requirement_target text,
  value numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_perk_requirements_perk ON public.perk_requirements(perk_id);

ALTER TABLE public.perk_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perk requirements: lecture publique"
  ON public.perk_requirements FOR SELECT USING (true);
CREATE POLICY "Perk requirements: écriture admin insert"
  ON public.perk_requirements FOR INSERT WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Perk requirements: écriture admin update"
  ON public.perk_requirements FOR UPDATE USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "Perk requirements: écriture admin delete"
  ON public.perk_requirements FOR DELETE USING ((SELECT public.is_admin()));

CREATE TRIGGER perk_requirements_updated_at
  BEFORE UPDATE ON public.perk_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.perk_requirements IS 'Requis dynamiques pour activer un avantage (stat, PIB, population, influence, niveau de loi).';
COMMENT ON COLUMN public.perk_requirements.requirement_kind IS 'stat | gdp | population | influence | law_level';
COMMENT ON COLUMN public.perk_requirements.requirement_target IS 'Pour stat: militarism|industry|science|stability. Pour law_level: law_key (ex. mobilisation). Sinon NULL.';
COMMENT ON COLUMN public.perk_requirements.value IS 'Seuil minimum (pour law_level: index de niveau 1-5).';

-- Migrer les anciens min_* vers perk_requirements pour compatibilité
INSERT INTO public.perk_requirements (perk_id, requirement_kind, requirement_target, value)
SELECT p.id, 'stat', 'militarism', p.min_militarism
FROM public.perks p
WHERE p.min_militarism IS NOT NULL
UNION ALL
SELECT p.id, 'stat', 'industry', p.min_industry FROM public.perks p WHERE p.min_industry IS NOT NULL
UNION ALL
SELECT p.id, 'stat', 'science', p.min_science FROM public.perks p WHERE p.min_science IS NOT NULL
UNION ALL
SELECT p.id, 'stat', 'stability', p.min_stability FROM public.perks p WHERE p.min_stability IS NOT NULL;
