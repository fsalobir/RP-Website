# Checklist : étapes suivantes déploiement WebGL

Ordre recommandé. À chaque étape : vérifier le badge **Renderer** sur la carte, les clics route/ville, et les SLO (`docs/map-slo.md`).

## Étape 1 — Local / staging (MJ uniquement)

**Raccourci (recommandé)** : depuis la racine du projet :

```bash
npm run dev:webgl:mj
```

Puis ouvrir `/mj/carte` → badge **webgl** ; l’accueil `/` reste en **svg**.

**Alternative** : dans `.env.local` (voir `.env.example`) :

- `NEXT_PUBLIC_MAP_RENDERER=webgl`
- `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT=mj-only`

## Étape 2 — Canary public

1. `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT=public-canary`
2. Ajuster `NEXT_PUBLIC_MAP_RENDERER_CANARY_PCT` (ex. `5`, puis `25`, puis `50`).
3. Vérifier qu’une partie des navigateurs voit `webgl` sur l’accueil (clé stable par navigateur).
4. Exécuter un drill rollback (`docs/map-rollback-drills.md`) avant d’augmenter le pourcentage.

## Étape 3 — 100 % public

1. Quand les métriques et la parité sont stables sur une fenêtre convenue :
   - `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT=all`
2. Surveiller `map_interaction_frame_gap_ms` et les erreurs console.
3. Vérifier la matrice cibles (`docs/map-browser-device-matrix.md`) sur profils critiques.

## Rollback

- Définir `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1` **ou** repasser `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT=off`.

## Après stabilisation

- Suivre la checklist de décommission SVG dans `docs/map-webgl-migration.md`.
- Appliquer les garde-fous post-lancement (`docs/map-post-launch-guardrails.md`).
