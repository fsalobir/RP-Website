-- Une illustration générique ne doit pas montrer le drapeau d'un pays absent de l'article.
UPDATE public.action_automation_configs config
SET
  image_urls = jsonb_build_array(
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80'
  ),
  updated_at = now()
FROM public.state_action_types action_type
WHERE config.action_type_id = action_type.id
  AND action_type.key = 'insulte_diplomatique';
