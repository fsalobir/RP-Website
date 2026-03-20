# Parité prod locale vs Vercel (carte)

## Problème

Comparer **`npm run dev`** à l’URL Vercel **ne prouve rien** sur la performance : le bundle dev n’est pas le bundle production.

## Test valide

1. Sur la **même machine** que celle utilisée pour tester le navigateur :
   ```bash
   npm run prod:local
   ```
2. Ouvrir `http://localhost:3000` (ou le port affiché) sur la **page carte**.
3. Noter : variables `NEXT_PUBLIC_MAP_*` utilisées au build (fichier `.env.local`, logs `[map.build]` pendant `next build` si disponibles), URL Supabase, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` / `VERCEL_ENV` sur Vercel si tu compares un déploiement.
4. Ouvrir le déploiement Vercel **même branche / même commit** avec les **mêmes** `NEXT_PUBLIC_*` attendues.
5. Comparer : les flags carte doivent **coincider** (même build + même env). Si le ressenti diffère alors que tout est aligné, le goulot est probablement **identique** entre `prod:local` et Vercel (même bundle) — chercher côté **profilage** (voir [map-performance-profiling.md](./map-performance-profiling.md)).

## Cache navigateur / doute sur le bundle

1. Hard refresh (Ctrl+F5) ou fenêtre de navigation privée.
2. Si besoin, comparer le hash d’un chunk `/_next/static/chunks/...` entre deux sessions.

## Smoke perf (manuel)

- **Desktop** : ouvrir Nation/Province, drag continu ~10 s, zoom molette ; l’UI doit rester utilisable, pas de gel long.
- **Mobile** (DevTools ou appareil) : même scénario ; objectif « nettement mieux » qu’avant sur appareil modeste.
