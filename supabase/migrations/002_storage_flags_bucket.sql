-- Bucket pour les drapeaux (upload admin).
-- Si le bucket n’existe pas encore : le créer dans Dashboard → Storage → New bucket,
-- nom "flags", cocher Public. Puis exécuter ce fichier pour les politiques uniquement.
-- Sinon, décommenter et adapter l’INSERT ci‑dessous si votre Supabase permet de créer le bucket en SQL :
-- INSERT INTO storage.buckets (id, name, public) VALUES ('flags', 'flags', true) ON CONFLICT (id) DO NOTHING;

-- Lecture publique des drapeaux
CREATE POLICY "Flags: lecture publique"
ON storage.objects FOR SELECT
USING (bucket_id = 'flags');

-- Upload réservé aux utilisateurs authentifiés (admins gérés par l’app)
CREATE POLICY "Flags: upload authentifié"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'flags');

-- Mise à jour / suppression pour les uploads (optionnel)
CREATE POLICY "Flags: update authentifié"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'flags');

CREATE POLICY "Flags: delete authentifié"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'flags');
