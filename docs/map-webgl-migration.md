# Migration WebGL carte (plan technique)

## Flag et rollback

- `NEXT_PUBLIC_MAP_RENDERER=svg|webgl`
- `NEXT_PUBLIC_MAP_RENDERER_ROLLOUT=off|mj-only|public-canary|all`
- `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1` pour rollback immédiat

## Phases

1. **Phase 0**: instrumentation et baseline perf (déjà en place)
2. **Phase 1**: WebGL routes + points (MJ seulement)
3. **Phase 2**: ajout provinces + labels sous flag
4. **Phase 3**: canary public (5% -> 25% -> 50% -> 100%)
5. **Phase 4**: retrait pipeline SVG après 2 semaines stables

## Critères de passage

- Pas de régression > seuils `map-benchmark-thresholds.json`
- Taux d’erreur carte inchangé ou meilleur
- Cohérence visuelle MJ/Public validée (labels, sinuosité, tailles)

## Runbook incident

- Forcer rollback via `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1`
- Revenir au stage `off`
- Vérifier artefacts précompute et métriques runtime

