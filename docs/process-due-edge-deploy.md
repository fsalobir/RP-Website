# Déploiement Edge Function: process-ai-events-due

> ⚠️ **Branche `fantasy` – Document d’héritage**
> 
> Ces instructions décrivent le déploiement de la function `process-ai-events-due` telle qu’elle existait pour l’ancien simulateur de nations.  
> Sur `fantasy`, réutiliser les **patterns de déploiement et de secrets** (Supabase Functions, secrets, canary), mais revoir le nom de la function, le schéma ciblé et la sémantique des événements pour coller au RPG Fantasy.

## 1) Déployer la function (ancienne version, à adapter si renommée)

```bash
npx supabase functions deploy process-ai-events-due --no-verify-jwt
```

## 2) Configurer les secrets (project secrets)

```bash
npx supabase secrets set PROCESS_DUE_EDGE_ENABLED=false
npx supabase secrets set PROCESS_DUE_EDGE_SECRET="VALEUR_SECRET"
npx supabase secrets set DISCORD_BOT_TOKEN="..."
npx supabase secrets set NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
```

La valeur `PROCESS_DUE_EDGE_SECRET` doit être identique à:

```sql
select value #>> '{}'
from public.rule_parameters
where key = 'process_due_edge_secret';
```

## 3) Appliquer les migrations

```bash
npx supabase db push
```

## 4) Vérifier les jobs cron

```sql
select jobname, schedule
from cron.job
where jobname in ('daily-country-update', 'ai-events-generation', 'process-ai-events-due-edge')
order by jobname;
```

## 5) Activer canary

Passer:

```bash
npx supabase secrets set PROCESS_DUE_EDGE_ENABLED=true
```

Puis surveiller selon `docs/process-due-canary-runbook.md`.
