-- Statut IA pour les pays non assignés à un joueur : Pays IA Majeur / Mineur (éditable par l'admin).

ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS ai_status text
  CHECK (ai_status IS NULL OR ai_status IN ('major', 'minor'));

COMMENT ON COLUMN public.countries.ai_status IS 'Pays IA Majeur (major) ou Mineur (minor) pour les pays sans joueur assigné. Null = pas un pays IA.';
