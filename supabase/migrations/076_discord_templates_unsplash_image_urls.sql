-- Renseigner 10 URLs d'images Unsplash par type d'action d'État pour les templates Discord (tests / démo).
-- Les templates existants (acceptée / refusée) pour chaque type reçoivent les mêmes 10 URLs.

-- Ouverture diplomatique (poignées de main, réunions, coopération)
UPDATE public.discord_dispatch_templates t
SET image_urls = '[
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&q=80",
  "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80",
  "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&q=80",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80",
  "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&q=80",
  "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80",
  "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&q=80",
  "https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=800&q=80",
  "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=800&q=80",
  "https://images.unsplash.com/photo-1552581234-26160f608093?w=800&q=80"
]'::jsonb
FROM public.discord_dispatch_types d
WHERE t.dispatch_type_id = d.id AND d.key IN ('ouverture_diplomatique_accepted', 'ouverture_diplomatique_refused');

-- Insulte / tension diplomatique (conflit, désaccord)
UPDATE public.discord_dispatch_templates t
SET image_urls = '[
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80",
  "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&q=80",
  "https://images.unsplash.com/photo-1569163138754-2c17d39c19c9?w=800&q=80",
  "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&q=80",
  "https://images.unsplash.com/photo-1568992687947-868a62a9f3b3?w=800&q=80",
  "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&q=80",
  "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=800&q=80",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80",
  "https://images.unsplash.com/photo-1494412651409-8963ce7935a7?w=800&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80"
]'::jsonb
FROM public.discord_dispatch_types d
WHERE t.dispatch_type_id = d.id AND d.key IN ('insulte_diplomatique_accepted', 'insulte_diplomatique_refused');

-- Prise d'influence (cartes, globe, stratégie)
UPDATE public.discord_dispatch_templates t
SET image_urls = '[
  "https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&q=80",
  "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=800&q=80",
  "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&q=80",
  "https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?w=800&q=80",
  "https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=800&q=80",
  "https://images.unsplash.com/photo-1500387467466-2a0ed5a8b26a?w=800&q=80",
  "https://images.unsplash.com/photo-1547448415-e9f5b28e570d?w=800&q=80",
  "https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80",
  "https://images.unsplash.com/photo-1564069114553-7215e1ff1890?w=800&q=80",
  "https://images.unsplash.com/photo-1532601224476-15c79f2f7a51?w=800&q=80"
]'::jsonb
FROM public.discord_dispatch_types d
WHERE t.dispatch_type_id = d.id AND d.key IN ('prise_influence_accepted', 'prise_influence_refused');

-- Demande d'up / décision officielle (bureau, réunion)
UPDATE public.discord_dispatch_templates t
SET image_urls = '[
  "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80",
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80",
  "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80",
  "https://images.unsplash.com/photo-1568992687947-868a62a9f3b3?w=800&q=80",
  "https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=800&q=80",
  "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=800&q=80",
  "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&q=80",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80",
  "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&q=80",
  "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&q=80"
]'::jsonb
FROM public.discord_dispatch_types d
WHERE t.dispatch_type_id = d.id AND d.key IN ('demande_up_accepted', 'demande_up_refused');
