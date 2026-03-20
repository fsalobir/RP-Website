import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_DISPLAY_CONFIG, parseMapDisplayConfigSnapshot, sanitizeMapDisplayConfig } from "@/lib/mapDisplayConfig";

describe("sanitizeMapDisplayConfig", () => {
  it("applique les bornes et défauts", () => {
    const input = {
      cityIconMaxPx: -12,
      zoomRefWorld: "abc",
      routeStrokeLocalPx: 3,
      routeLabelFontSizePx: 0,
      routeSinuosityNationalPct: 999,
    };
    const out = sanitizeMapDisplayConfig(input);
    expect(out.cityIconMaxPx).toBe(DEFAULT_MAP_DISPLAY_CONFIG.cityIconMaxPx);
    expect(out.zoomRefWorld).toBe(DEFAULT_MAP_DISPLAY_CONFIG.zoomRefWorld);
    expect(out.routeStrokeLocalPx).toBe(0.5);
    expect(out.routeLabelFontSizePx).toBe(DEFAULT_MAP_DISPLAY_CONFIG.routeLabelFontSizePx);
    expect(out.routeSinuosityNationalPct).toBe(100);
  });

  it("initialise les règles de zoom par défaut (paliers binaires)", () => {
    const out = sanitizeMapDisplayConfig({});
    expect(out.zoomLevelRules.province.visibility.routes).toBe(true);
    expect(out.zoomLevelRules.province.visibility.realmLabels).toBe(true);
    expect(out.zoomLevelRules.nation.visibility.realmLabels).toBe(true);
    expect(out.zoomLevelRules.continent.visibility.routes).toBe(false);
    expect(out.zoomLevelRules.monde.visibility.cities).toBe(false);
    expect(out.zoomLevelRules.monde.visibility.rivers).toBe(false);
  });
});

describe("parseMapDisplayConfigSnapshot", () => {
  it("retourne version 0 quand absent", () => {
    const out = parseMapDisplayConfigSnapshot(null);
    expect(out.version).toBe(0);
    expect(out.config).toEqual(DEFAULT_MAP_DISPLAY_CONFIG);
  });

  it("supporte format enveloppé avec version", () => {
    const out = parseMapDisplayConfigSnapshot({
      version: 7,
      config: { cityIconMaxPx: 22 },
    });
    expect(out.version).toBe(7);
    expect(out.config.cityIconMaxPx).toBe(22);
  });

  it("applique fallback legacy quand zoomLevelRules absent", () => {
    const out = parseMapDisplayConfigSnapshot({
      version: 2,
      config: { routeStrokeLocalPx: 0.08 },
    });
    expect(out.config.routeStrokeLocalPx).toBe(0.08);
    expect(out.config.zoomLevelRules.nation.scale.routes).toBeGreaterThan(0);
  });
});

