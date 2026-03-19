# Canary et rollback Process Due

> ⚠️ **Branche `fantasy` – Document d’héritage**
> 
> Ce runbook décrit le canary / rollback de la function `process-ai-events-due` dans le contexte de l’ancien simulateur de nations.  
> Sur `fantasy`, la logique reste valable (canary piloté par un flag, métriques `pending_due` / `stuck_processing`, rollback simple), mais doit être appliquée au nouveau pipeline d’événements Fantasy.

## Canary (Phase 3)

1. Désactiver le déclencheur externe actuel de `GET /api/cron/process-ai-events`.
2. Activer la Edge Function (`PROCESS_DUE_EDGE_ENABLED=true`).
3. Laisser tourner 24-48h.
4. Vérifier quotidiennement:
   - `pending_due` ne dérive pas,
   - pas de blocages `processing_started_at`,
   - Discord continue d'envoyer les messages attendus.

## Requêtes SQL de surveillance

```sql
SELECT count(*) AS pending_due
FROM public.ai_event_requests
WHERE status = 'accepted'
  AND consequences_applied_at IS NULL
  AND (scheduled_trigger_at IS NULL OR scheduled_trigger_at <= now());
```

```sql
SELECT count(*) AS stuck_processing
FROM public.ai_event_requests
WHERE status = 'accepted'
  AND consequences_applied_at IS NULL
  AND processing_started_at IS NOT NULL
  AND processing_started_at < now() - interval '10 minutes';
```

```sql
SELECT id, status, created_at, scheduled_trigger_at, processing_started_at, consequences_applied_at
FROM public.ai_event_requests
WHERE created_at > now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 100;
```

## Rollback immédiat (incident)

1. Mettre `PROCESS_DUE_EDGE_ENABLED=false`.
2. Réactiver le déclencheur externe de `GET /api/cron/process-ai-events`.
3. Lancer un run manuel (bouton admin) pour résorber le backlog.
4. Contrôler via les requêtes SQL.

## Critères de sortie canary

- Pas d'incident bloquant 24-48h.
- Rollback testé une fois avec succès.
- Volumes traités comparables à la baseline.
