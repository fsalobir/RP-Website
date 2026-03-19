# Accès données carte (v2)

## Objectif

Réduire le volume transporté et le coût CPU de parsing côté client.

## Mesures

- Ne sélectionner que les colonnes strictement utiles pour chaque vue.
- Introduire un chargement par viewport pour les couches lourdes (villes/POI/routes).
- Prévoir pagination/stream pour listes techniques MJ (routes, waypoints, logs).
- Ajouter index SQL ciblés:
  - `route_pathway_points(route_id, seq)`
  - `cities(province_id, created_at)`
  - `poi(province_id, is_visible)`
- Utiliser des versions de snapshot (`map_data_version`) pour invalidation fine du cache.

## Validation

- Mesurer réduction payload JSON sur dataset `large`.
- Mesurer temps de sérialisation/désérialisation côté client.

