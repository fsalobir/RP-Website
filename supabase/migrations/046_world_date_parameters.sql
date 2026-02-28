-- Date du monde (Mois Année) et temporalité (mois par mise à jour).
-- Utilisé par le Rapport du Cabinet et avancé par le cron à chaque run.

INSERT INTO public.rule_parameters (key, value, description) VALUES
  (
    'world_date',
    '{"month": 1, "year": 2025}'::jsonb,
    'Date du monde (format : month 1–12, year). Affichage « Mois Année ». Éditable en admin ; avancée par le cron selon world_date_advance_months.'
  ),
  (
    'world_date_advance_months',
    '1'::jsonb,
    'Nombre de mois ajoutés à la date du monde à chaque passage du cron (défaut : 1).'
  )
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;
