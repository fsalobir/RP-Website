# Cron Supabase: configuration et debug

## Référence de ce projet

Le déclenchement automatique se fait côté **Supabase** via **pg_cron**.

- Passage de jour: `public.run_daily_country_update()`
- Génération des events IA: `public.run_ai_events_cron()`
- Traitement des events IA dus: `public.invoke_process_ai_events_due_edge()` (appelle la Edge Function `process-ai-events-due`)

Les routes `/api/cron/...` sont des outils de secours/debug (ou pour un déclencheur HTTP externe), pas la source principale.

---

## Prérequis

1. Activer l'extension `pg_cron` dans Supabase (Database -> Extensions).
2. Activer l'extension `pg_net` (si non activée automatiquement par migration).
3. Appliquer les migrations (dont `089_schedule_pg_cron_jobs.sql` et `115_schedule_process_due_edge_function.sql`).
4. Déployer la Edge Function `process-ai-events-due`.
5. Configurer les secrets de la function:
   - `PROCESS_DUE_EDGE_ENABLED` (`false` au départ, puis `true` en canary/production),
   - `PROCESS_DUE_EDGE_SECRET` (même valeur que `rule_parameters.process_due_edge_secret`),
   - `DISCORD_BOT_TOKEN`,
   - `NEXT_PUBLIC_SUPABASE_URL`,
   - `SUPABASE_SERVICE_ROLE_KEY`.

---

## Jobs attendus en base

Vérifier dans SQL Editor:

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname in ('daily-country-update', 'ai-events-generation', 'process-ai-events-due-edge')
order by jobname;
```

Tu dois voir:

- `daily-country-update` -> `0 6 * * *`
- `ai-events-generation` -> `0 * * * *`
- `process-ai-events-due-edge` -> `*/10 * * * *`

---

## Vérifier les exécutions récentes

```sql
select
  jobid,
  jobname,
  start_time,
  end_time,
  status,
  return_message
from cron.job_run_details
where jobname in ('daily-country-update', 'ai-events-generation', 'process-ai-events-due-edge')
order by start_time desc
limit 50;
```

Si aucune exécution récente apparaît, le problème est côté scheduling pg_cron (job absent, disabled, extension).

---

## Events IA: pourquoi "ça ne tourne pas" alors que le job existe

Le job `ai-events-generation` appelle bien `run_ai_events_cron`, mais la fonction peut sortir sans générer si la config ne le permet pas.

Contrôles utiles:

```sql
select key, value
from public.rule_parameters
where key in ('ai_events_config', 'ai_events_last_run');
```

Vérifier dans `ai_events_config`:

- `interval_hours` > 0
- `count_major_per_run` ou `count_minor_per_run` > 0
- au moins une action autorisée (major/minor)
- au moins une cible autorisée

Et en données:

- au moins un pays IA majeur ou mineur (`countries.ai_status`).

---

## Important: traitement des events "due"

La génération IA (`run_ai_events_cron`) et le traitement des conséquences "due" sont deux étapes différentes.

- Génération: SQL pur (pg_cron OK).
- Process due: Edge Function (`process-ai-events-due`) appelée par pg_cron via `public.invoke_process_ai_events_due_edge()`.

Donc, en l'état du repo:

- **Automatique Supabase natif**: passage de jour + génération IA + traitement due (via Edge Function appelée par pg_cron).
- **Secours manuel**: le bouton admin "Traiter les events IA dus" et la route `/api/cron/process-ai-events` restent utiles en fallback/debug.

### Kill switch process due

La Edge Function lit `PROCESS_DUE_EDGE_ENABLED`.

- `false` (ou variable absente): la function répond `ok` mais ne traite rien.
- `true`: la function traite les events dus.

Cela permet de couper le traitement en urgence sans modifier le schéma.

---

## Recréer les jobs si besoin

Si les jobs ont disparu, appliquer/rejouer les migrations de scheduling (`089_schedule_pg_cron_jobs.sql`, `115_schedule_process_due_edge_function.sql`) ou la migration de réconciliation la plus récente.

