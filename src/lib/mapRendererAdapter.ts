import type { EffectiveRendererResult } from "@/lib/mapRenderer";

export type MapLayerKind = "provinces" | "borders" | "rivers" | "routes" | "labels" | "points";

export type MapRendererAdapterOptions = {
  rendererInfo: EffectiveRendererResult;
};

export function createMapRendererAdapter(opts: MapRendererAdapterOptions) {
  const isWebgl = opts.rendererInfo.effective === "webgl";
  /** WebGL path: geography + routes + markers are drawn by DeckGL (single viewState). */
  const isZeroSvg = isWebgl;

  function shouldRenderSvgLayer(_kind: MapLayerKind): boolean {
    void _kind;
    if (!isWebgl) return true;
    return false;
  }

  return {
    isWebgl,
    isZeroSvg,
    shouldRenderSvgLayer,
  };
}

