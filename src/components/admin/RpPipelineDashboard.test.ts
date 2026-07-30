import { describe, expect, it } from "vitest";
import { isPipelineActionActive } from "./RpPipelineDashboard";

describe("isPipelineActionActive", () => {
  it("sépare le travail en cours des actions terminées", () => {
    expect(isPipelineActionActive({ executionStatus: "pending" })).toBe(true);
    expect(isPipelineActionActive({ executionStatus: "completed" })).toBe(false);
    expect(isPipelineActionActive({ executionStatus: "cancelled" })).toBe(false);
  });
});
