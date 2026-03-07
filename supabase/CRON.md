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

**Organisation recommandée** : le passage de jour tourne **automatiquement côté Supabase** grâce à **pg_cron** : tous les jours à 6h00 UTC, le job appelle `run_daily_country_update()` et fait avancer la date du monde + snapshot + mise à jour des pays.

### Jobs créés par la migration 089

La migration **`089_schedule_pg_cron_jobs.sql`** crée les jobs pg_cron au moment du `supabase db push` :

- **`daily-country-update`** : tous les jours à 6h00 UTC (`0 6 * * *`) → `run_daily_country_update()`
- **`ai-events-generation`** : toutes les heures (`0 * * * *`) → `run_ai_events_cron()` (voir section Events IA)

**Prérequis** : activer l’extension **pg_cron** dans Supabase (**Database** → **Extensions**) **avant** d’exécuter les migrations (ou avant le premier `db push` incluant la 089). Sinon la migration 089 échouera ; activer pg_cron puis relancer le push.

**Vérifier que les jobs existent** (Supabase → SQL Editor) :
```sql
SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname IN ('daily-country-update', 'ai-events-generation');
```
- Aucune ligne : soit pg_cron n’est pas activé, soit la migration 089 n’a pas encore été appliquée.
- Jobs présents : le passage de jour et la génération events IA sont planifiés.

### Option B – Exécution manuelle

Quand tu veux lancer un passage (test ou sans cron) :

- **SQL Editor** → New query → exécute :
  ```sql
  SELECT public.run_daily_country_update();
  ```

### Option C – Cron externe (repli si pg_cron indisponible)

Si ton plan Supabase n’a pas pg_cron, une **route API** permet de déclencher le passage de jour depuis l’extérieur :

- **URL** : `GET /api/cron/daily-country-update`
- **Protection** : en-tête `x-cron-secret` ou paramètre `?secret=...` égal à **`CRON_SECRET`**.
- Planifier avec [cron-job.org](https://cron-job.org) ou équivalent : appeler cette URL **une fois par jour** (ex. 6h00 UTC).

**En attendant** (ou pour un passage ponctuel) : **Admin → Pays** → bouton **« Passer jour »**.

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

**À planifier** : un cron **externe** (ex. cron-job.org, toutes les 5–10 min) qui appelle cette URL avec le secret. **Sans cet appel**, les events IA acceptés avec « Planifier avec amplitude » (déclenchement différé) ne verront jamais leurs conséquences appliquées ni la publication Discord. En attendant, l’admin peut utiliser le bouton **« Traiter les events IA dus »** sur la page Event IA pour lancer le traitement manuellement.

**Réservation** : le champ `processing_started_at` (migration 088) évite le double traitement si deux appels se chevauchent : une ligne n’est traitée que si l’UPDATE de réservation retourne une ligne. Après 10 min sans `consequences_applied_at`, une ligne reste re-sélectionnable (retry).

### Route « Génération » (recommandée si pas de pg_cron)

- **URL** : `GET /api/cron/generate-ai-events` (même protection `CRON_SECRET` que Process due).
- **Rôle** : appelle la RPC `run_ai_events_cron()` en base. La fonction décide selon `interval_hours` et `ai_events_last_run` si elle génère des events (elle peut ne rien insérer si l’intervalle n’est pas écoulé).
- **À planifier** : même cron externe que Process due, ou un tick dédié (ex. toutes les heures). Ordre conseillé : 1) `generate-ai-events`, 2) `process-ai-events`.

### Génération par pg_cron (Supabase)

Si **pg_cron** est activé, le job **`ai-events-generation`** est créé par la **migration 089** (toutes les heures). La fonction `run_ai_events_cron()` décide selon `interval_hours` et `ai_events_last_run` si elle génère des events. Séparément, faire appeler **`GET /api/cron/process-ai-events`** par un cron externe (toutes les 5–10 min) avec `CRON_SECRET` pour appliquer les conséquences.

### Option B – Tout côté application (sans pg_cron)

Un **seul** cron externe (ex. toutes les 15 min ou 1 h) qui appelle dans l’ordre :
1. **`GET /api/cron/generate-ai-events`** (génération, avec `CRON_SECRET`),
2. **`GET /api/cron/process-ai-events`** (Process due, même secret).

### Pourquoi aucun event n’est généré ?

Si la génération est bien appelée (route ou pg_cron) mais qu’aucun event n’apparaît, vérifier dans **Admin → Règles → Intelligence artificielle** :

- **Intervalle (heures)** : > 0. Si l’intervalle n’est pas encore écoulé depuis le dernier run, la fonction sort sans rien faire.
- **Actions IA majeures / mineures par passage** : au moins un des deux > 0.
- **Actions autorisées** : au moins un type coché pour les IA majeures et/ou mineures (selon les quantités).
- **Cibles autorisées** : au moins une case (IA majeures, IA mineures ou Joueurs). Sinon aucun pays n’est éligible comme cible.
- **Pays IA** : au moins un pays avec **Statut IA = Majeur** ou **Mineur** (liste Admin → Pays). Les pays « Joué » ne comptent pas comme IA.
- **Dernier run** : en base, `rule_parameters.ai_events_last_run` peut être récent ; pour forcer un run de test, mettre la valeur à une date ancienne (ou supprimer la clé) puis rappeler la génération.

---

## Voisinage des régions (Events IA – distance « Voisins »)

La table `map_region_neighbors` est remplie par la fonction **`compute_map_region_neighbors()`** (PostGIS, voir `migrations/084_ai_events_schema.sql`). Elle est utilisée par le cron Events IA pour le mode de distance « Voisins ».

**Dépendance PostGIS** : l’extension PostGIS doit être activée (migration 084) pour que le mode « Voisins » et le recalcul des voisinages fonctionnent. Si des erreurs « permission denied » apparaissent lors de l’appel RPC depuis l’app, ajouter en migration : `GRANT EXECUTE ON FUNCTION public.compute_map_region_neighbors() TO authenticated;` (ou au rôle utilisé par l’app).

**Après toute modification des géométries** dans `map_regions` (édition des formes sur la carte, import, etc.), il faut **recalculer les voisinages** pour que le mode « Voisins » reste cohérent : utiliser le bouton admin « Recalculer les voisinages » (page Carte ou Règles) qui appelle la RPC `compute_map_region_neighbors`, ou exécuter en SQL : `SELECT public.compute_map_region_neighbors();`

---

## Format de `ai_events_last_run`

La clé `rule_parameters.ai_events_last_run` stocke la date du dernier passage du cron Events IA. **Format attendu** : valeur JSONB contenant une chaîne timestamp UTC (ex. `to_jsonb(now()::timestamptz::text)`). La lecture côté SQL se fait avec `(value #>> '{}')::timestamptz`. Ne pas écrire un nombre (epoch) ou un autre format, sous peine d’erreur de cast ou d’interprétation incorrecte.
