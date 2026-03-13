-- Ministère Procuration Militaire : nouvelle colonne et contrainte de somme.

ALTER TABLE public.country_budget
  ADD COLUMN IF NOT EXISTS pct_procuration_militaire numeric(5, 2) NOT NULL DEFAULT 0 CHECK (pct_procuration_militaire >= 0 AND pct_procuration_militaire <= 100);

ALTER TABLE public.country_budget
  DROP CONSTRAINT IF EXISTS country_budget_sum_pct;

ALTER TABLE public.country_budget
  ADD CONSTRAINT country_budget_sum_pct CHECK (
    pct_etat + pct_education + pct_recherche + pct_infrastructure + pct_sante
    + pct_industrie + pct_defense + pct_interieur + pct_affaires_etrangeres
    + pct_procuration_militaire <= 100
  );

COMMENT ON COLUMN public.country_budget.pct_procuration_militaire IS 'Part du budget allouée à la Procuration Militaire (État Major).';
