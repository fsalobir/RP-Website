import { expect, test } from "@playwright/test";

function expectOk(response: Awaited<ReturnType<import("@playwright/test").Page["goto"]>>) {
  expect(response, "Aucune réponse HTTP (serveur down ?)").toBeTruthy();
  // Note: Playwright peut retourner null sur certains types de navigation, mais ici on attend une page HTTP.
  if (!response) return;
  expect(response.status(), `Statut HTTP inattendu: ${response.status()}`).toBeGreaterThanOrEqual(200);
  expect(response.status(), `Statut HTTP inattendu: ${response.status()}`).toBeLessThan(400);
}

const SEEDED_COUNTRY_NAME_RE = /Alpha/;
const SEEDED_COUNTRY_SLUG = "alpha";

test.describe("Smoke", () => {
  test("Test 1 (Public) : / affiche la liste des pays (seed)", async ({ page }) => {
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expectOk(res);

    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("body")).toContainText(/.+/);
    // Résilience : on ne dépend pas d'une structure HTML exacte, juste du texte seedé.
    await expect(page.locator("body")).toContainText(SEEDED_COUNTRY_NAME_RE);
  });

  test("Test 2 (Pays) : /pays/[slug] seedé répond 200", async ({ page }) => {
    const res = await page.goto(`/pays/${SEEDED_COUNTRY_SLUG}`, { waitUntil: "domcontentloaded" });
    expectOk(res);

    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("body")).toContainText(/.+/);
    await expect(page.locator("body")).toContainText(SEEDED_COUNTRY_NAME_RE);
  });

  test("Test 3 (Admin) : /admin redirige vers /admin/connexion si non connecté", async ({ page }) => {
    const res = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    // Soit un 3xx, soit un 200 direct sur /admin/connexion selon la stratégie de redirection.
    expect(res, "Aucune réponse HTTP (serveur down ?)").toBeTruthy();

    await page.waitForURL(/\/admin\/connexion/);
    await expect(page).toHaveURL(/\/admin\/connexion/);
  });
});

