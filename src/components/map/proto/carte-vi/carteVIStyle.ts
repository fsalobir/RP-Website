import type { StyleSpecification } from "maplibre-gl";

/**
 * MapLibre normalizes tile URLs; a vector source with `tiles: []` but layers still
 * pointing at it can throw (e.g. `.replace` on undefined). When no MVT URL is ready,
 * we only mount background + raster fallback — no empty vector source.
 */
export function createCarteVIStyle(tileUrlTemplate: string | null): StyleSpecification {
  const hasMvt = typeof tileUrlTemplate === "string" && tileUrlTemplate.length > 0;

  const sources: StyleSpecification["sources"] = {
    local_world: {
      type: "image",
      url: "/images/maps/world-map-equirectangular-v3.png?v=4",
      coordinates: [
        [-180, 85],
        [180, 85],
        [180, -85],
        [-180, -85],
      ],
    },
  };

  if (hasMvt) {
    sources.carte_vi_tiles = {
      type: "vector",
      tiles: [tileUrlTemplate],
      minzoom: 0,
      maxzoom: 8,
    };
  }

  const layers: StyleSpecification["layers"] = [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0b1220" },
    },
    {
      id: "fallback-raster",
      type: "raster",
      source: "local_world",
      paint: { "raster-opacity": hasMvt ? 0.08 : 0.75 },
    },
  ];

  if (hasMvt) {
    layers.push(
      {
        id: "water-lakes",
        type: "fill",
        source: "carte_vi_tiles",
        "source-layer": "water_lakes",
        paint: { "fill-color": "#1d4ed8", "fill-opacity": 0.45 },
      },
      {
        id: "provinces-fill",
        type: "fill",
        source: "carte_vi_tiles",
        "source-layer": "provinces_fill",
        paint: {
          "fill-color": ["coalesce", ["get", "color_hex"], "#334155"],
          "fill-opacity": 0.65,
        },
      },
      {
        id: "provinces-border",
        type: "line",
        source: "carte_vi_tiles",
        "source-layer": "provinces_border",
        paint: { "line-color": "#e2e8f0", "line-width": 1.4, "line-opacity": 0.6 },
      },
      {
        id: "water-rivers",
        type: "line",
        source: "carte_vi_tiles",
        "source-layer": "water_rivers",
        paint: { "line-color": "#60a5fa", "line-width": 1.2, "line-opacity": 0.8 },
      }
    );
  }

  return { version: 8, sources, layers };
}
