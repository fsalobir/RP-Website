-- Bucket Storage "site-images" : images et illustrations du site (fond Recrutement, etc.).
-- Les images peuvent être uploadées via le Dashboard Supabase ou par l'app.
-- En parallèle, le projet peut utiliser des images locales dans public/images/site/.

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('site-images', 'site-images', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

-- Lecture publique
DROP POLICY IF EXISTS "Site images: lecture publique" ON storage.objects;
CREATE POLICY "Site images: lecture publique"
ON storage.objects FOR SELECT
USING (bucket_id = 'site-images');

-- Upload / update / delete réservés aux authentifiés (admins)
DROP POLICY IF EXISTS "Site images: upload authentifié" ON storage.objects;
CREATE POLICY "Site images: upload authentifié"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-images');

DROP POLICY IF EXISTS "Site images: update authentifié" ON storage.objects;
CREATE POLICY "Site images: update authentifié"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'site-images');

DROP POLICY IF EXISTS "Site images: delete authentifié" ON storage.objects;
CREATE POLICY "Site images: delete authentifié"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'site-images');
