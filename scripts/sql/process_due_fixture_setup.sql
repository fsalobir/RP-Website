-- Fixture de parité "process due" (Option A)
-- Usage: exécuter en staging/test uniquement.
-- Tag de nettoyage: payload.test_tag = 'process_due_parity'

WITH countries_pair AS (
  SELECT
    c1.id AS emitter_id,
    c2.id AS target_id
  FROM public.countries c1
  JOIN public.countries c2 ON c2.id <> c1.id
  ORDER BY c1.created_at ASC, c2.created_at ASC
  LIMIT 1
),
action_keys AS (
  SELECT unnest(ARRAY[
    'insulte_diplomatique',
    'ouverture_diplomatique',
    'prise_influence',
    'escarmouche_militaire',
    'conflit_arme',
    'guerre_ouverte',
    'espionnage',
    'demande_up'
  ]) AS key
),
types AS (
  SELECT sat.id AS action_type_id, sat.key
  FROM public.state_action_types sat
  JOIN action_keys k ON k.key = sat.key
),
rows_to_insert AS (
  SELECT
    cp.emitter_id AS country_id,
    t.action_type_id,
    'accepted'::text AS status,
    jsonb_build_object(
      'target_country_id', cp.target_id,
      'test_tag', 'process_due_parity'
    ) AS payload,
    now() - interval '2 minutes' AS scheduled_trigger_at,
    'manual'::text AS source
  FROM countries_pair cp
  CROSS JOIN types t
)
INSERT INTO public.ai_event_requests (
  country_id,
  action_type_id,
  status,
  payload,
  scheduled_trigger_at,
  source
)
SELECT
  country_id,
  action_type_id,
  status,
  payload,
  scheduled_trigger_at,
  source
FROM rows_to_insert;
