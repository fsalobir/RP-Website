import { expect, test } from "@playwright/test";

function expectOk(response: Awaited<ReturnType<import("@playwright/test").Page["goto"]>>) {
  expect(response, "Aucune réponse HTTP (serveur down ?)").toBeTruthy();
  // Note: Playwright peut retourner null sur certains types de navigation, mais ici on attend une page HTTP.
  if (!response) return;
  expect(response.status(), `Statut HTTP inattendu: ${response.status()}`).toBeGreaterThanOrEqual(200);
  expect(response.status(), `Statut HTTP inattendu: ${response.status()}`).toBeLessThan(400);
}

const SEEDED_COUNTRY_NAME_RE = /Alpha|Bravo|Charlie/;

test.describe("Smoke", () => {
  test("Public (/) : répond 200 et affiche une liste de pays (seed)", async ({ page }) => {
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expectOk(res);

    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("body")).toContainText(/.+/);
    // Résilience : on ne dépend pas d'une structure HTML exacte, juste du texte seedé.
    await expect(page.locator("body")).toContainText(SEEDED_COUNTRY_NAME_RE);
  });

  test("Classement (/classement) : la page se charge correctement", async ({ page }) => {
    const res = await page.goto("/classement", { waitUntil: "domcontentloaded" });
    expectOk(res);

    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("body")).toContainText(/.+/);
    // Optionnel mais utile : vérifie qu'au moins un pays seed est visible dans le classement.
    await expect(page.locator("body")).toContainText(SEEDED_COUNTRY_NAME_RE);
  });

  test("Fiche Pays (/pays/[slug]) : une fiche seed s'affiche sans 500", async ({ page }) => {
    // Résilience : on ne dépend pas d'un slug "en dur" (qui peut changer selon la normalisation côté DB/app).
    // On repère un lien vers /pays/* depuis l'accueil, en se basant sur les noms seed.
    const homeRes = await page.goto("/", { waitUntil: "domcontentloaded" });
    expectOk(homeRes);

    const seededCountryLink = page
      .locator("a[href^='/pays/']")
      .filter({ hasText: SEEDED_COUNTRY_NAME_RE })
      .first();

    const linkCount = await seededCountryLink.count();
    test.skip(linkCount === 0, "Aucun lien /pays/* vers un pays seed trouvé (seed non chargé ?).");

    const href = await seededCountryLink.getAttribute("href");
    expect(href, "Lien /pays/* sans href").toBeTruthy();

    const res = await page.goto(href!, { waitUntil: "domcontentloaded" });
    expectOk(res);

    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("body")).toContainText(/.+/);
    await expect(page.locator("body")).toContainText(SEEDED_COUNTRY_NAME_RE);
  });

  test("Admin protégé (/admin) : sans session redirige vers /admin/connexion", async ({ page }) => {
    const res = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    // Soit un 3xx, soit un 200 direct sur /admin/connexion selon la stratégie de redirection.
    expect(res, "Aucune réponse HTTP (serveur down ?)").toBeTruthy();

    await page.waitForURL(/\/admin\/connexion/);
    await expect(page).toHaveURL(/\/admin\/connexion/);
  });
});

