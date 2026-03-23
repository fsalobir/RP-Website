# Fates of Nations

Simulateur de nations (conflit moderne) : indicateurs dynamiques, règles, budget, militaire, événements IA, carte et intégrations Discord. Interface entièrement en français.

## Stack

- **Frontend** : Next.js (App Router), TypeScript, Tailwind CSS  
- **Données** : Supabase (PostgreSQL, RLS, Auth, Storage), tâches planifiées **pg_cron** et Edge Functions (voir `supabase/CRON.md`)

## Démarrage rapide

1. `npm install`
2. Copier `.env.example` vers `.env.local` et renseigner les clés Supabase (voir [SETUP.md](SETUP.md)).
3. `npm run dev` → [http://localhost:3000](http://localhost:3000)

## Documentation utile

| Document | Rôle |
|----------|------|
| [SETUP.md](SETUP.md) | Variables d’environnement, Vercel, checklists |
| [AGENTS.md](AGENTS.md) | Contexte pour assistants / onboarding technique |
| [CONTEXT.md](CONTEXT.md) | État fonctionnel du produit (référence session) |
| [supabase/README.md](supabase/README.md) | Migrations, auth, bucket `flags` |
| [supabase/CRON.md](supabase/CRON.md) | Jobs automatiques |
| [PLAN_SCENARIOS_TEST.md](PLAN_SCENARIOS_TEST.md) | Scénarios de test du moteur (référence) |

Dépôt Git : `fsalobir/RP-Website`. Projet Supabase de référence documenté dans `.env.example` (`ssnqervwthlqvbewhtrd`).
