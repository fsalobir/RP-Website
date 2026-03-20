# SLO carte (MJ/Public)

Ce document définit les objectifs minimum de robustesse/performance de la carte.

## Budgets cibles

- `TTReady p95` page publique (`/`) <= 2500 ms
- `TTReady p95` page MJ (`/mj/carte`) <= 3000 ms
- Interaction zoom/pan: aucune frame > 100 ms sur machine de dev standard
- Interaction nation/province: p95/p99 dans les seuils du profil actif (source: `docs/map-benchmark-thresholds.json`)
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
  - conserver la compatibilite du palier qualite `perf` sur mobile
  - conserver la cohérence MJ/Public sur les paramètres de carte

## Gates obligatoires WebGL (passage de phase)

- `frameGapP95` interaction <= seuil du profil actif.
- Régression interaction (`zoom/pan`) <= budget défini par benchmark check.
- Respect du contrat d'interaction (`docs/map-interaction-contract.md`) et de la parite MJ/Public (`docs/map-mj-public-parity-matrix.md`).
- Erreurs runtime renderer (WebGL init/draw) <= 0.5%.
- Zéro régression fonctionnelle sur scénarios critiques (clic route/ville, panneau info, sélection MJ).

