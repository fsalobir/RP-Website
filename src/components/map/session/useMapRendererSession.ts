"use client";

import { useMemo, useState } from "react";
import { resolveEffectiveRenderer, type MapDisplayMode } from "@/lib/mapRenderer";
import { getMapQualityTierFlag, isMapMobileHardModeEnabled } from "@/lib/featureFlags";
import { createMapRendererAdapter } from "@/lib/mapRendererAdapter";

export function useMapRendererSession(mode: MapDisplayMode) {
  const [rendererUserKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const key = "map_renderer_user_key_v1";
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const generated = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, generated);
      return generated;
    } catch {
      return null;
    }
  });

  const rendererInfo = useMemo(() => resolveEffectiveRenderer(mode, { userKey: rendererUserKey }), [mode, rendererUserKey]);
  const qualityTier = useMemo(() => getMapQualityTierFlag(), []);
  const mobileHardMode = useMemo(() => isMapMobileHardModeEnabled(), []);
  const adapter = useMemo(() => createMapRendererAdapter({ rendererInfo }), [rendererInfo]);

  return {
    rendererInfo,
    qualityTier,
    mobileHardMode,
    adapter,
  };
}

