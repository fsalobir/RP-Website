-- Nouvelles actions d'état : statuts pending_target/target_refused, colonne target_country_id, RLS cible, seed des 7 types.

-- 1. Étendre le CHECK status
ALTER TABLE public.state_action_requests
  DROP CONSTRAINT IF EXISTS state_action_requests_status_check;

ALTER TABLE public.state_action_requests
  ADD CONSTRAINT state_action_requests_status_check
  CHECK (status IN ('pending', 'accepted', 'refused', 'pending_target', 'target_refused'));

COMMENT ON COLUMN public.state_action_requests.status IS 'pending=admin, pending_target=attente cible, target_refused=refusé par la cible, accepted/refused=finalisé.';

-- 2. Colonne target_country_id (dénormalisée pour RLS et index)
ALTER TABLE public.state_action_requests
  ADD COLUMN IF NOT EXISTS target_country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_state_action_requests_target_country
  ON public.state_action_requests(target_country_id)
  WHERE target_country_id IS NOT NULL;

COMMENT ON COLUMN public.state_action_requests.target_country_id IS 'Pays cible (dénormalisé depuis payload pour RLS). Rempli à l''insert si payload.target_country_id présent.';

-- Backfill target_country_id depuis payload pour les lignes existantes
UPDATE public.state_action_requests
SET target_country_id = (payload->>'target_country_id')::uuid
WHERE target_country_id IS NULL
  AND payload ? 'target_country_id'
  AND (payload->>'target_country_id')::uuid IS NOT NULL;

-- 3. RLS : joueur cible peut SELECT et UPDATE les demandes le ciblant en pending_target
CREATE POLICY "State action requests: lecture joueur cible (pending_target)"
  ON public.state_action_requests FOR SELECT
  USING (
    status = 'pending_target'
    AND target_country_id = (SELECT country_id FROM public.country_players WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "State action requests: update joueur cible (accepter/refuser)"
  ON public.state_action_requests FOR UPDATE
  USING (
    status = 'pending_target'
    AND target_country_id = (SELECT country_id FROM public.country_players WHERE user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    status IN ('pending', 'target_refused')
    AND target_country_id = (SELECT country_id FROM public.country_players WHERE user_id = auth.uid() LIMIT 1)
  );

-- 4. Seed des 7 nouveaux types
INSERT INTO public.state_action_types (key, label_fr, cost, params_schema, sort_order) VALUES
  ('accord_commercial_politique', 'Accord commercial ou politique', 1, '{"requires_target_acceptance": true}'::jsonb, 70),
  ('cooperation_militaire', 'Coopération militaire', 1, '{"requires_target_acceptance": true}'::jsonb, 71),
  ('alliance', 'Alliance', 1, '{"requires_target_acceptance": true}'::jsonb, 72),
  ('espionnage', 'Espionnage', 2, '{}'::jsonb, 73),
  ('sabotage', 'Sabotage', 2, '{}'::jsonb, 74),
  ('effort_fortifications', 'Effort de fortifications', 3, '{}'::jsonb, 75),
  ('investissements', 'Investissements', 1, '{}'::jsonb, 76)
ON CONFLICT (key) DO NOTHING;
