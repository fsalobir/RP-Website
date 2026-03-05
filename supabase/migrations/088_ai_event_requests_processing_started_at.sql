-- Process due : champ de réservation pour éviter le double traitement (appels parallèles ou retry).

ALTER TABLE public.ai_event_requests
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

COMMENT ON COLUMN public.ai_event_requests.processing_started_at IS 'Début du traitement des conséquences (réservation). NULL = jamais pris en charge ; si non NULL et consequences_applied_at NULL, une ligne « en cours » peut être re-sélectionnée après timeout (ex. 10 min).';
