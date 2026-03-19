-- Seed Fantasy exhaustif (local / CI) avec IDs fixes.
-- Objectif: fournir un état initial cohérent pour le « Duché de Val-Fleuri »
-- en respectant strictement le schéma `0000_initial_fantasy_schema.sql`.

begin;

-- =========================
-- IDs FIXES (ne pas changer sans raison)
-- =========================
-- Ressources
-- - Or:         10000000-0000-0000-0000-000000000001
-- - Mana:       10000000-0000-0000-0000-000000000002
-- - Prospérité: 10000000-0000-0000-0000-000000000003
-- - Population: 10000000-0000-0000-0000-000000000004
-- Royaume joueur
-- - Duché de Val-Fleuri: 20000000-0000-0000-0000-000000000001
-- Provinces
-- - Plaines de l'Aube:   30000000-0000-0000-0000-000000000001
-- - Port-Argent:         30000000-0000-0000-0000-000000000002
-- Races
-- - Humains:             40000000-0000-0000-0000-000000000001
-- - Elfes:               40000000-0000-0000-0000-000000000002
-- Item
-- - Couronne de Majesté: 50000000-0000-0000-0000-000000000001
-- Effets
-- - Âge d'Or (Royaume):  60000000-0000-0000-0000-000000000001
-- - Port Franc (Ville):  60000000-0000-0000-0000-000000000002

-- Utilisateur MJ local
-- - frantz.salobir@hetic.net : 90000000-0000-0000-0000-000000000001

-- =========================
-- Nettoyage idempotent (ordre FK)
-- =========================
delete from public.mj_admins
where user_id = '90000000-0000-0000-0000-000000000001';

delete from auth.identities
where user_id = '90000000-0000-0000-0000-000000000001';

delete from auth.users
where id = '90000000-0000-0000-0000-000000000001';

delete from public.effects
where id in (
  '60000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000002'
);

delete from public.items
where id = '50000000-0000-0000-0000-000000000001';

delete from public.province_races
where province_id in (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002'
);

delete from public.province_resources
where province_id in (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002'
);

delete from public.realm_resources
where realm_id = '20000000-0000-0000-0000-000000000001';

delete from public.provinces
where id in (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002'
);

delete from public.races
where id in (
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002'
);

delete from public.realms
where id = '20000000-0000-0000-0000-000000000001';

delete from public.resource_kinds
where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
);

-- =========================
-- 0) Utilisateur MJ (Supabase Auth + mj_admins)
-- =========================
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  reauthentication_token,
  reauthentication_sent_at,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  -- confirmed_at: colonne générée côté GoTrue (identity columns) -> ne pas renseigner
  banned_until,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user,
  is_anonymous
)
values (
  -- GoTrue local utilise l’instance "000...0"
  '00000000-0000-0000-0000-000000000000',
  '90000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'frantz.salobir@hetic.net',
  crypt('Nelva128!', gen_salt('bf')),
  now(),
  null,
  '',
  null,
  '',
  null,
  '',
  '',
  null,
  '',
  0,
  '',
  null,
  now(),
  now(),
  '',
  null,
  '',
  '',
  null,
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"MJ Frantz"}'::jsonb,
  false,
  false
);

-- Pour le provider "email", provider_id doit être l'user_id (pas l'email) pour que signInWithPassword fonctionne.
insert into auth.identities (
  id,
  user_id,
  provider,
  provider_id,
  identity_data,
  created_at,
  updated_at
)
values (
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000001',
  'email',
  '90000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'sub',
    '90000000-0000-0000-0000-000000000001',
    'email',
    'frantz.salobir@hetic.net'
  ),
  now(),
  now()
);

insert into public.mj_admins (user_id)
values ('90000000-0000-0000-0000-000000000001');

-- =========================
-- 1) Ressources (resource_kinds)
-- =========================
insert into public.resource_kinds (id, key, label_fr, unit_label_fr, decimals, is_hidden_by_default, meta)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'gold',
    'Or',
    'pièces',
    0,
    false,
    '{}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'mana',
    'Mana',
    'points',
    0,
    true,
    '{}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'prosperity',
    'Prospérité',
    'points',
    0,
    false,
    '{}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'population',
    'Population',
    'habitants',
    0,
    false,
    '{}'::jsonb
  );

-- =========================
-- 2) Royaume joueur
-- =========================
insert into public.realms (id, slug, name, player_user_id, is_npc, settings)
values (
  '20000000-0000-0000-0000-000000000001',
  'val-fleuri',
  'Duché de Val-Fleuri',
  null, -- pas encore lié à un compte joueur
  false,
  jsonb_build_object(
    'lore',
    'Un duché verdoyant niché entre collines et rivières, connu pour ses vergers et ses festivals de printemps.'
  )
);

-- =========================
-- 3) Provinces du Duché
-- =========================
insert into public.provinces (id, realm_id, name, map_ref, attrs)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Plaines de l''Aube',
    'VAL-P1',
    jsonb_build_object(
      'gold',
      120,
      'population',
      8000,
      'notes',
      'Grandes étendues de blé doré, baignées par la lumière du matin.'
    )
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Port-Argent',
    'VAL-P2',
    jsonb_build_object(
      'gold',
      300,
      'population',
      12000,
      'notes',
      'Port marchand animé, carrefours des routes maritimes.'
    )
  );

-- =========================
-- 4) Races + répartition par province
-- =========================
insert into public.races (id, key, label_fr, meta)
values
  (
    '40000000-0000-0000-0000-000000000001',
    'humans',
    'Humains',
    '{}'::jsonb
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    'elves',
    'Elfes',
    '{}'::jsonb
  );

-- Plaines de l'Aube : majorité humaine, présence elfique modérée
insert into public.province_races (province_id, race_id, share_pct, count, meta)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    80,
    6400,
    '{}'::jsonb
  ),
  (
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    20,
    1600,
    '{}'::jsonb
  );

-- Port-Argent : plus cosmopolite, mais toujours à majorité humaine
insert into public.province_races (province_id, race_id, share_pct, count, meta)
values
  (
    '30000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    70,
    8400,
    '{}'::jsonb
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    30,
    3600,
    '{}'::jsonb
  );

-- =========================
-- 5) Ressources dynamiques (stocks dérivés du contexte)
-- =========================
-- On duplique ici des informations de base pour tester les contraintes resource_kinds.

-- Ressources de provinces
insert into public.province_resources (province_id, resource_kind_id, amount)
values
  -- Plaines de l'Aube
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    120
  ),
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    8000
  ),
  -- Port-Argent
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    300
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000004',
    12000
  );

-- Trésor agrégé du Duché
insert into public.realm_resources (realm_id, resource_kind_id, amount)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    1000
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    50
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    20000
  );

-- =========================
-- 6) Item : Couronne de Majesté (trésor du Duché)
-- =========================
insert into public.items (id, realm_id, equipped_by_character_id, name, attrs, meta)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    null,
    'Couronne de Majesté',
    jsonb_build_object(
      'rarity',
      'légendaire',
      'type',
      'relique',
      'description',
      'Symbole ancestral du Duché, sertie de pierres pâles qui brillent au lever du soleil.'
    ),
    '{}'::jsonb
  );

-- =========================
-- 7) Effets actifs
-- =========================
-- Convention:
-- - Effet de multiplicateur sur la Prospérité du Royaume:
--   effect_kind = 'mult_prosperity' (→ mode product via heuristique du moteur)
--   target_subkey = 'prosperity'
-- - Effet de bonus d'Or sur Port-Argent:
--   effect_kind = 'sum_gold' (→ mode sum)
--   target_subkey = 'gold'

insert into public.effects (
  id,
  effect_kind,
  value,
  duration_kind,
  duration_remaining,
  source_label,
  created_by_user_id,
  target_type,
  target_id,
  target_subkey,
  scope,
  meta
)
values
  (
    '60000000-0000-0000-0000-000000000001',
    'mult_prosperity',
    1.2,
    'days',
    null,
    'Âge d''Or',
    null,
    'realm',
    '20000000-0000-0000-0000-000000000001',
    'prosperity',
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    'sum_gold',
    50,
    'days',
    null,
    'Port Franc',
    null,
    'province',
    '30000000-0000-0000-0000-000000000002',
    'gold',
    '{}'::jsonb,
    '{}'::jsonb
  );

commit;

