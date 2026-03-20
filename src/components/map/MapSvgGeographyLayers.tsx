"use client";

import { memo, type ReactNode } from "react";

type HydroLike = { lakes?: unknown; rivers?: unknown } | null;

export type MapSvgGeographyLayersProps = {
  hydro: HydroLike;
  shouldRenderSvgRivers: boolean;
  hydroNationProvinceDragLite: boolean;
  lakesLocked: boolean;
  riversLocked: boolean;
  showHydro: boolean;
  showRivers: boolean;
  lakesOpacity: number;
  riversOpacity: number;
  isInteractionLite: boolean;
  isMobilePerf: boolean;
  reduceHeavyEffects: boolean;
  prefersReducedMotion: boolean;
  hideHeavyGeoWhileDragging: boolean;
  showSvgProvinces: boolean;
  showSvgRealmBorders: boolean;
  renderedLakes: ReactNode;
  renderedRivers: ReactNode;
  renderedRegions: ReactNode;
  renderedRealmBoundaries: ReactNode;
};

/**
 * Calques hydro + provinces + frontières royaumes, isolés pour limiter les re-renders
 * quand le parent change sans toucher à ces props (memo).
 */
export const MapSvgGeographyLayers = memo(function MapSvgGeographyLayers({
  hydro,
  shouldRenderSvgRivers,
  hydroNationProvinceDragLite,
  lakesLocked,
  riversLocked,
  showHydro,
  showRivers,
  lakesOpacity,
  riversOpacity,
  isInteractionLite,
  isMobilePerf,
  reduceHeavyEffects,
  prefersReducedMotion,
  hideHeavyGeoWhileDragging,
  showSvgProvinces,
  showSvgRealmBorders,
  renderedLakes,
  renderedRivers,
  renderedRegions,
  renderedRealmBoundaries,
}: MapSvgGeographyLayersProps) {
  return (
    <g>
      {Boolean(hydro?.lakes) && shouldRenderSvgRivers && (
        <g
          style={{
            pointerEvents: "none",
            opacity: hydroNationProvinceDragLite
              ? 0.05
              : lakesLocked
                ? 1
                : isInteractionLite || isMobilePerf || reduceHeavyEffects
                  ? Math.max(0.14, lakesOpacity * 0.25)
                  : lakesOpacity,
            transition: lakesLocked || prefersReducedMotion ? "none" : "opacity 200ms ease-out",
          }}
        >
          {(lakesLocked || showHydro) && renderedLakes}
        </g>
      )}

      {Boolean(hydro?.rivers) && shouldRenderSvgRivers && (
        <g
          style={{
            opacity: hydroNationProvinceDragLite
              ? 0.06
              : riversLocked
                ? 1
                : isInteractionLite || isMobilePerf || reduceHeavyEffects
                  ? Math.max(0.16, riversOpacity * 0.3)
                  : riversOpacity,
            transition: riversLocked || prefersReducedMotion ? "none" : "opacity 200ms ease-out",
            pointerEvents: "none",
          }}
        >
          {(riversLocked || showRivers) && renderedRivers}
        </g>
      )}

      {showSvgProvinces ? (
        <g
          style={{
            visibility: hideHeavyGeoWhileDragging ? "hidden" : "visible",
            pointerEvents: hideHeavyGeoWhileDragging ? "none" : "auto",
          }}
        >
          {renderedRegions}
        </g>
      ) : null}
      {showSvgRealmBorders ? (
        <g
          style={{
            visibility: hideHeavyGeoWhileDragging ? "hidden" : "visible",
            pointerEvents: "none",
          }}
          opacity={isInteractionLite || reduceHeavyEffects ? 0.38 : 1}
        >
          {renderedRealmBoundaries}
        </g>
      ) : null}
    </g>
  );
});
