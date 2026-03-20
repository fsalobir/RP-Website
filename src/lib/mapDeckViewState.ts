import { MAP_MAX_ZOOM, MAP_MIN_ZOOM } from "@/lib/mapZoomLevels";

/** Same constants as `mapZoomToDeckZoom` — single source for controller bounds. */
export const DECK_ZOOM_MIN = 0.85;
export const DECK_ZOOM_MAX = 18.2;

/**
 * Convertit le zoom « react-simple-maps » (≈ MAP_MIN..MAP_MAX) vers le zoom MapView deck.gl (≈ 0..22).
 * Courbe logarithmique pour rapprocher nation/province d’un niveau de détail cartographique Web Mercator.
 */
export function mapZoomToDeckZoom(mapZoom: number): number {
  const z = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, mapZoom));
  const z0 = Math.log(MAP_MIN_ZOOM);
  const z1 = Math.log(MAP_MAX_ZOOM);
  const t = (Math.log(z) - z0) / (z1 - z0);
  return DECK_ZOOM_MIN + t * (DECK_ZOOM_MAX - DECK_ZOOM_MIN);
}

/** Inverse de `mapZoomToDeckZoom` pour piloter le state carte depuis deck.gl. */
export function deckZoomToMapZoom(deckZoom: number): number {
  const t = (Math.max(DECK_ZOOM_MIN, Math.min(DECK_ZOOM_MAX, deckZoom)) - DECK_ZOOM_MIN) / (DECK_ZOOM_MAX - DECK_ZOOM_MIN);
  const z0 = Math.log(MAP_MIN_ZOOM);
  const z1 = Math.log(MAP_MAX_ZOOM);
  const logZ = z0 + t * (z1 - z0);
  return Math.exp(logZ);
}

export type DeckMapViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

export function toDeckViewState(center: [number, number], mapZoom: number): DeckMapViewState {
  return {
    longitude: center[0],
    latitude: center[1],
    zoom: mapZoomToDeckZoom(mapZoom),
    pitch: 0,
    bearing: 0,
  };
}

export function deckViewStateToMapView(vs: DeckMapViewState): { center: [number, number]; zoom: number } {
  return {
    center: [vs.longitude, vs.latitude],
    zoom: deckZoomToMapZoom(vs.zoom),
  };
}
