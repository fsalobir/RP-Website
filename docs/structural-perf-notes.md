# Performance structurelle — carte (suivi)

## État actuel

- **WebGL (défaut produit)** : [`MapDeckViewport`](../src/components/map/MapDeckViewport.tsx) + [`buildWorldMapDeckLayers`](../src/components/map/worldMapDeckLayers.ts) — **un seul `viewState` deck.gl** (MapView + MapController) pour provinces, hydro, frontières royaumes, routes (`PathLayer`), villes/POI (`ScatterplotLayer`), libellés (`TextLayer`). Plus de `ZoomableGroup` + milliers de `<path>` pour ces couches quand `NEXT_PUBLIC_MAP_RENDERER=webgl`.
- **SVG (fallback)** : `NEXT_PUBLIC_MAP_RENDERER_FORCE_SVG=1` ou `NEXT_PUBLIC_MAP_RENDERER=svg` → `ComposableMap` / `react-simple-maps` comme avant ; [`mapRendererAdapter`](../src/lib/mapRendererAdapter.ts) n’affiche pas les couches Deck.
- Les variables `NEXT_PUBLIC_MAP_ZERO_SVG_SPIKE` / `NEXT_PUBLIC_MAP_WEBGL_PROVINCES` restent dans [`featureFlags.ts`](../src/lib/featureFlags.ts) à titre **legacy** ; l’adapter ne s’en sert plus pour le rendu principal.
- [`MapEngine.tsx`](../src/components/map/engine/MapEngine.tsx) reste un **stub** (`return null`) ; l’orchestration GPU est dans `WorldMapClient` + modules ci-dessus.

## Piste « memo »

- Le panneau [`MapDiagnosticPanel`](../src/components/map/MapDiagnosticPanel.tsx) est **mémoïsé** : les données affichées (env build + volumes) ne dépendent pas du pan/zoom, donc le panneau évite des re-renders inutiles pendant le drag lorsque `?mapdiag=1` est actif.
- [`MapSvgGeographyLayers`](../src/components/map/MapSvgGeographyLayers.tsx) regroupe hydro + provinces + frontières en sous-arbre **memo** : limite les reconciliations quand seules d’autres branches de la carte changent.

## Suite possible (hors scope immédiat)

1. Découper `WorldMapClient` en sous-composants dont les props changent moins souvent que `mapView`.
2. Icônes villes riches (`IconLayer` / atlas) si besoin au-delà des `ScatterplotLayer`.
3. Remplir `MapEngine` si un point d’entrée d’orchestration centralisé redevient utile.

Voir aussi [map-performance-profiling.md](./map-performance-profiling.md).
