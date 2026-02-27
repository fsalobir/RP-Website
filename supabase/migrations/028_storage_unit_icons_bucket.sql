-- Policies Storage pour les icônes d'unités (bucket public "unit-icons").
-- Créer le bucket dans Dashboard → Storage → New bucket, nom "unit-icons", cocher Public.
-- (Optionnel) Certaines configs Supabase permettent de créer le bucket en SQL :
-- INSERT INTO storage.buckets (id, name, public) VALUES ('unit-icons', 'unit-icons', true) ON CONFLICT (id) DO NOTHING;

-- Tentative de création du bucket en SQL (si autorisé dans votre projet)
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('unit-icons', 'unit-icons', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

-- Lecture publique
DROP POLICY IF EXISTS "Unit icons: lecture publique" ON storage.objects;
CREATE POLICY "Unit icons: lecture publique"
ON storage.objects FOR SELECT
USING (bucket_id = 'unit-icons');

-- Upload réservé aux utilisateurs authentifiés (admins gérés par l’app)
DROP POLICY IF EXISTS "Unit icons: upload authentifié" ON storage.objects;
CREATE POLICY "Unit icons: upload authentifié"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'unit-icons');

-- Mise à jour / suppression pour les uploads (optionnel)
DROP POLICY IF EXISTS "Unit icons: update authentifié" ON storage.objects;
CREATE POLICY "Unit icons: update authentifié"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'unit-icons');

DROP POLICY IF EXISTS "Unit icons: delete authentifié" ON storage.objects;
CREATE POLICY "Unit icons: delete authentifié"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'unit-icons');

