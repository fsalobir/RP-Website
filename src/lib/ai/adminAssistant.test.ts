import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { classifyAdminRequest } from "./adminAssistant";

describe("routage de l'assistant admin", () => {
  it("sépare lecture, action de jeu et diagnostic du code", () => {
    expect(classifyAdminRequest("Quel est le PIB de la Suisse ?")).toEqual({ requestKind: "game_read", complexity: "simple" });
    expect(classifyAdminRequest("Modifie le PIB de la Suisse")).toEqual({ requestKind: "game_action", complexity: "simple" });
    expect(classifyAdminRequest("Fais une analyse complète de plusieurs erreurs du build TypeScript")).toEqual({ requestKind: "code_read", complexity: "complex" });
  });
});
