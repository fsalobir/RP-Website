# Roadmap performance routes

## Objectif

Stabiliser les performances des routes en conservant la fidélité visuelle SVG, puis préparer une bascule vers un renderer lignes robuste sans artefacts.

## Court terme (implémenté)

- Cache géométrique incrémental par route dans `WorldMapClient` (clé: endpoints/waypoints, niveau de zoom, epsilon LOD, révision géo).
- Culling viewport strict des routes via bbox projetée.
- Caps de densité par palier de zoom:
  - routes visibles,
  - labels visibles.
- LOD live renforcé:
  - simplification préservant les courbes,
  - variantes LOD (`low/mid/high`) choisies par zoom.
- Observabilité runtime:
  - `map_route_build_ms`,
  - `map_routes_visible_count`,
  - `map_route_labels_visible_count`,
  - `map_interaction_frame_gap_ms`.

## Moyen terme (renderer lignes robuste)

1. Introduire `RouteLineRenderer` derrière flag (SVG par défaut, renderer v2 en opt-in).
2. Générer une géométrie GPU stable (joins/miter/bevel, caps, anti-aliasing contrôlé) avec index buffer.
3. Ajouter picking routes fiable (index spatial CPU ou buffer picking GPU).
4. Préserver labels/routes interactions via couche SVG texte au-dessus au début.
5. Activer rollout progressif:
   - `mj-only` -> `public-canary` -> `all`,
   - rollback immédiat via `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1`.

## Gates de passage

- Respect des budgets dans `docs/map-benchmark-thresholds.json`.
- Aucune régression des scénarios critiques MJ/Public.
- Variabilité frame gap stable en p95/p99.

