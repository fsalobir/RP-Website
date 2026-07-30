import { describe, expect, it } from "vitest";
import { matchesAdminListFilters, normalizeAdminSearch } from "./adminListFilters";

describe("admin list filters", () => {
  it("applies the status filter even when the search is empty", () => {
    expect(matchesAdminListFilters("pending", "accepted", "", [])).toBe(false);
    expect(matchesAdminListFilters("pending", "pending", "", [])).toBe(true);
  });

  it("normalizes human search terms", () => {
    expect(normalizeAdminSearch("  Événement — Russie  ")).toBe("evenement russie");
  });
});
