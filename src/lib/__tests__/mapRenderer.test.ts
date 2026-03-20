import { describe, expect, it } from "vitest";
import { getEffectiveMapRenderer, isCanaryUser, resolveEffectiveRenderer } from "@/lib/mapRenderer";

describe("mapRenderer rollout", () => {
  it("garde SVG quand le rollout est off", () => {
    const res = resolveEffectiveRenderer("mj", {
      requested: "webgl",
      stage: "off",
      forceSvg: false,
    });
    expect(res.effective).toBe("svg");
    expect(res.reason).toBe("rollout-off");
  });

  it("active WebGL pour MJ en mj-only", () => {
    const res = resolveEffectiveRenderer("mj", {
      requested: "webgl",
      stage: "mj-only",
      forceSvg: false,
    });
    expect(res.effective).toBe("webgl");
  });

  it("garde public en SVG en mj-only", () => {
    const res = resolveEffectiveRenderer("public", {
      requested: "webgl",
      stage: "mj-only",
      forceSvg: false,
    });
    expect(res.effective).toBe("svg");
  });

  it("respecte le canary public", () => {
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
    expect(off.effective).toBe("svg");
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

  it("hash canary reste déterministe", () => {
    expect(isCanaryUser("stable-user", 50)).toBe(isCanaryUser("stable-user", 50));
  });

  it("getEffectiveMapRenderer délègue avec mode public par défaut", () => {
    const viaHelper = getEffectiveMapRenderer({ userKey: "k" });
    const direct = resolveEffectiveRenderer("public", { userKey: "k" });
    expect(viaHelper.effective).toBe(direct.effective);
    expect(viaHelper.reason).toBe(direct.reason);
  });
});
