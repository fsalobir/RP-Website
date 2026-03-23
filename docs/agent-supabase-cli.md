# Agent Cursor & CLI Supabase — migrations

## Principe

Dans ce dépôt, **l’assistant Cursor peut exécuter** `npx supabase db push` (avec accès réseau) pour appliquer les migrations SQL du dossier `supabase/migrations/` sur la base **distante** liée au projet.

Ne pas supposer que « l’agent ne peut pas » : **tenter d’abord** `npx --yes supabase db push` depuis la racine.

## Commande recommandée

```bash
cd /chemin/vers/Fates\ of\ Nations
npx --yes supabase db push
```

- Le projet distant est documenté dans `supabase/config.toml` (`project_id`, souvent `ssnqervwthlqvbewhtrd`).
- Il faut une session **`supabase login`** valide sur l’environnement qui exécute la commande.

## Alternative (CLI déjà installé)

```bash
npm run supabase -- db push
```

(utilise `scripts/run-supabase.mjs` et un binaire sous Windows dans `tools/supabase-cli/` si présent.)

## Référence humaine

Installation locale complète : `SETUP.md` (variables `.env`, lien Vercel, etc.).

Règle Cursor persistante : `.cursor/rules/agent-cursor-supabase-cli.mdc` (**alwaysApply: true**).
