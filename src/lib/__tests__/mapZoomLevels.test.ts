import { describe, expect, it } from "vitest";
import {
  getCurrentZoomLevel,
  getRouteSimplificationEpsilonForZoomLevel,
  getZoomLevelById,
} from "@/lib/mapZoomLevels";

describe("mapZoomLevels", () => {
  it("retourne les paliers attendus", () => {
    expect(getCurrentZoomLevel(1.05)).toBe("monde");
    expect(getCurrentZoomLevel(2.4)).toBe("continent");
    expect(getCurrentZoomLevel(6)).toBe("nation");
    expect(getCurrentZoomLevel(12)).toBe("province");
  });

  it("associe un epsilon de simplification cohérent", () => {
    expect(getRouteSimplificationEpsilonForZoomLevel("province")).toBe(0.1);
    expect(getRouteSimplificationEpsilonForZoomLevel("nation")).toBe(0.25);
    expect(getRouteSimplificationEpsilonForZoomLevel("continent")).toBe(0.6);
    expect(getRouteSimplificationEpsilonForZoomLevel("monde")).toBe(0.6);
  });

  it("expose un zoom de référence par palier", () => {
    expect(getZoomLevelById("province").zoom).toBeGreaterThan(getZoomLevelById("nation").zoom);
  });
});

