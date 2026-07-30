import { describe, expect, it } from "vitest";
import { filterAdminNavigation } from "@/lib/adminNavigation";

describe("filterAdminNavigation", () => {
  it("cherche sans tenir compte des accents", () => {
    expect(filterAdminNavigation("evenements ia").map((item) => item.href)).toContain("/admin/event-ia");
  });

  it("combine plusieurs mots-clés", () => {
    expect(filterAdminNavigation("relations pays").map((item) => item.href)).toContain(
      "/admin/regles?domaine=diplomatie"
    );
  });
});
