-- Bucket Storage "avantages" : un seul dossier pour regrouper les fichiers (icônes des avantages).
-- Créer le bucket dans Dashboard → Storage si besoin, nom "avantages", Public.

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('avantages', 'avantages', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

-- Lecture publique
DROP POLICY IF EXISTS "Avantages: lecture publique" ON storage.objects;
CREATE POLICY "Avantages: lecture publique"
ON storage.objects FOR SELECT
USING (bucket_id = 'avantages');

-- Upload / update / delete réservés aux authentifiés (admins gérés par l'app)
DROP POLICY IF EXISTS "Avantages: upload authentifié" ON storage.objects;
CREATE POLICY "Avantages: upload authentifié"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avantages');

DROP POLICY IF EXISTS "Avantages: update authentifié" ON storage.objects;
CREATE POLICY "Avantages: update authentifié"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avantages');

DROP POLICY IF EXISTS "Avantages: delete authentifié" ON storage.objects;
CREATE POLICY "Avantages: delete authentifié"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avantages');

-- Taille d'affichage de l'icône (côté carré, en pixels)
ALTER TABLE public.perks
  ADD COLUMN IF NOT EXISTS icon_size smallint DEFAULT 48 CHECK (icon_size IS NULL OR (icon_size >= 16 AND icon_size <= 256));

COMMENT ON COLUMN public.perks.icon_size IS 'Taille d''affichage de l''icône en pixels (carré). Par défaut 48.';
