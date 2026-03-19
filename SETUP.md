# Installation locale – RP-Website

## Déjà fait

- **Node.js** : installé (LTS, ≥ 20.9). Vérifier avec `node -v`.
- **Dépendances** : `npm install` a été exécuté.
- **Variables d’environnement** : le fichier `.env.example` liste les variables attendues.

## À faire de ton côté

### 1. Créer `.env.local`

À la racine du projet :

1. Copier `.env.example` vers `.env.local`.
2. Remplacer les valeurs par celles de ton projet Supabase :
   - **Supabase Dashboard** → ton projet → **Settings** → **API**
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
3. (Optionnel) Pour les actions admin : ajouter `SUPABASE_SERVICE_ROLE_KEY` = service_role key.

### 2. Lancer l’app

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

Sans `.env.local`, la page d’accueil renverra une erreur Supabase (« URL and Key are required »).

### 3. Premier déploiement Supabase (si besoin)

Si le projet Supabase n’est pas encore configuré, suivre [supabase/README.md](supabase/README.md) (migrations, auth, bucket `flags`, premier admin).

### 4. Base Supabase remote (dev et prod)

- **En dev (recommandé)** : `.env.local` doit pointer vers ton projet Supabase **remote** (URL `https://…supabase.co` + anon key). L’app se connecte directement à la base distante, **Docker n’est pas requis**.
- **En prod (Vercel)** : `.env.local` n’est pas déployé (ignoré par git). Dans Vercel → **Settings** → **Environment Variables**, définir :
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - (optionnel) `SUPABASE_SERVICE_ROLE_KEY`

> Note : le fichier `supabase/config.toml` et les scripts Supabase “local” existent seulement pour ceux qui veulent exécuter Supabase en local (tests, debug). Ils ne sont pas nécessaires pour développer l’app au quotidien.

### 5. Dépannage (branche Fantasy)

- **« Erreur lors du chargement des royaumes »**  
  Sur la page d’accueil, ouvrir **« Détail technique »** pour voir le message Supabase exact :
  - Si vous voyez `relation "public.realms" does not exist` (ou code 42P01) → l’app pointe vers une base qui n’a pas le schéma attendu. Vérifier que `.env.local` pointe bien vers **ton projet Supabase remote** (URL `https://…supabase.co`), que les migrations Fantasy ont été appliquées, puis redémarrer (`npm run dev`).
  - Si vous voyez une erreur JWT / 401 → les clés dans `.env.local` sont invalides ; récupérer une nouvelle **anon key** dans Supabase Dashboard → Settings → API.

- **« Identifiants incorrects » à la connexion MJ**  
  Ce message correspond à `Invalid login credentials` renvoyé par Supabase Auth. Causes fréquentes :
  1. **Compte non créé** : sur un projet remote neuf, le compte MJ “seed” n’existe pas. Créer le compte via l’écran de connexion/inscription (si exposé) ou directement dans Supabase Auth, puis appliquer le rôle/les droits attendus.
  2. **Schéma incomplet** : les tables/RLS nécessaires n’ont pas été migrées sur le projet remote. Appliquer les migrations Fantasy (voir `supabase/migrations/`).
  3. **Mot de passe différent** : vérifier le mot de passe saisi et/ou réinitialiser via Supabase Auth.
