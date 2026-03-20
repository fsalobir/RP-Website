# Carte — métriques et critères stop/go (routes)

Ce document opérationnalise les **seuils** du plan d’overhaul routes (sans modifier le fichier de plan). Les métriques sont émises via `emitMapMetric` (`window.__mapMetricsSink`) et peuvent être journalisées en dev avec `NEXT_PUBLIC_MAP_DEBUG_METRICS=1`.

## Métriques ajoutées

| Nom | Description |
|-----|-------------|
| `map_routes_candidates_count` | Routes dont la géométrie est évaluée après **pré-filtre** viewport (bbox élargie). |
| `map_routes_built_count` | Routes effectivement construites dans le lot courant. |
| `map_routes_rendered_count` | Routes visibles après culling écran (équivalent `visibleRoutePaths.length`). |
| `map_route_build_ms_main_thread` | Temps total de build **moins** le temps worker (approximation thread principal). |
| `map_route_build_ms_worker` | Temps cumulé dans les appels worker (géométrie). |
| `map_label_layout_ms` | Coût cumulé du placement des libellés (milieu de tracé, angle). |
| `map_end_zoom_burst_ms` | Durée de la fenêtre **settle** après interaction (fin de zoom/drag). |
| `map_wheel_step_ms` | Écart entre deux événements molette (fluidité zoom). |

Les métriques existantes (`map_route_build_ms`, `map_interaction_frame_gap_ms`, etc.) restent valides.

## Variables d’environnement

| Variable | Effet |
|----------|--------|
| `NEXT_PUBLIC_MAP_ROUTE_WORKER=1` | Worker de géométrie + file annulable (`RouteGeometryWorkerClient`). |
| `NEXT_PUBLIC_MAP_ROUTE_BATCH_SVG=1` | Mode **public** : fusion des tracés en 3 chemins SVG par palier + chemins « hit » légers. |
| `NEXT_PUBLIC_MAP_QUALITY_GOVERNOR` | Si différent de `0` (défaut), gouverneur adaptatif (labels + bbox de build). |

## Gates recommandés (manuel / CI bench)

- **Phase 1 (culling)** : `map_routes_candidates_count` et compteurs villes/objets **baissent** en nation/province ; `map_wheel_step_ms` stable ou amélioré sur 2 profils.
- **Phase 2 (worker)** : `map_route_build_ms_main_thread` ↓ vs baseline ; pics au changement de palier zoom réduits.
- **Phase 3 (labels)** : pas d’effet « carte vide » ; `map_label_layout_ms` sous contrôle relatif au nombre de routes visibles.
- **Phase 4 (batch SVG)** : comparer `map_routes_rendered_count` et jank vs worker-only ; rollback si pas de gain net.
- **Phase 5 (gouverneur)** : sur mobile, `map_interaction_frame_gap_ms` et burst settle dans des budgets acceptables.

## Rollback

- Désactiver `NEXT_PUBLIC_MAP_ROUTE_BATCH_SVG` et `NEXT_PUBLIC_MAP_QUALITY_GOVERNOR=0`.
- Conserver `NEXT_PUBLIC_MAP_ROUTE_WORKER=0` pour forcer le thread principal si besoin.
