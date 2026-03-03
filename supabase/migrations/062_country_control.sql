-- Contrôle d'un pays par d'autres (parts, annexion). Utilisé pour Sphère et statuts Souverain / Contesté / Occupé / Annexé.

CREATE TABLE public.country_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  controller_country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  share_pct numeric NOT NULL CHECK (share_pct >= 0 AND share_pct <= 100),
  is_annexed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT country_control_no_self CHECK (country_id != controller_country_id),
  CONSTRAINT country_control_unique_controller UNIQUE (country_id, controller_country_id)
);

CREATE INDEX idx_country_control_country ON public.country_control(country_id);
CREATE INDEX idx_country_control_controller ON public.country_control(controller_country_id);

ALTER TABLE public.country_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "country_control_select" ON public.country_control FOR SELECT USING (true);
CREATE POLICY "country_control_admin" ON public.country_control FOR ALL USING (public.is_admin());

CREATE TRIGGER country_control_updated_at
  BEFORE UPDATE ON public.country_control
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON TABLE public.country_control IS 'Parts de contrôle d''un pays par d''autres (sphère). country_id = pays contrôlé, controller_country_id = pays qui détient la part. is_annexed = annexion.';
