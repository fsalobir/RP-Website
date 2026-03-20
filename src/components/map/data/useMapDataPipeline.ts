"use client";

import { useEffect, useState } from "react";
import { fetchMapTileManifest, type MapTileManifest } from "@/lib/mapBinaryTilePipeline";

export function useMapDataPipeline() {
  const [tileManifest, setTileManifest] = useState<MapTileManifest | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMapTileManifest().then((manifest) => {
      if (!alive) return;
      setTileManifest(manifest);
    });
    return () => {
      alive = false;
    };
  }, []);

  return {
    tileManifest,
  };
}

