# Baseline Process Due (Phase 0)

> ⚠️ **Branche `fantasy` – Document d’héritage**
> 
> Ce document décrit la baseline de traitement des événements IA pour l’ancienne base (simulateur de nations moderne).  
> Sur `fantasy`, réutiliser la **méthodologie** (compter les événements en attente, vérifier les stuck, mesurer les runs) mais adapter les tables/colonnes au nouveau modèle (Royaumes, Provinces, Personnages).

Objectif: mesurer le comportement actuel avant migration Edge Function (ancien modèle), et servir de gabarit de monitoring pour la future version Fantasy.

## Pré-requis

- Exécuter sur un environnement de test (staging recommandé).
- Vérifier qu'il y a des lignes `accepted` dues dans `ai_event_requests`.

## Requêtes SQL de contrôle

```sql
-- Combien d'events IA acceptés sont dus et pas encore appliqués
SELECT count(*) AS pending_due
FROM public.ai_event_requests
WHERE status = 'accepted'
  AND consequences_applied_at IS NULL
  AND (scheduled_trigger_at IS NULL OR scheduled_trigger_at <= now());
```

```sql
-- Liste synthétique des événements dus (dernier état)
SELECT
  id,
  country_id,
  action_type_id,
  status,
  source,
  scheduled_trigger_at,
  processing_started_at,
  consequences_applied_at,
  created_at
FROM public.ai_event_requests
WHERE status = 'accepted'
  AND consequences_applied_at IS NULL
  AND (scheduled_trigger_at IS NULL OR scheduled_trigger_at <= now())
ORDER BY created_at DESC
LIMIT 50;
```

```sql
-- Vérification anti double-application:
-- un id ne doit exister qu'une seule fois (sanity check)
SELECT id, count(*) AS row_count
FROM public.ai_event_requests
GROUP BY id
HAVING count(*) > 1;
```

```sql
-- Vérification "stuck processing" (> 10 min)
SELECT count(*) AS stuck_processing
FROM public.ai_event_requests
WHERE status = 'accepted'
  AND consequences_applied_at IS NULL
  AND processing_started_at IS NOT NULL
  AND processing_started_at < now() - interval '10 minutes';
```

## Mesures baseline à relever (tableau)

Pour au moins 5 runs:

- timestamp du run
- `pending_due` avant
- `pending_due` après
- `processed`
- `failed`
- durée approximative du run

Sources possibles:

- endpoint `GET /api/cron/process-ai-events` (JSON de retour),
- bouton admin "Traiter les events IA dus",
- logs serveur.

## Gate 0 -> 1

Baseline validée si:

- les requêtes SQL ci-dessus sont archivées dans le repo,
- les mesures de 5 runs existent,
- on sait dire ce qui est "normal" (volume traité, erreurs habituelles).
