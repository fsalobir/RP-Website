-- Mobilisation par pays : score 0–500, cible choisie par le joueur, évolution quotidienne par le cron.

CREATE TABLE public.country_mobilisation (
  country_id uuid PRIMARY KEY REFERENCES public.countries(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 500),
  target_score integer NOT NULL DEFAULT 0 CHECK (target_score >= 0 AND target_score <= 500),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_country_mobilisation_country ON public.country_mobilisation(country_id);

COMMENT ON TABLE public.country_mobilisation IS 'Score de mobilisation (0–500) et cible par pays. Le joueur assigné peut modifier target_score ; le cron fait évoluer score vers target_score.';

ALTER TABLE public.country_mobilisation ENABLE ROW LEVEL SECURITY;

-- Lecture publique (fiche pays)
CREATE POLICY "Country mobilisation: lecture publique"
  ON public.country_mobilisation FOR SELECT
  USING (true);

-- Écriture admin (création, score, target_score)
CREATE POLICY "Country mobilisation: écriture admin"
  ON public.country_mobilisation FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Joueur assigné : INSERT (créer sa ligne) et UPDATE (changer target_score) pour son pays uniquement
CREATE POLICY "Country mobilisation: écriture joueur assigné"
  ON public.country_mobilisation FOR INSERT
  WITH CHECK (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = auth.uid())
  );

CREATE POLICY "Country mobilisation: update joueur assigné"
  ON public.country_mobilisation FOR UPDATE
  USING (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = auth.uid())
  )
  WITH CHECK (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = auth.uid())
  );
