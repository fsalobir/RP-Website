import { describe, expect, it } from "vitest";
import { getEffectiveMapRenderer, isCanaryUser, resolveEffectiveRenderer } from "@/lib/mapRenderer";

describe("mapRenderer — WebGL par défaut pour tous", () => {
  it("WebGL demandé + rollout off (opts) → WebGL quand même", () => {
    const res = resolveEffectiveRenderer("mj", {
      requested: "webgl",
      stage: "off",
      forceSvg: false,
    });
    expect(res.effective).toBe("webgl");
    expect(res.reason).toBe("webgl-default");
  });

  it("WebGL demandé + mj-only → public aussi en WebGL", () => {
    const res = resolveEffectiveRenderer("public", {
      requested: "webgl",
      stage: "mj-only",
      forceSvg: false,
    });
    expect(res.effective).toBe("webgl");
    expect(res.reason).toBe("webgl-default");
  });

  it("WebGL demandé + public-canary → public toujours WebGL (canary ignoré pour le renderer)", () => {
    const on = resolveEffectiveRenderer("public", {
      requested: "webgl",
      stage: "public-canary",
      forceSvg: false,
      userKey: "alpha",
      canaryPct: 100,
    });
    const off = resolveEffectiveRenderer("public", {
      requested: "webgl",
      stage: "public-canary",
      forceSvg: false,
      userKey: "alpha",
      canaryPct: 0,
    });
    expect(on.effective).toBe("webgl");
    expect(off.effective).toBe("webgl");
    expect(on.reason).toBe("webgl-default");
  });

  it("applique toujours le kill-switch FORCE_SVG", () => {
    const res = resolveEffectiveRenderer("mj", {
      requested: "webgl",
      stage: "all",
      forceSvg: true,
    });
    expect(res.effective).toBe("svg");
    expect(res.reason).toBe("force-svg");
  });

  it("hash canary reste déterministe (utilitaire conservé)", () => {
    expect(isCanaryUser("stable-user", 50)).toBe(isCanaryUser("stable-user", 50));
  });

  it("getEffectiveMapRenderer délègue avec mode public par défaut", () => {
    const viaHelper = getEffectiveMapRenderer({ userKey: "k" });
    const direct = resolveEffectiveRenderer("public", { userKey: "k" });
    expect(viaHelper.effective).toBe(direct.effective);
    expect(viaHelper.reason).toBe(direct.reason);
  });
});
