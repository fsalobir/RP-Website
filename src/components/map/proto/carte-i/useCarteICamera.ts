import { useRef } from "react";

export type CarteICameraState = {
  scale: number;
  translateX: number;
  translateY: number;
};

export const CARTE_I_MIN_SCALE = 0.5;
export const CARTE_I_MAX_SCALE = 8;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useCarteICamera(initial?: Partial<CarteICameraState>) {
  const cameraRef = useRef<CarteICameraState>({
    scale: initial?.scale ?? 1,
    translateX: initial?.translateX ?? 0,
    translateY: initial?.translateY ?? 0,
  });

  return cameraRef;
}
