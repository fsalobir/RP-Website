import { expect, test } from "@playwright/test";

test.describe("Assistants IA — accès non authentifié", () => {
  test("refuse les trois API privées", async ({ request }) => {
    const player = await request.post("/api/ai/player", { data: { message: "PIB ?", history: [], page: "/" } });
    const admin = await request.get("/api/ai/admin");
    const worker = await request.post("/api/ai/worker", {
      headers: { Authorization: "Bearer jeton_invalide" },
      data: { operation: "heartbeat" },
    });

    expect(player.status()).toBe(401);
    expect(admin.status()).toBe(403);
    expect(worker.status()).toBe(401);
  });

  test("garde le Secrétaire masqué avant activation", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Ouvrir le Secrétaire" })).toHaveCount(0);
  });
});
