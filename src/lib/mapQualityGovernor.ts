/**
 * Adaptive quality governor: reduces label factor and widens "lite" interaction when frame gaps spike.
 */

export type MapQualityGovernorState = {
  /** Multiplier for route label caps (0.35–1.25). */
  labelFactor: number;
  /** Extra margin factor for route build bounds (smaller = fewer routes built). */
  routeBuildMarginFactor: number;
};

const DEFAULT_STATE: MapQualityGovernorState = {
  labelFactor: 1,
  routeBuildMarginFactor: 1,
};

export function createMapQualityGovernor() {
  let stress = 0;
  let state: MapQualityGovernorState = { ...DEFAULT_STATE };

  function onFrameGapMs(gapMs: number) {
    const g = Math.min(gapMs, 120);
    if (g > 32) stress = Math.min(12, stress + 2);
    else if (g < 22) stress = Math.max(0, stress - 1);

    const labelFactor = Math.max(0.35, Math.min(1.25, 1 - stress * 0.055));
    const routeBuildMarginFactor = Math.max(0.65, Math.min(1, 1 - stress * 0.028));
    state = { labelFactor, routeBuildMarginFactor };
  }

  function reset() {
    stress = 0;
    state = { ...DEFAULT_STATE };
  }

  function getState(): MapQualityGovernorState {
    return state;
  }

  return { onFrameGapMs, reset, getState };
}
