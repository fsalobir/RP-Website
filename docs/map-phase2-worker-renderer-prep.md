# Preparation lot 2 - Worker routes et renderer robuste

## Objectif

Preparer une bascule progressive des calculs routes hors thread principal, sans activer la fonctionnalite par defaut.

## Elements prepares

- Flag de fonctionnalite:
  - `NEXT_PUBLIC_MAP_ROUTE_WORKER=1`
  - expose via `isMapRouteWorkerEnabled()` dans `src/lib/featureFlags.ts`
- Contrat de message worker:
  - `src/lib/routeGeometryWorkerTypes.ts`
- Squelette worker dedie:
  - `src/workers/routeGeometry.worker.ts`

## Strategie d'integration recommandee

1. Integrer le worker dans `WorldMapClient` derriere le flag.
2. Router uniquement les routes les plus couteuses vers le worker (seuil de points/waypoints).
3. Comparer sortie worker vs pipeline actuel sur un echantillon (A/B) pour verifier la fidelite visuelle.
4. Activer rollout progressif:
   - local debug
   - `mj-only`
   - canary public
5. Conserver fallback SVG+main-thread immediate en cas d'erreur worker.

## Mesures de succes lot 2

- Reduction du temps bloque main thread lors des interactions carte.
- Diminution de `frameGapP95/P99` en dataset moyen/large.
- Stabilite fonctionnelle (traces routes et labels inchanges a epsilon pres).

