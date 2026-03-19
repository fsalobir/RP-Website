# SLO carte (MJ/Public)

Ce document définit les objectifs minimum de robustesse/performance de la carte.

## Budgets cibles

- `TTReady p95` page publique (`/`) <= 2500 ms
- `TTReady p95` page MJ (`/mj/carte`) <= 3000 ms
- Interaction zoom/pan: aucune frame > 100 ms sur machine de dev standard
- Taux d'erreur sauvegarde config carte (MJ): < 0.5%
- Disponibilité affichage carte (pas d'écran vide): >= 99.9%

Profils de seuils benchmark interaction:

- `small` (dev local léger)
- `medium` (staging standard)
- `large` (pré-prod dense)

Source de vérité des seuils: `docs/map-benchmark-thresholds.json`.

## Charge fonctionnelle cible

- 800 villes/POI cumulés
- 1200 routes
- 50 waypoints max par route (garde-fou serveur/client)

## Mesure

- Utiliser `npm run benchmark:map` en local/staging.
- Utiliser `npm run benchmark:map:interaction` pour pan/zoom.
- Vérifier les seuils bloquants via `npm run benchmark:map:check` (profil via `MAP_BENCH_PROFILE`).
- Comparer à une baseline via `MAP_INTERACTION_BASELINE=<path>` pour bloquer les régressions en pourcentage.
- Compléter avec métriques runtime (logs serveur + perf browser) sur:
  - temps de rendu initial
  - volume de noeuds SVG/WebGL
  - latence de sauvegarde config
  - frame gap p95/p99 sur interaction
  - long tasks pendant pan/zoom

## Critères de non-régression

- Toute PR qui touche la carte doit:
  - conserver les SLO ci-dessus
  - ne pas dégrader `TTReady p95` > 15%
  - respecter les seuils `docs/map-benchmark-thresholds.json`
  - conserver la cohérence MJ/Public sur les paramètres de carte

