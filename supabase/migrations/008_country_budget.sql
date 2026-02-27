-- Budget d'état par pays : fraction du PIB (éditable par admin) et répartition entre ministères.
-- La somme des pourcentages ne peut pas dépasser 100 %.

CREATE TABLE public.country_budget (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  budget_fraction numeric(5, 4) NOT NULL DEFAULT 0.1 CHECK (budget_fraction >= 0 AND budget_fraction <= 1),
  pct_etat numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_etat >= 0 AND pct_etat <= 100),
  pct_education numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_education >= 0 AND pct_education <= 100),
  pct_recherche numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_recherche >= 0 AND pct_recherche <= 100),
  pct_infrastructure numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_infrastructure >= 0 AND pct_infrastructure <= 100),
  pct_sante numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_sante >= 0 AND pct_sante <= 100),
  pct_industrie numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_industrie >= 0 AND pct_industrie <= 100),
  pct_defense numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_defense >= 0 AND pct_defense <= 100),
  pct_interieur numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_interieur >= 0 AND pct_interieur <= 100),
  pct_affaires_etrangeres numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_affaires_etrangeres >= 0 AND pct_affaires_etrangeres <= 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT country_budget_sum_pct CHECK (
    pct_etat + pct_education + pct_recherche + pct_infrastructure + pct_sante
    + pct_industrie + pct_defense + pct_interieur + pct_affaires_etrangeres <= 100
  )
);

CREATE UNIQUE INDEX idx_country_budget_country ON public.country_budget(country_id);

ALTER TABLE public.country_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Country budget: lecture publique"
  ON public.country_budget FOR SELECT USING (true);

CREATE POLICY "Country budget: écriture (joueur ou admin)"
  ON public.country_budget FOR ALL USING (true);

COMMENT ON TABLE public.country_budget IS 'Budget d''état (fraction du PIB) et répartition par ministère pour chaque pays.';
