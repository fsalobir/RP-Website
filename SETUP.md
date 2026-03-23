# Installation locale – Fates of Nations (RP-Website)

## Prérequis à confirmer (avant déploiement / recâblage)

À valider une fois pour aligner **Supabase**, **Vercel** et ce dépôt :

1. **Projet Supabase** : l’instance cible pour la version moderne est **`ssnqervwthlqvbewhtrd`** (URL API : `https://ssnqervwthlqvbewhtrd.supabase.co`). Si tu utilises un autre ref, mets à jour `.env.local`, Vercel et les secrets Edge en conséquence.
2. **Projet Vercel** : note le **nom exact** du projet Vercel qui doit recevoir les déploiements de ce repo (`fsalobir/RP-Website`), pour ne pas confondre avec un autre site (ex. variante fantasy).
3. **Branche de production** : en général **`main`** — vérifie dans Vercel → *Settings* → *Git* → *Production Branch*.
4. **Preview** : si d’autres branches (ex. `fantasy`) déclenchent des previews sur le **même** projet Vercel, configure les **variables d’environnement** *Preview* (souvent la même base que la prod, ou un projet Supabase dédié selon ton choix).

L’extension **Vercel** dans Cursor doit pointer vers ce même projet Vercel.

---

## Déjà fait

- **Node.js** : installé (LTS, ≥ 20.9). Vérifier avec `node -v`.
- **Dépendances** : `npm install` a été exécuté.
- **Variables d’environnement** : le fichier `.env.example` liste les variables attendues (sans secrets).

## À faire de ton côté

### 1. Créer `.env.local`

À la racine du projet :

1. Copier `.env.example` vers `.env.local`.
2. Renseigner les variables depuis **Supabase** → projet **`ssnqervwthlqvbewhtrd`** → **Settings** → **API** (même projet pour les trois premières lignes).

| Variable | Obligatoire | Rôle |
|----------|-------------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Oui | Doit être `https://ssnqervwthlqvbewhtrd.supabase.co` pour la prod documentée |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Oui | Clé **anon** du même projet |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommandé | Scripts, routes serveur sensibles ; ne jamais exposer au navigateur |
| `CRON_SECRET` | Prod / cron | Même valeur que sur Vercel ; protège `/api/cron/*` |
| `DISCORD_BOT_TOKEN` | Si bot utilisé | Dispatch Discord côté serveur |

**Vérifications (sans partager les clés) :** l’URL contient bien `ssnqervwthlqvbewhtrd` ; les clés viennent de l’onglet API **de ce projet** ; `npm run dev` affiche la liste des pays sur `/`.

### 2. Lancer l’app

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

Sans `.env.local`, la page d’accueil renverra une erreur Supabase (« URL and Key are required »).

### 3. Premier déploiement Supabase (si besoin)

Si le projet Supabase n’est pas encore configuré, suivre [supabase/README.md](supabase/README.md) (migrations, auth, bucket `flags`, premier admin).

Le dépôt inclut [`supabase/config.toml`](supabase/config.toml) avec `project_id = "ssnqervwthlqvbewhtrd"` pour aligner le CLI. Après `supabase login`, vérifie le lien avec :

```bash
npm run supabase -- projects list
```

(en cas d’erreur d’accès, reconnecte-toi au bon compte organisation.)

### 4. Vercel (production et previews)

1. **Git** : *Settings* → *Git* — dépôt `fsalobir/RP-Website`, branche de production (souvent `main`).
2. **Variables d’environnement** : reprendre les **mêmes noms** que `.env.example`, avec les valeurs du projet Supabase `ssnqervwthlqvbewhtrd`. Supprime ou corrige toute variable pointant vers un **autre** sous-domaine `*.supabase.co`.
3. **Preview** : si plusieurs branches partagent ce projet Vercel, configure *Preview* explicitement (évite qu’une branche « fantasy » utilise par erreur une autre base).
4. **Local** (optionnel) : `vercel link` dans le dossier du projet, choisir le **même** projet que sur le dashboard ; `vercel env pull` pour un fichier local de synchro (ne pas committer les secrets).

Après un `git push` sur la branche de production, le déploiement doit apparaître sur **ce** projet Vercel ; l’URL de prod ne doit pas afficher d’erreurs Supabase dans la console réseau.

### 5. Secrets Edge (function `process-ai-events-due`)

Sur le dashboard Supabase du projet **`ssnqervwthlqvbewhtrd`**, les secrets de la function doivent réutiliser **cette** URL et la **service_role** du même projet. Procédure détaillée : [docs/process-due-edge-deploy.md](docs/process-due-edge-deploy.md). Vérifie qu’aucun secret ne contient une autre URL `*.supabase.co`.

### 6. Fichiers versionnés vs secrets

- `.env.example` est **suivi** par Git (modèle sans secrets).
- `.env.local` est **ignoré** — ne jamais le committer.
- Après ajout de `.env.example`, `git status` doit le lister comme fichier suivi (pas « ignoré »).
