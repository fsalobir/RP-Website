# Campagnes Stress/Soak Carte

## Stress tests

- Zoom/pan repetes 5 minutes (nation/province).
- Densite forte routes + villes + objets.
- Interaction mixte: clic routes, clic villes, changements de panel.

## Soak tests

- Session continue 30-60 minutes.
- Verification derive memoire et stabilite interactions.
- Verification progression des frame gaps p95/p99.

## WebGL context loss

- Simuler perte de contexte.
- Verifier recreation renderer et restauration etat (selection, vue, couches visibles).
- Verifier absence de page blanche persistante.

## Sortie de phase

- Aucun crash bloquant.
- Aucun freeze critique non recupere.
- SLO maintenus sur profils cibles.
