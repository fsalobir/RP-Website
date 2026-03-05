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

---

## Events IA : génération et déclenchement différé

### Fonction `run_ai_events_cron()`

- **Fichiers** : `migrations/085_run_ai_events_cron.sql`, puis `086_ai_events_cron_distance_and_lock.sql` (distance_modes + verrou advisory).
- **Rôle** : génère des événements IA (`ai_event_requests`) selon la config `rule_parameters.ai_events_config` (intervalle, quantités majeures/mineures, types autorisés, cibles, **modes de distance** : Voisins / Continent / Monde, auto-accept et amplitude). Ne fait **que la génération** ; elle ne traite pas les conséquences (relations, Discord, etc.), qui sont appliquées côté application par le job « Process due ». Un **verrou advisory** évite deux runs simultanés.

**Comportement** : lit `ai_events_last_run` et `ai_events_config` ; si l’intervalle (en heures) est écoulé, tire aléatoirement des émetteurs (pays IA majeur/mineur), des types d’action et des cibles (union des modes distance : voisins via `map_region_neighbors`, même continent, ou monde), insère les lignes. Pour les types en auto-accept, génère des `dice_results` et définit `scheduled_trigger_at` ; met à jour `ai_events_last_run` en fin de run réussi. Tout en UTC.

### Job « Process due AI events » (côté application)

L’**application des conséquences** (relations, influence, effets, Discord) ne peut pas s’exécuter en pur SQL ; elle doit tourner dans l’app (client Supabase + envoi Discord).

- **Route** : `GET /api/cron/process-ai-events` (voir `src/app/api/cron/process-ai-events/route.ts`).
- **Protection** : en-tête `x-cron-secret` ou query `secret` doit être égal à la variable d’environnement **`CRON_SECRET`**.
- **Comportement** : sélectionne les `ai_event_requests` avec `status = 'accepted'`, `consequences_applied_at IS NULL`, (`scheduled_trigger_at IS NULL` ou `scheduled_trigger_at <= now()`), et (**`processing_started_at` NULL** ou **&lt; now − 10 min**, pour retry des lignes bloquées), **au plus 50 lignes par invocation** (LIMIT 50). Pour chaque ligne, la route **réserve** d’abord (UPDATE `processing_started_at = now()` si la ligne est encore réservable), puis applique les conséquences et met à jour `consequences_applied_at`. En cas de backlog, lancer le cron toutes les 5–10 min. La réponse JSON inclut `processed`, `failed`, `total` et un tableau `errors` (id + message) pour les lignes en échec.

**À planifier** : un cron **externe** (ex. cron-job.org, toutes les 5–10 min) qui appelle cette URL avec le secret.

**Réservation** : le champ `processing_started_at` (migration 088) évite le double traitement si deux appels se chevauchent : une ligne n’est traitée que si l’UPDATE de réservation retourne une ligne. Après 10 min sans `consequences_applied_at`, une ligne reste re-sélectionnable (retry).

### Option A – Génération par pg_cron

1. Activer **pg_cron** (Database → Extensions).
2. Planifier la génération (ex. toutes les heures) :
   ```sql
   SELECT cron.schedule(
     'ai-events-generation',
     '0 * * * *',
     $$SELECT public.run_ai_events_cron()$$
   );
   ```
3. Séparément, faire appeler **`GET /api/cron/process-ai-events`** par un cron externe (toutes les 5–10 min) avec `CRON_SECRET`.

### Option B – Tout côté application (repli)

Sans pg_cron : un **seul** cron externe (ex. toutes les 15 min) qui :
1. Appelle `GET /api/cron/process-ai-events` (Process due),
2. Puis appelle une route ou RPC qui exécute `run_ai_events_cron()` (génération), ou réimplémente la génération en TypeScript.

Documenter la procédure retenue dans ce fichier ou en commentaire de la route.

---

## Voisinage des régions (Events IA – distance « Voisins »)

La table `map_region_neighbors` est remplie par la fonction **`compute_map_region_neighbors()`** (PostGIS, voir `migrations/084_ai_events_schema.sql`). Elle est utilisée par le cron Events IA pour le mode de distance « Voisins ».

**Dépendance PostGIS** : l’extension PostGIS doit être activée (migration 084) pour que le mode « Voisins » et le recalcul des voisinages fonctionnent. Si des erreurs « permission denied » apparaissent lors de l’appel RPC depuis l’app, ajouter en migration : `GRANT EXECUTE ON FUNCTION public.compute_map_region_neighbors() TO authenticated;` (ou au rôle utilisé par l’app).

**Après toute modification des géométries** dans `map_regions` (édition des formes sur la carte, import, etc.), il faut **recalculer les voisinages** pour que le mode « Voisins » reste cohérent : utiliser le bouton admin « Recalculer les voisinages » (page Carte ou Règles) qui appelle la RPC `compute_map_region_neighbors`, ou exécuter en SQL : `SELECT public.compute_map_region_neighbors();`

---

## Format de `ai_events_last_run`

La clé `rule_parameters.ai_events_last_run` stocke la date du dernier passage du cron Events IA. **Format attendu** : valeur JSONB contenant une chaîne timestamp UTC (ex. `to_jsonb(now()::timestamptz::text)`). La lecture côté SQL se fait avec `(value #>> '{}')::timestamptz`. Ne pas écrire un nombre (epoch) ou un autre format, sous peine d’erreur de cast ou d’interprétation incorrecte.
