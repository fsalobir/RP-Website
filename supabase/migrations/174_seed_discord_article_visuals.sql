-- Une couverture et une couleur stables par type d'action.
WITH visuals(action_key, embed_color, image_url) AS (
  VALUES
    ('insulte_diplomatique', 12597547, 'https://images.unsplash.com/photo-1634226620574-79798606607a?auto=format&fit=crop&w=1200&q=80'),
    ('ouverture_diplomatique', 2719929, 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&q=80'),
    ('prise_influence', 9323693, 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80'),
    ('demande_up', 13937677, 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80'),
    ('escarmouche_militaire', 15105570, 'https://images.unsplash.com/flagged/photo-1578415855317-304906fcdba8?auto=format&fit=crop&w=1200&q=80'),
    ('conflit_arme', 9579297, 'https://images.unsplash.com/flagged/photo-1578415855317-304906fcdba8?auto=format&fit=crop&w=1200&q=80'),
    ('guerre_ouverte', 6561302, 'https://images.unsplash.com/flagged/photo-1578415855317-304906fcdba8?auto=format&fit=crop&w=1200&q=80'),
    ('accord_commercial_politique', 1144932, 'https://images.unsplash.com/photo-1758146296671-0e46a91739a8?auto=format&fit=crop&w=1200&q=80'),
    ('cooperation_militaire', 2388387, 'https://images.unsplash.com/flagged/photo-1578415855317-304906fcdba8?auto=format&fit=crop&w=1200&q=80'),
    ('alliance', 2056589, 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&q=80'),
    ('espionnage', 5975151, 'https://images.unsplash.com/photo-1465061935505-a7ac0037fd42?auto=format&fit=crop&w=1200&q=80'),
    ('sabotage', 8207512, 'https://images.unsplash.com/photo-1465061935505-a7ac0037fd42?auto=format&fit=crop&w=1200&q=80'),
    ('effort_fortifications', 5662067, 'https://images.unsplash.com/photo-1754821338799-fb4d932af946?auto=format&fit=crop&w=1200&q=80'),
    ('investissements', 1999945, 'https://images.unsplash.com/photo-1768612351275-59c4120e9100?auto=format&fit=crop&w=1200&q=80')
)
UPDATE public.action_automation_configs config
SET
  embed_color = visuals.embed_color,
  image_urls = jsonb_build_array(visuals.image_url),
  updated_at = now()
FROM public.state_action_types action_type, visuals
WHERE config.action_type_id = action_type.id
  AND action_type.key = visuals.action_key;
