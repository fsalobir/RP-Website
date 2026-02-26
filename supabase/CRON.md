# Où mettre la logique du cron dans Supabase

La logique quotidienne (snapshot + mise à jour des pays) est dans **`migrations/005_cron_daily_snapshot_and_update.sql`**.

---

## 1. Créer la fonction dans la base

1. Ouvre ton projet sur [supabase.com](https://supabase.com).
2. Va dans **SQL Editor** → **New query**.
3. Copie-colle **tout** le contenu du fichier `supabase/migrations/005_cron_daily_snapshot_and_update.sql`.
4. Clique sur **Run**.

La fonction `public.run_daily_country_update()` est maintenant créée. Elle fait :
- un snapshot des valeurs actuelles de chaque pays dans `country_history` (date = aujourd’hui),
- puis la mise à jour de `countries` (population, PIB, etc.) selon `rule_parameters`.

---

## 2. Faire tourner cette logique

### Option A – Planifier avec pg_cron (si disponible sur ton plan)

1. **Database** → **Extensions** → active **pg_cron** si ce n’est pas déjà fait.
2. Dans **SQL Editor**, exécute :
   ```sql
   SELECT cron.schedule(
     'daily-country-update',
     '0 6 * * *',
     $$SELECT public.run_daily_country_update()$$
   );
   ```
   → La fonction s’exécutera **tous les jours à 6h00 UTC**.

### Option B – Exécution manuelle

Quand tu veux lancer un passage (test ou sans cron) :

- **SQL Editor** → New query → exécute :
  ```sql
  SELECT public.run_daily_country_update();
  ```

### Option C – Cron externe (sans pg_cron)

Si ton plan n’a pas pg_cron : créer une **Edge Function** Supabase qui appelle cette logique (avec la clé service_role), la déployer, puis utiliser un service (ex. [cron-job.org](https://cron-job.org)) pour appeler l’URL de la fonction une fois par jour. Voir la doc Supabase sur les Edge Functions.
