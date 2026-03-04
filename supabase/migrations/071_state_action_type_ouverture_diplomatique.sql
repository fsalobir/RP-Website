-- Nouveau type d'action d'État : Ouverture Diplomatique (améliorer les relations avec un pays cible).
INSERT INTO public.state_action_types (key, label_fr, cost, params_schema, sort_order) VALUES
  ('ouverture_diplomatique', 'Ouverture Diplomatique', 1, '{"impact_maximum": 50}'::jsonb, 15);
