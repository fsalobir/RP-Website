# Optimisation des assets carte (icônes/images)

## Objectif

Réduire drastiquement le coût réseau et rendu des icônes carte pour les gros volumes.

## Stratégie

- Encodages prioritaires:
  - WebP en premier choix
  - PNG fallback
- Budgets upload:
  - taille max brute: 256 KB par icône
  - dimensions max: 512x512
  - rejet upload si format non autorisé
- Dérivés générés:
  - 16/24/32/48 px
  - nommage avec hash immuable
- Cache:
  - `Cache-Control: public, max-age=31536000, immutable` sur les dérivés hashés
- Sécurité/source:
  - whitelist des domaines externes
  - proxy d’images externes recommandé (pour homogénéité et contrôle)

## Contrôles CI/revue

- Vérifier qu’aucune nouvelle icône n’excède le budget.
- Vérifier que les nouveaux flux d’upload passent bien par la validation format/taille.

