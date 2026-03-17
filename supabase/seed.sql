-- Seed minimal, déterministe et ciblable par ID fixes (Supabase local / CI).
-- Objectif: fournir un état initial stable pour tests Playwright/API et pour éviter les crashes au rendu Next.js.
-- IMPORTANT: ne crée pas de schéma (migrations uniquement). Ce seed suppose que toutes les migrations sont appliquées.

BEGIN;

-- ========== IDs FIXES (ne pas changer sans raison) ==========
-- Users
-- - admin:  aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- - player: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- Countries
-- - Alpha:  11111111-1111-1111-1111-111111111111
-- - Bravo:  22222222-2222-2222-2222-222222222222
-- Military roster unit (seed): 99999999-9999-9999-9999-999999999999

-- ========== 0) Nettoyage idempotent (ordre FK) ==========
DELETE FROM public.admins WHERE user_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM public.country_players WHERE user_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

DELETE FROM public.country_military_units WHERE country_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
DELETE FROM public.military_roster_unit_levels WHERE unit_id = '99999999-9999-9999-9999-999999999999';
DELETE FROM public.military_roster_units WHERE id = '99999999-9999-9999-9999-999999999999';

DELETE FROM public.country_effects
WHERE name LIKE 'Seed test:%'
  AND country_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

DELETE FROM public.country_budget WHERE country_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
DELETE FROM public.countries WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- Auth rows (on supprime à la fin pour éviter de casser les FK pendant le nettoyage)
DELETE FROM auth.identities WHERE user_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM auth.users WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- ========== 1) Utilisateurs de test (auth.users + auth.identities) ==========
-- Note: Supabase local utilise pgcrypto (crypt/gen_salt). Si indisponible, adapter en CI.
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'authenticated',
    'authenticated',
    'admin@test.local',
    crypt('password', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Admin Test"}'::jsonb,
    false
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'authenticated',
    'authenticated',
    'player@test.local',
    crypt('password', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Player Test"}'::jsonb,
    false
  );

INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
VALUES
  (
    'aaaaaaaa-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'email',
    'admin@test.local',
    jsonb_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'email', 'admin@test.local'),
    now(),
    now()
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'email',
    'player@test.local',
    jsonb_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'email', 'player@test.local'),
    now(),
    now()
  );

-- Admin list (public.admins)
INSERT INTO public.admins (id, user_id)
VALUES ('aaaaaaaa-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- ========== 2) Règles minimales vitales (rule_parameters) ==========
-- IMPORTANT: certaines routes/cron lisent directement ces clés.
INSERT INTO public.rule_parameters (key, value, description)
VALUES
  (
    'global_growth_effects',
    '[
      { "effect_kind": "population_growth_base", "effect_target": null, "value": 0.0010 },
      { "effect_kind": "gdp_growth_base", "effect_target": null, "value": 0.0005 }
    ]'::jsonb,
    'Seed test: croissance globale minimale'
  ),
  (
    'influence_config',
    '{
      "mult_gdp": 0.000000001,
      "mult_population": 0.0000001,
      "mult_military": 0.01,
      "stability_modifier_min": 0.8,
      "stability_modifier_max": 1.2,
      "gravity_pct_gdp": 50,
      "gravity_pct_population": 50,
      "gravity_pct_military": 50
    }'::jsonb,
    'Seed test: config influence'
  ),
  (
    'sphere_influence_pct',
    '{ "contested": 25, "occupied": 50, "annexed": 100 }'::jsonb,
    'Seed test: % influence sphère'
  ),
  (
    'world_date',
    '{ "month": 1, "year": 2026 }'::jsonb,
    'Seed test: date du monde'
  ),
  (
    'world_date_advance_months',
    '1'::jsonb,
    'Seed test: avance mois par tick'
  ),
  (
    'cron_paused',
    'true'::jsonb,
    'Seed test: cron en pause (tests déterministes)'
  ),
  (
    'stats_dice_modifier_ranges',
    '{
      "militarism": { "min": -5, "max": 5 },
      "industry": { "min": -5, "max": 5 },
      "science": { "min": -5, "max": 5 },
      "stability": { "min": -5, "max": 5 }
    }'::jsonb,
    'Seed test: ranges jets de dés'
  ),
  (
    'ideology_config',
    '{
      "daily_step": 0.18,
      "neighbor_pull_weight": 0.8,
      "relation_pull_weight": 0.35,
      "influence_pull_weight": 0.45,
      "control_pull_weight": 1.1,
      "effect_pull_weight": 1.0,
      "snap_strength": 16
    }'::jsonb,
    'Seed test: config idéologie'
  ),
  (
    'ideology_effects',
    '[]'::jsonb,
    'Seed test: effets proportionnels à l’idéologie'
  ),
  -- Budget ministères (valeurs minimales; l'app a des defaults si absent, mais l'admin est plus stable si présent)
  (
    'budget_defense',
    '{ "min_pct": 5, "gravity_pct": 50, "effects": [ { "effect_type": "militarism", "bonus": 0.10, "malus": -0.05, "gravity_applies": true } ] }'::jsonb,
    'Seed test: budget défense'
  ),
  (
    'budget_infrastructure',
    '{ "min_pct": 5, "gravity_pct": 50, "effects": [ { "effect_type": "gdp", "bonus": 0.05, "malus": -0.02, "gravity_applies": false } ] }'::jsonb,
    'Seed test: budget infrastructure'
  ),
  (
    'budget_sante',
    '{ "min_pct": 5, "gravity_pct": 50, "effects": [ { "effect_type": "population", "bonus": 0.001, "malus": -0.001, "gravity_applies": false } ] }'::jsonb,
    'Seed test: budget santé'
  )
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();

-- ========== 3) Pays minimaux (countries) ==========
INSERT INTO public.countries (
  id,
  name,
  slug,
  regime,
  flag_url,
  population,
  gdp,
  militarism,
  industry,
  science,
  stability,
  ideology_germanic_monarchy,
  ideology_merina_monarchy,
  ideology_french_republicanism,
  ideology_mughal_republicanism,
  ideology_nilotique_cultism,
  ideology_satoiste_cultism
)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Alpha',
    'alpha',
    'République',
    NULL,
    10000000,
    500000000000.00,
    6,
    6,
    6,
    1,
    40.0000, 0.0000, 0.0000, 10.0000, 30.0000, 20.0000
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Bravo',
    'bravo',
    'Monarchie',
    NULL,
    20000000,
    300000000000.00,
    4,
    5,
    5,
    0,
    10.0000, 30.0000, 20.0000, 0.0000, 0.0000, 40.0000
  );

-- Joueur assigné à un pays (public.country_players)
INSERT INTO public.country_players (user_id, country_id, email)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'player@test.local');

-- ========== 4) Budget minimal (country_budget) ==========
-- 5% par ministère (pas de malus par défaut), somme <= 100.
INSERT INTO public.country_budget (
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
VALUES
  ('11111111-1111-1111-1111-111111111111', 0.10, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5),
  ('22222222-2222-2222-2222-222222222222', 0.10, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5);

-- ========== 5) Données liées /pays/[slug] (militaire + effets actifs) ==========
-- Unité roster seed (ID fixe) + niveaux + affectation à un pays.
INSERT INTO public.military_roster_units (id, branch, sub_type, name_fr, level_count, base_count, sort_order)
VALUES ('99999999-9999-9999-9999-999999999999', 'terre', 'Infanterie', 'Fusiliers (Seed)', 3, 10, 1);

INSERT INTO public.military_roster_unit_levels (unit_id, level, manpower, hard_power)
VALUES
  ('99999999-9999-9999-9999-999999999999', 1, 100, 1),
  ('99999999-9999-9999-9999-999999999999', 2, 200, 3),
  ('99999999-9999-9999-9999-999999999999', 3, 300, 5);

INSERT INTO public.country_military_units (country_id, roster_unit_id, current_level, extra_count)
VALUES
  ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 200, 2);

-- Effets actifs minimaux (pour valider rendu "effets actifs")
INSERT INTO public.country_effects (
  country_id,
  name,
  effect_kind,
  effect_target,
  effect_subtype,
  value,
  duration_kind,
  duration_remaining
)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Seed test: Croissance PIB', 'gdp_growth_base', NULL, NULL, 0.0010, 'days', 30),
  ('22222222-2222-2222-2222-222222222222', 'Seed test: Stabilité', 'stat_delta', 'stability', NULL, 0.10, 'days', 30);

COMMIT;
