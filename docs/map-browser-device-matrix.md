# Matrice navigateurs et appareils cibles

## Objectif

Définir les profils minimums à valider avant tout élargissement de rollout WebGL.

## Desktop

- Windows 10/11 - Chrome (stable)
- Windows 10/11 - Edge (stable)
- macOS (n-1) - Safari
- macOS (n-1) - Chrome

## Mobile

- Android milieu de gamme (Chrome)
- Android entrée de gamme (Chrome, mémoire contrainte)
- iOS Safari (version n-1)

## Profils de validation

- **Perf (défaut):** obligatoire sur tous les profils.
- **Balanced:** requis sur desktop + mobile milieu de gamme.
- **Rich:** optionnel, seulement sur profils hautes capacités.

## Seuils de passage

- Respect des SLO de `docs/map-slo.md`.
- Benchmarks interaction conformes au profil actif.
- Aucune rupture fonctionnelle critique MJ/Public.
- Rollback fonctionnel testé sur au moins un profil desktop et un profil mobile.
