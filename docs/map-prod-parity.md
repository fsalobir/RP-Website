# Parité prod locale vs Vercel (carte)

## Problème

Comparer **`npm run dev`** à l’URL Vercel **ne prouve rien** sur la performance : le bundle dev n’est pas le bundle production.

## Test valide

1. Sur la **même machine** que celle utilisée pour tester le navigateur :
   ```bash
   npm run prod:local
   ```
2. Ouvrir `http://localhost:3000` (ou le port affiché) sur la **page carte** avec **`?mapdiag=1`**.
3. Noter dans le panneau : `NODE_ENV`, `MAP_RENDERER`, `MAP_ROLLOUT`, hôte Supabase, volumes, **`BUILD_COMMIT`** (7 premiers caractères du SHA intégré au bundle), **`VERCEL_ENV`** si présent.
4. Ouvrir le déploiement Vercel **même branche / même commit** avec **`?mapdiag=1`**.
5. Comparer : les flags carte et **`BUILD_COMMIT`** doivent **coincider** pour le même déploiement. Si le ressenti diffère alors que tout est aligné, le goulot est probablement **identique** entre `prod:local` et Vercel (même bundle) — chercher côté **profilage** (voir [map-performance-profiling.md](./map-performance-profiling.md)).

## Cache navigateur / doute sur le bundle

1. Hard refresh (Ctrl+F5) ou fenêtre de navigation privée.
2. Si besoin, comparer le hash d’un chunk `/_next/static/chunks/...` entre deux sessions.
3. Activer **`NEXT_PUBLIC_MAP_DEBUG_FRAME_GAP=1`** sur un build de test pour suivre les écarts de frames (variable au build).

## Smoke perf (manuel)

- **Desktop** : ouvrir Nation/Province, drag continu ~10 s, zoom molette ; le panneau doit rester utilisable, pas de gel long.
- **Mobile** (DevTools ou appareil) : même scénario ; objectif « nettement mieux » qu’avant sur appareil modeste.

## Script avec debug NDJSON (optionnel dev)

`npm run prod:local:debug` — écrit aussi les logs session carte si `DEBUG_MAP_SESSION` / `NEXT_PUBLIC_DEBUG_MAP_SESSION` sont utilisés (voir `.env.example`).
