"use client";

import { memo, type ReactNode } from "react";

type HydroLike = { lakes?: unknown; rivers?: unknown } | null;

export type MapSvgGeographyLayersProps = {
  hydro: HydroLike;
  shouldRenderSvgRivers: boolean;
  hydroNationProvinceDragLite: boolean;
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
      {Boolean(hydro?.lakes) && shouldRenderSvgRivers && showHydro && (
        <g
          style={{
            pointerEvents: "none",
            /** Binaire par palier (showHydro) ; pas d’atténuation liée au zoom ou au mode mobile. */
            opacity: hydroNationProvinceDragLite ? 0.05 : lakesOpacity,
            transition: prefersReducedMotion ? "none" : "opacity 200ms ease-out",
          }}
        >
          {renderedLakes}
        </g>
      )}

      {Boolean(hydro?.rivers) && shouldRenderSvgRivers && showRivers && (
        <g
          style={{
            opacity: hydroNationProvinceDragLite ? 0.06 : riversOpacity,
            transition: prefersReducedMotion ? "none" : "opacity 200ms ease-out",
            pointerEvents: "none",
          }}
        >
          {renderedRivers}
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
