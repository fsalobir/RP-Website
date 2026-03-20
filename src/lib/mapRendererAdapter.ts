import type { EffectiveRendererResult } from "@/lib/mapRenderer";

export type MapLayerKind = "provinces" | "borders" | "rivers" | "routes" | "labels" | "points";

export type MapRendererAdapterOptions = {
  rendererInfo: EffectiveRendererResult;
  zeroSvgSpikeEnabled: boolean;
};

export function createMapRendererAdapter(opts: MapRendererAdapterOptions) {
  const isWebgl = opts.rendererInfo.effective === "webgl";
  const isZeroSvg = isWebgl && opts.zeroSvgSpikeEnabled;

  function shouldRenderSvgLayer(layer: MapLayerKind): boolean {
    if (!isWebgl) return true;
    if (!isZeroSvg) return true;
    if (layer === "provinces" || layer === "borders" || layer === "rivers" || layer === "routes" || layer === "labels" || layer === "points") {
      return false;
    }
    return true;
  }

  return {
    isWebgl,
    isZeroSvg,
    shouldRenderSvgLayer,
  };
}

