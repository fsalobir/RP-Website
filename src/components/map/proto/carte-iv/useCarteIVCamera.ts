import { useCallback, useState } from "react";

export type CarteIVCamera = {
  scale: number;
  tx: number;
  ty: number;
};

export function useCarteIVCamera(initial: CarteIVCamera = { scale: 1, tx: 0, ty: 0 }) {
  const [camera, setCamera] = useState<CarteIVCamera>(initial);

  const panBy = useCallback((dx: number, dy: number) => {
    setCamera((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
  }, []);

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    setCamera((prev) => {
      const nextScale = clamp(prev.scale * factor, 0.35, 6);
      const wx = (sx - prev.tx) / prev.scale;
      const wy = (sy - prev.ty) / prev.scale;
      return {
        scale: nextScale,
        tx: sx - wx * nextScale,
        ty: sy - wy * nextScale,
      };
    });
  }, []);

  return { camera, setCamera, panBy, zoomAt };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
