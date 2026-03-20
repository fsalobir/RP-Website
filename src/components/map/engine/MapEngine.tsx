"use client";

export type MapEngineProps = {
  enabled: boolean;
  mode: "public" | "mj";
};

/**
 * Point d'entrée futur du renderer WebGL.
 * Intentionnellement minimal: évite un big-bang dans WorldMapClient
 * tout en donnant un ancrage clair pour les couches GPU.
 */
export function MapEngine({ enabled }: MapEngineProps) {
  if (!enabled) return null;
  return null;
}

