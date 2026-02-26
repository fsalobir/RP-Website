# Supabase – Nation Simulator

## Première installation

1. **Exécuter les migrations**  
   Dans le projet Supabase, **SQL Editor** → New query → exécuter dans l’ordre :
   - `migrations/001_initial_schema.sql`
   - `migrations/003_country_history.sql` (historique pour afficher les variations sur la liste des pays)
   - `migrations/005_cron_daily_snapshot_and_update.sql` (fonction du cron quotidien ; voir `CRON.md` pour où et comment la lancer)

2. **Activer l’auth par email**  
   **Authentication** → **Providers** → Email : activer "Enable Email provider".

3. **Bucket Storage pour les drapeaux (optionnel)**  
   **Storage** → **New bucket** → nom `flags`, cocher **Public**. Puis dans **SQL Editor**, exécuter le contenu de `migrations/002_storage_flags_bucket.sql` pour activer les politiques (lecture publique, upload pour les utilisateurs connectés).

4. **Créer le premier admin**  
   - Lancer l’app et aller sur `/admin/connexion`.
   - S’inscrire avec l’email et le mot de passe choisis pour l’admin.
   - Puis dans **SQL Editor** exécuter (en remplaçant l’email par le vôtre) :
   ```sql
   INSERT INTO public.admins (user_id)
   SELECT id FROM auth.users WHERE email = 'VOTRE_EMAIL@exemple.net'
   ON CONFLICT (user_id) DO NOTHING;
   ```

Après ça, la connexion admin et l’accès aux pages protégées fonctionneront.
