export type MapTileManifestEntry = {
  id: string;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  url: string;
};

export type MapTileManifest = {
  version: number;
  generatedAt: string;
  entries: MapTileManifestEntry[];
  schemaVersion?: number;
  active?: {
    versionHash: string;
    tileUrlTemplate: string;
    generatedAt: string;
  };
  previous?: {
    versionHash: string;
    tileUrlTemplate: string;
    generatedAt: string;
  } | null;
  layers?: Array<{ id: string; geometryType: "fill" | "line"; sourceLayer: string }>;
};

export type MapViewportBounds = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export function pickTilesForViewport(manifest: MapTileManifest | null, bounds: MapViewportBounds): MapTileManifestEntry[] {
  if (!manifest) return [];
  return manifest.entries.filter((entry) => {
    const overlapsLon = entry.minLon <= bounds.maxLon && entry.maxLon >= bounds.minLon;
    const overlapsLat = entry.minLat <= bounds.maxLat && entry.maxLat >= bounds.minLat;
    return overlapsLon && overlapsLat;
  });
}

export async function fetchMapTileManifest(url = "/geo/tiles/manifest.json"): Promise<MapTileManifest | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const json = (await res.json()) as MapTileManifest;
    if (!json) return null;
    if (!Array.isArray(json.entries)) {
      json.entries = [];
    }
    return json;
  } catch {
    return null;
  }
}

