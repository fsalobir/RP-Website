# Contexte de session – Fates of Nations

Document de référence pour reprendre le projet. À mettre à jour après des changements majeurs du produit.

---

## Produit et dépôt

- **Nom :** Fates of Nations (simulateur moderne).
- **Repo :** `fsalobir/RP-Website` (branche principale de travail : `main`).
- **Supabase de référence (documenté) :** projet **`ssnqervwthlqvbewhtrd`**. Variables : voir `.env.example` et [SETUP.md](SETUP.md).

## Stack

- Next.js (App Router), TypeScript, Tailwind.
- Supabase : PostgreSQL, RLS, Auth, Storage.
- **Automatisation :** jobs **pg_cron** (snapshots, tick pays, IA, etc.) décrits dans [supabase/CRON.md](supabase/CRON.md) ; Edge Function `process-ai-events-due` ([docs/process-due-edge-deploy.md](docs/process-due-edge-deploy.md)).

## Public

- **Accueil** : table des nations avec indicateurs et variations (via `country_history`).
- **Fiche pays** : onglets Cabinet, Généralités, Militaire, État-major, Avantages, Budget, Lois, Actions d’État, Debug (admin) — voir `CountryTabs.tsx`.
- **Règles** : lecture des `rule_parameters`.
- Carte / autres vues selon routes sous `src/app/(public)/`.

## Admin

- Auth Supabase + table `admins`.
- CRUD pays, règles (global, mobilisation, …), joueurs, outils Discord selon pages `src/app/admin/`.

## Données (non exhaustif)

- Cœur : `countries`, `country_macros`, `country_history`, `rule_parameters`, `country_effects`.
- Jeu : budget pays, militaire (types, limites, unités), perks, lois, actions d’état, événements IA, relations, carte/régions selon migrations.
- Migrations : répertoire `supabase/migrations/` (nombreuses ; le schéma source de vérité est la dernière migration appliquée).

## Conventions

- UI 100 % français ; code / commentaires peuvent rester en anglais.
- Nombres : `formatNumber` / `formatGdp` (`src/lib/format.ts`).
- Drapeaux : souvent `<img>` (URLs Storage ou externes).
- Effets : toujours penser `getEffectsForCountry` pour la logique métier côté app.

## Fichiers clés

| Rôle | Fichiers |
|------|----------|
| Clients Supabase | `src/lib/supabase/server.ts`, `client.ts` |
| Effets | `src/lib/countryEffects.ts` |
| Fiche pays | `src/app/(public)/pays/[slug]/page.tsx`, `CountryTabs.tsx` |
| Cron / SQL | `supabase/migrations/`, `supabase/CRON.md` |
| Règles Cursor | `.cursor/rules/nation-simulator.mdc` |
| Agent / onboarding | `AGENTS.md` |

---

Mettre à jour ce fichier après d’importantes évolutions (nouvelles tables visibles joueur, nouveaux jobs, changements d’auth).
