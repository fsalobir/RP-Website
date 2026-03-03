-- Règles IA : effets appliqués aux pays sans joueur selon leur statut (Pays IA Majeur / Mineur).

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
SELECT 'ai_major_effects', '[]'::jsonb, 'Effets appliqués aux pays « Pays IA Majeur ».', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.rule_parameters WHERE key = 'ai_major_effects');

INSERT INTO public.rule_parameters (key, value, description, created_at, updated_at)
SELECT 'ai_minor_effects', '[]'::jsonb, 'Effets appliqués aux pays « Pays IA Mineur ».', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.rule_parameters WHERE key = 'ai_minor_effects');
