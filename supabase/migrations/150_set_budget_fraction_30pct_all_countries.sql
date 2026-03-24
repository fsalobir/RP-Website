-- Met la fraction du PIB a 30% pour tous les pays.
-- 1) Met a jour les lignes existantes
update public.country_budget
set budget_fraction = 0.3,
    updated_at = now();

-- 2) Cree une ligne budget pour les pays qui n'en ont pas encore
insert into public.country_budget (
  country_id,
  budget_fraction,
  pct_etat,
  pct_education,
  pct_recherche,
  pct_infrastructure,
  pct_sante,
  pct_industrie,
  pct_defense,
  pct_interieur,
  pct_affaires_etrangeres,
  pct_procuration_militaire
)
select
  c.id,
  0.3,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0
from public.countries c
left join public.country_budget b on b.country_id = c.id
where b.id is null;
