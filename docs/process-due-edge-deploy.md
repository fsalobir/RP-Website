# Déploiement Edge Function: process-ai-events-due

Projet Supabase cible (Fates of Nations, moderne) : **`ssnqervwthlqvbewhtrd`**. Les secrets ci-dessous doivent utiliser l’URL et la **service_role** de **ce** projet uniquement (pas un autre `*.supabase.co`).

## 1) Déployer la function

```bash
npx supabase functions deploy process-ai-events-due --no-verify-jwt
```

## 2) Configurer les secrets (project secrets)

```bash
npx supabase secrets set PROCESS_DUE_EDGE_ENABLED=false
npx supabase secrets set PROCESS_DUE_EDGE_SECRET="VALEUR_SECRET"
npx supabase secrets set DISCORD_BOT_TOKEN="..."
npx supabase secrets set NEXT_PUBLIC_SUPABASE_URL="https://ssnqervwthlqvbewhtrd.supabase.co"
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
