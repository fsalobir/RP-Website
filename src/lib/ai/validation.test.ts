import { describe, expect, it } from "vitest";
import { parsePlayerAssistantRequest } from "./validation";

describe("requête du Secrétaire", () => {
  it("conserve au plus vingt messages et mille caractères", () => {
    expect(() => parsePlayerAssistantRequest({ message: "x".repeat(1001), history: [] })).toThrow(/1 000/);
    expect(() => parsePlayerAssistantRequest({
      message: "Budget ?",
      history: Array.from({ length: 21 }, () => ({ role: "user", content: "question" })),
    })).toThrow(/historique/i);
  });

  it("neutralise une page non conforme", () => {
    expect(parsePlayerAssistantRequest({ message: "Budget ?", page: "https://example.com" }).page).toBe("/");
  });
});
