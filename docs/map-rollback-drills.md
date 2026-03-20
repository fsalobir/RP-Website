# Rollback drills carte WebGL

## Objectif

Vérifier que le rollback n'est pas seulement théorique et qu'il peut être exécuté rapidement pendant incident.

## Procédure de drill

1. Activer un scénario de charge (bench interaction ou session manuelle dense).
2. Forcer rollback:
   - `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1`
3. Vérifier:
   - chargement carte sans écran vide
   - interaction pan/zoom fonctionnelle
   - clic route/ville fonctionnel
4. Repasser en mode normal et confirmer retour stable.

## Critère de réussite

- rollback opérationnel < 5 minutes
- aucune perte de capacité critique MJ/Public
- runbook incident mis à jour après drill

