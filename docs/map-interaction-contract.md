# Contrat d'interaction carte (WebGL-first)

## Objectif

Decoupler la logique d'action utilisateur du renderer, pour garantir une evolution rapide sans regressions.

## Evenements canoniques

- `hover`
- `click`
- `select`
- `dragStart`
- `dragMove`
- `dragEnd`
- `toolModeChanged` (MJ)

Tous les evenements portent des IDs stables (`province`, `route`, `city`, `poi`) et ne dependent pas d'un index DOM.

## Etat de session

L'etat interactif vit hors du renderer:

- selection active
- mode outil MJ
- file d'actions (undo/redo)
- brouillons (ex: creation route)

Le renderer recoit des props d'affichage uniquement (surbrillance, filtres, priorites de labels).

## Invariants

- Une action validee doit etre rejouable sans divergence cote serveur.
- Aucune mutation metier n'est declenchee directement depuis une primitive de rendu.
- Pas de boucle de re-render massif sur `mousemove`; aggregation via RAF ou queue.
