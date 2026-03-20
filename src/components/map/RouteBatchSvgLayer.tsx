"use client";

import React, { useMemo } from "react";
import type { RouteTier } from "@/lib/routes";

type TierStyle = {
  strokeWidth: number;
  stroke: string;
};

type Props = {
  paths: Array<{ id: string; tier: string; d: string }>;
  routeTierStyle: Record<RouteTier, TierStyle>;
  routeSizeFactor: number;
  opacity: number;
};

/**
 * Merges route stroke geometry into at most 3 SVG paths (one per tier) to reduce DOM node count.
 * Interaction must be handled separately (e.g. picking in parent).
 */
export function RouteBatchSvgLayer({ paths, routeTierStyle, routeSizeFactor, opacity }: Props) {
  const merged = useMemo(() => {
    const tiers: RouteTier[] = ["national", "regional", "local"];
    const out: Partial<Record<RouteTier, string>> = {};
    for (const t of tiers) {
      const ds = paths.filter((p) => (p.tier as string) === t).map((p) => p.d);
      if (ds.length) out[t] = ds.join(" ");
    }
    return out;
  }, [paths]);

  if (paths.length === 0) return null;

  return (
    <g opacity={opacity} style={{ pointerEvents: "none" }}>
      {(["national", "regional", "local"] as const).map((tier) => {
        const d = merged[tier];
        if (!d) return null;
        const style = routeTierStyle[tier] ?? routeTierStyle.local;
        const visibleStroke = style.strokeWidth * routeSizeFactor;
        return (
          <path
            key={`batch-route-tier-${tier}`}
            d={d}
            fill="none"
            stroke={style.stroke}
            strokeWidth={visibleStroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}
