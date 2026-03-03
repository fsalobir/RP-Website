declare module "react-simple-maps" {
  import type { FC } from "react";
  export const ZoomableGroup: FC<{
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    translateExtent?: [[number, number], [number, number]];
    filterZoomEvent?: (e: unknown) => boolean;
    onMoveStart?: (pos: { coordinates: [number, number]; zoom: number }) => void;
    onMove?: (pos: { x: number; y: number; k: number; dragging: boolean }) => void;
    onMoveEnd?: (pos: { coordinates: [number, number]; zoom: number }) => void;
    className?: string;
    children?: React.ReactNode;
  }>;
  export const ComposableMap: FC<{
    projection?: string;
    projectionConfig?: { scale?: number };
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }>;
  export const Geographies: FC<{
    geography: object;
    children?: (ctx: {
      geographies: unknown[];
      outline?: unknown;
      borders?: unknown;
      path?: (d: unknown) => string;
      projection?: unknown;
    }) => React.ReactNode;
    parseGeographies?: (features: unknown) => unknown;
    className?: string;
  }>;
  export const Geography: FC<{
    geography: unknown;
    style?: { default?: React.CSSProperties; hover?: React.CSSProperties; pressed?: React.CSSProperties };
    onClick?: () => void;
    onMouseMove?: (e: React.MouseEvent) => void;
    onMouseLeave?: () => void;
    title?: string;
    className?: string;
  }>;
}
