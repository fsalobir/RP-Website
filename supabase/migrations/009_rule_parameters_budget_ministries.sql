-- Paramètres de règles par ministère (budget d'état) : min %, malus max, bonus max par effet, gravité catch-up.
-- Structure JSON par ministère : min_pct, max_malus, gravity_pct, bonuses { [effet]: bonus_max_jour }

INSERT INTO public.rule_parameters (key, value, description) VALUES
  ('budget_etat', '{"min_pct": 5, "max_malus": -0.05, "gravity_pct": 50, "bonuses": {"actions": 0.01}}'::jsonb, 'Ministère d''État'),
  ('budget_education', '{"min_pct": 5, "max_malus": -0.05, "gravity_pct": 50, "bonuses": {"science": 0.02, "stability": 0.01}}'::jsonb, 'Ministère de l''Éducation'),
  ('budget_recherche', '{"min_pct": 5, "max_malus": -0.05, "gravity_pct": 50, "bonuses": {"science": 0.05}}'::jsonb, 'Ministère de la Recherche'),
  ('budget_infrastructure', '{"min_pct": 5, "max_malus": -0.05, "gravity_pct": 50, "bonuses": {"gdp": 0.001, "industry": 0.02}}'::jsonb, 'Ministère de l''Infrastructure'),
  ('budget_sante', '{"min_pct": 5, "max_malus": -0.05, "gravity_pct": 50, "bonuses": {"population": 0.0001}}'::jsonb, 'Ministère de la Santé'),
  ('budget_industrie', '{"min_pct": 5, "max_malus": -0.05, "gravity_pct": 50, "bonuses": {"industry": 0.05}}'::jsonb, 'Ministère de l''Industrie'),
  ('budget_defense', '{"min_pct": 5, "max_malus": -0.05, "gravity_pct": 50, "bonuses": {"militarism": 0.03}}'::jsonb, 'Ministère de la Défense'),
  ('budget_interieur', '{"min_pct": 5, "max_malus": -0.05, "gravity_pct": 50, "bonuses": {"stability": 0.05}}'::jsonb, 'Ministère de l''Intérieur'),
  ('budget_affaires_etrangeres', '{"min_pct": 5, "max_malus": -0.05, "gravity_pct": 50, "bonuses": {"stability": 0.02, "gdp": 0.0005}}'::jsonb, 'Ministère des Affaires étrangères')
ON CONFLICT (key) DO NOTHING;
