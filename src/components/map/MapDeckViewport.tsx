"use client";

import { forwardRef, useCallback, useMemo, useRef } from "react";
import DeckGL from "@deck.gl/react";
import { MapController, MapView } from "@deck.gl/core";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM } from "@/lib/mapZoomLevels";
import {
  mapZoomToDeckZoom,
  toDeckViewState,
  deckViewStateToMapView,
  type DeckMapViewState,
} from "@/lib/mapDeckViewState";

const deckMapView = new MapView({ repeat: true });

export type MapDeckViewportProps = {
  width: number;
  height: number;
  mapView: { center: [number, number]; zoom: number };
  layers: Layer[];
  onMapViewChange: (next: { center: [number, number]; zoom: number }, opts?: { sync?: boolean }) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  onDeckClick?: (info: PickingInfo) => boolean | void;
  getTooltip?: (info: PickingInfo) => null | object;
};

export const MapDeckViewport = forwardRef<any, MapDeckViewportProps>(function MapDeckViewport(
  {
    width,
    height,
    mapView,
    layers,
    onMapViewChange,
    onInteractionStart,
    onInteractionEnd,
    onDeckClick,
    getTooltip,
  },
  ref
) {
  const viewState = useMemo(() => toDeckViewState(mapView.center, mapView.zoom), [mapView.center, mapView.zoom]);
  const wasInteractingRef = useRef(false);

  const minZ = mapZoomToDeckZoom(MAP_MIN_ZOOM);
  const maxZ = mapZoomToDeckZoom(MAP_MAX_ZOOM);

  const handleViewStateChange = useCallback(
    (params: {
      viewState: DeckMapViewState;
      interactionState?: { isDragging?: boolean; isPanning?: boolean; isZooming?: boolean; isRotating?: boolean };
    }) => {
      const vs = params.viewState;
      const interactionState = params.interactionState;
      const interacting = Boolean(
        interactionState?.isDragging ||
          interactionState?.isPanning ||
          interactionState?.isZooming ||
          interactionState?.isRotating
      );

      const next = deckViewStateToMapView(vs);

      if (interacting && !wasInteractingRef.current) {
        wasInteractingRef.current = true;
        onInteractionStart?.();
      }
      onMapViewChange(next, { sync: !interacting });
      if (!interacting && wasInteractingRef.current) {
        wasInteractingRef.current = false;
        onInteractionEnd?.();
      }
    },
    [onMapViewChange, onInteractionStart, onInteractionEnd]
  );

  return (
    <DeckGL
      ref={ref}
      width={width}
      height={height}
      views={deckMapView}
      viewState={viewState}
      onViewStateChange={handleViewStateChange as any}
      controller={
        {
          type: MapController,
          dragPan: true,
          scrollZoom: true,
          touchZoom: true,
          touchRotate: false,
          doubleClickZoom: true,
          minZoom: minZ,
          maxZoom: maxZ,
        } as any
      }
      layers={layers}
      onClick={onDeckClick as any}
      getTooltip={getTooltip as any}
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
});
