-- Actions d'État : types d'actions, solde par pays, demandes (tickets).

-- Types d'actions (admin définit coûts et paramètres)
CREATE TABLE public.state_action_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label_fr text NOT NULL,
  cost integer NOT NULL CHECK (cost >= 0) DEFAULT 1,
  params_schema jsonb DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_state_action_types_sort ON public.state_action_types(sort_order);

COMMENT ON TABLE public.state_action_types IS 'Types d''actions d''État (Insulte diplomatique, Prise d''influence, Demande d''up, etc.). Coûts et paramètres par type.';

ALTER TABLE public.state_action_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "State action types: lecture publique"
  ON public.state_action_types FOR SELECT USING (true);

CREATE POLICY "State action types: écriture admin"
  ON public.state_action_types FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

CREATE TRIGGER state_action_types_updated_at
  BEFORE UPDATE ON public.state_action_types
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Solde d'actions d'État par pays
CREATE TABLE public.country_state_action_balance (
  country_id uuid PRIMARY KEY REFERENCES public.countries(id) ON DELETE CASCADE,
  balance integer NOT NULL CHECK (balance >= 0) DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.country_state_action_balance IS 'Solde d''actions d''État par pays. Débit à la création d''une demande, crédit par effet state_actions_grant (cron) ou remboursement refus.';

ALTER TABLE public.country_state_action_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Country state action balance: lecture joueur (son pays)"
  ON public.country_state_action_balance FOR SELECT
  USING (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "Country state action balance: écriture admin"
  ON public.country_state_action_balance FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

CREATE POLICY "Country state action balance: update par joueur (son pays)"
  ON public.country_state_action_balance FOR UPDATE
  USING (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );

-- Insert autorisé uniquement avec balance = 0 (création à la première demande)
CREATE POLICY "Country state action balance: insert joueur (son pays, balance 0)"
  ON public.country_state_action_balance FOR INSERT
  WITH CHECK (
    balance = 0
    AND country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );

CREATE TRIGGER country_state_action_balance_updated_at
  BEFORE UPDATE ON public.country_state_action_balance
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Demandes (tickets) : une ligne par action d'État soumise par un joueur
CREATE TABLE public.state_action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type_id uuid NOT NULL REFERENCES public.state_action_types(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'refused')) DEFAULT 'pending',
  payload jsonb DEFAULT '{}',
  admin_effect_added jsonb,
  refund_actions boolean DEFAULT false,
  refusal_message text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_state_action_requests_country ON public.state_action_requests(country_id);
CREATE INDEX idx_state_action_requests_created ON public.state_action_requests(created_at DESC);
CREATE INDEX idx_state_action_requests_status ON public.state_action_requests(status);

COMMENT ON TABLE public.state_action_requests IS 'Demandes d''actions d''État (tickets). pending → admin accepte ou refuse. admin_effect_added appliqué à l''acceptation.';

ALTER TABLE public.state_action_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "State action requests: lecture joueur (ses demandes)"
  ON public.state_action_requests FOR SELECT
  USING (
    country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "State action requests: insert joueur (son pays)"
  ON public.state_action_requests FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid())
    AND country_id IN (SELECT country_id FROM public.country_players WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "State action requests: lecture et mise à jour admin"
  ON public.state_action_requests FOR ALL USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));

-- Seed des 3 types initiaux
INSERT INTO public.state_action_types (key, label_fr, cost, params_schema, sort_order) VALUES
  ('insulte_diplomatique', 'Insulte Diplomatique', 1, '{"relation_delta": -10}'::jsonb, 10),
  ('prise_influence', 'Prise d''Influence', 1, '{}'::jsonb, 20),
  ('demande_up', 'Demande d''Up', 1, '{}'::jsonb, 30);
