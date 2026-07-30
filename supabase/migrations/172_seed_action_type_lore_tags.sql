-- La sélection de contexte cherche déjà les clés des types d'actions.
-- Elles doivent donc exister dans le vocabulaire contrôlé.

INSERT INTO public.lore_tags (key, label_fr)
SELECT type.key, type.label_fr
FROM public.state_action_types type
WHERE type.key ~ '^[a-z0-9_-]+$'
ON CONFLICT (key) DO UPDATE
SET label_fr = EXCLUDED.label_fr;
