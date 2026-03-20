# Garde-fous post-lancement carte

## Règles de base

- Toute amélioration visuelle passe derrière un flag.
- Toute amélioration visuelle doit déclarer son budget perf.
- Toute PR carte doit garder `benchmark:map:check` au vert.

## Règles CI

- Échec bloquant si régression interaction > seuil.
- Échec bloquant si métriques zero-SVG requises ne sont pas respectées.
- Échec bloquant si la matrice de parité MJ/Public n'est pas validée.

## Règles produit

- Le palier `perf` reste le défaut pour les devices mobiles contraints.
- Les paliers supérieurs ne peuvent pas dégrader les SLO du palier perf.
- Le rollback doit rester documenté et testé périodiquement.

