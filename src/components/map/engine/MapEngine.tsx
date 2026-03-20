"use client";

export type MapEngineProps = {
  enabled: boolean;
  mode: "public" | "mj";
};

/**
 * Point d’entrée optionnel pour une orchestration WebGL centralisée.
 *
 * Le rendu DeckGL effectif est dans `WorldMapClient` (`MapDeckViewport` + `buildWorldMapDeckLayers`).
 * Ce module reste un stub (`return null`).
 * Voir `docs/structural-perf-notes.md` et `docs/map-perf-runbook.md`.
 */
export function MapEngine({ enabled }: MapEngineProps) {
  if (!enabled) return null;
  return null;
}

