# Principes Produit Carte (coeur de l'experience)

## Positionnement

La carte est le coeur du produit: lecture du monde, decisions, actions MJ et navigation joueur.
La performance est un engagement produit, pas uniquement technique.

## Principes non negociables

- Fluidite d'interaction prioritaire sur tout effet visuel.
- Toute nouvelle fonctionnalite carte doit respecter les SLO avant activation large.
- Pas de geometrie lourde dans le DOM en mode normal cible.
- Parite fonctionnelle MJ/Public obligatoire avant de supprimer un fallback.

## Definition "parfaitement fluide"

- Pas de gel perceptible pendant drag/zoom.
- Pas de burst lourd au relachement du zoom/pan.
- Comportement stable en session longue.
- Lisibilite maintenue sur mobile (palier perf par defaut).

## Regle d'evolution

- Baseline perf d'abord.
- Richesse visuelle ensuite, par paliers et flags.
- Chaque gain visuel doit avoir un budget et un plan de rollback.
