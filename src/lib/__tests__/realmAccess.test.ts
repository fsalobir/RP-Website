import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/roles", () => ({
  getRoleContext: vi.fn(),
}));

import { getRoleContext } from "@/lib/roles";
import { canAccessRealm, ensureRealmAccess } from "@/lib/realmAccess";

describe("realmAccess", () => {
  it("autorise admin partout", async () => {
    vi.mocked(getRoleContext).mockResolvedValue({ userId: "u1", role: "admin", realmIds: [] });
    await expect(canAccessRealm("r1")).resolves.toBe(true);
  });

  it("autorise joueur seulement sur ses royaumes", async () => {
    vi.mocked(getRoleContext).mockResolvedValue({ userId: "u2", role: "player", realmIds: ["r2"] });
    await expect(canAccessRealm("r2")).resolves.toBe(true);
    await expect(canAccessRealm("r3")).resolves.toBe(false);
  });

  it("refuse visiteur", async () => {
    vi.mocked(getRoleContext).mockResolvedValue({ userId: null, role: "visitor", realmIds: [] });
    await expect(ensureRealmAccess("r1")).resolves.toEqual({ error: "Accès refusé à ce royaume." });
  });
});

