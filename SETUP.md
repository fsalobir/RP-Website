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
