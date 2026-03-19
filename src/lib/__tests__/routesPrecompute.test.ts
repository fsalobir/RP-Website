import { describe, expect, it } from "vitest";
import { buildRouteLodVariants, pickRouteLodByZoom } from "@/lib/routesPrecompute";

describe("routesPrecompute", () => {
  it("génère des variantes LOD cohérentes", () => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 20; i += 1) points.push([i * 0.2, Math.sin(i / 2)]);
    const lod = buildRouteLodVariants(points);
    expect(lod.high.length).toBeLessThanOrEqual(points.length);
    expect(lod.mid.length).toBeLessThanOrEqual(lod.high.length);
    expect(lod.low.length).toBeLessThanOrEqual(lod.mid.length);
    expect(pickRouteLodByZoom(lod, 1).length).toBe(lod.low.length);
    expect(pickRouteLodByZoom(lod, 3).length).toBe(lod.mid.length);
    expect(pickRouteLodByZoom(lod, 10).length).toBe(lod.high.length);
  });
});

