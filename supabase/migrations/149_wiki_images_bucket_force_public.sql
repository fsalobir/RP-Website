-- S’assure que le bucket wiki-images est bien public (sinon les URLs /object/public/… ne servent pas les fichiers).
-- Si le bucket avait été créé ailleurs en privé, ON CONFLICT DO NOTHING dans 146 n’aurait pas corrigé le flag.

UPDATE storage.buckets
SET public = true
WHERE id = 'wiki-images';
