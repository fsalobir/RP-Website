-- Assouplir la contrainte de somme pour permettre Dette/Excédent (effets country_effects).
-- La somme peut aller de 0 à 150 % (excédent jusqu'à 150 %, dette en dessous de 100 %).

ALTER TABLE public.country_budget
  DROP CONSTRAINT IF EXISTS country_budget_sum_pct;

ALTER TABLE public.country_budget
  ADD CONSTRAINT country_budget_sum_pct CHECK (
    pct_etat + pct_education + pct_recherche + pct_infrastructure + pct_sante
    + pct_industrie + pct_defense + pct_interieur + pct_affaires_etrangeres >= 0
    AND
    pct_etat + pct_education + pct_recherche + pct_infrastructure + pct_sante
    + pct_industrie + pct_defense + pct_interieur + pct_affaires_etrangeres <= 150
  );

COMMENT ON CONSTRAINT country_budget_sum_pct ON public.country_budget IS
  'Somme des % entre 0 et 150 (effets Dette/Excédent). 100 = normal, <100 = dette, >100 = excédent.';
