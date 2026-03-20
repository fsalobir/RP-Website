import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Isolated file: uses dynamic import after vi.stubEnv + resetModules so we do not
 * poison the main mapRenderer.test.ts module cache.
 */
describe("mapRenderer — normalisation chaînes vides (Vercel)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("NEXT_PUBLIC_MAP_RENDERER vide → webgl", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_RENDERER", "");
    vi.resetModules();
    const { getRequestedMapRenderer } = await import("@/lib/mapRenderer");
    expect(getRequestedMapRenderer()).toBe("webgl");
  });

  it("NEXT_PUBLIC_MAP_RENDERER_ROLLOUT vide → all (pas off)", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_RENDERER_ROLLOUT", "");
    vi.resetModules();
    const { getMapRendererRolloutStage } = await import("@/lib/mapRenderer");
    expect(getMapRendererRolloutStage()).toBe("all");
  });

  it("getMapEnvBuildWarnings liste les clés vides", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_RENDERER", "");
    vi.resetModules();
    const { getMapEnvBuildWarnings } = await import("@/lib/mapRenderer");
    const w = getMapEnvBuildWarnings();
    expect(w.some((s) => s.includes("NEXT_PUBLIC_MAP_RENDERER"))).toBe(true);
  });
});
