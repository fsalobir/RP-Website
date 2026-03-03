/** Géométrie GeoJSON (Polygon ou MultiPolygon pour les régions). */
export type MapRegionGeometry = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };

/** Région de la carte (un pays = une région). */
export interface MapRegion {
  id: string;
  name: string;
  slug: string;
  geometry: MapRegionGeometry;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Lien région – pays (N–N). */
export interface MapRegionCountry {
  region_id: string;
  country_id: string;
}
