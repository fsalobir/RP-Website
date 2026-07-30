# Automatisation Supabase

Le projet utilise `pg_cron` et un seul worker Edge, `rp-pipeline`.

## Jobs attendus

| Job | Rôle | Cadence |
|---|---|---|
| `daily-country-update` | Fait évoluer le monde | règle existante |
| `ai-events-generation` | Crée les actions RP dues | cadence MJ |
| `rp-pipeline-worker` | Traite la file fiable | chaque minute |
| `rp-discord-sync-planner` | Programme la collecte publique | 06:00 et 18:00, Paris |

La génération SQL ne produit que des actions valides. Le worker prend ensuite le
relais : jet, trois appels Magnum, validation éventuelle, transaction de
conséquences, puis publication Discord.

## Vérifier les jobs

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname in (
  'daily-country-update',
  'ai-events-generation',
  'rp-pipeline-worker',
  'rp-discord-sync-planner'
)
order by jobname;
```

```sql
select jobname, start_time, end_time, status, return_message
from cron.job_run_details
where jobname in (
  'daily-country-update',
  'ai-events-generation',
  'rp-pipeline-worker',
  'rp-discord-sync-planner'
)
order by start_time desc
limit 50;
```

## Diagnostiquer

- Aucune action : vérifier les pays IA, les quotas globaux et
  `action_automation_configs`.
- Tâche en `retry` : elle repart automatiquement après 5 puis 15 minutes.
- Tâche en `warning` : trois essais ont échoué ; intervention MJ requise.
- Tâche en `review` : article ou décision à valider.
- Collecte bloquée : vérifier `DISCORD_BOT_TOKEN`, les permissions du salon et
  son activation dans `discord_rp_channels`.
- Publication bloquée : vérifier la route et le secret webhook référencé.

Le kill switch `RP_PIPELINE_EDGE_ENABLED=false` arrête tout traitement sans
supprimer la file.
