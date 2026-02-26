-- Historique des indicateurs par pays (pour afficher les variations après le cron)
CREATE TABLE public.country_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  population bigint NOT NULL DEFAULT 0,
  gdp numeric(20, 2) NOT NULL DEFAULT 0,
  militarism smallint NOT NULL DEFAULT 5,
  industry smallint NOT NULL DEFAULT 5,
  science smallint NOT NULL DEFAULT 5,
  stability smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(country_id, date)
);

CREATE INDEX idx_country_history_country_date ON public.country_history(country_id, date DESC);

ALTER TABLE public.country_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Country history: lecture publique"
  ON public.country_history FOR SELECT USING (true);

-- Écriture réservée au cron (service role) ou aux admins si besoin
CREATE POLICY "Country history: écriture admin"
  ON public.country_history FOR ALL USING (public.is_admin());

COMMENT ON TABLE public.country_history IS 'Snapshot quotidien des indicateurs (rempli par le cron) pour afficher les variations.';
