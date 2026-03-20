export type MapZoomLevelId = "monde" | "continent" | "nation" | "province";

export type MapZoomLevel = {
  id: MapZoomLevelId;
  label: string;
  zoom: number;
};

/**
 * Seuils de zoom de référence pour piloter les règles d'affichage.
 * Le joueur garde un zoom libre; ces paliers servent de points d'ancrage.
 */
export const MAP_ZOOM_LEVELS: readonly MapZoomLevel[] = [
  { id: "monde", label: "Monde", zoom: 1.05 },
  { id: "continent", label: "Continent", zoom: 2.4 },
  { id: "nation", label: "Nation", zoom: 6 },
  { id: "province", label: "Province", zoom: 12 },
] as const;

export const MAP_MIN_ZOOM = MAP_ZOOM_LEVELS[0].zoom;
export const MAP_MAX_ZOOM = 110;

export function getZoomLevelById(id: MapZoomLevelId): MapZoomLevel {
  const found = MAP_ZOOM_LEVELS.find((z) => z.id === id);
  return found ?? MAP_ZOOM_LEVELS[0];
}

export function getCurrentZoomLevel(zoom: number): MapZoomLevelId {
  if (zoom >= getZoomLevelById("province").zoom) return "province";
  if (zoom >= getZoomLevelById("nation").zoom) return "nation";
  if (zoom >= getZoomLevelById("continent").zoom) return "continent";
  return "monde";
}

export function getRouteSimplificationEpsilonForZoomLevel(level: MapZoomLevelId): number {
  if (level === "province") return 0.1;
  if (level === "nation") return 0.25;
  return 0.6;
}

