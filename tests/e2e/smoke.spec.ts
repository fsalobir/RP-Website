import { expect, test } from "@playwright/test";

test.describe("Smoke", () => {
  test("accueil charge", async ({ page }) => {
    await page.goto("/");
    // On vérifie au minimum qu'il n'y a pas d'erreur 500 et que la page rend du contenu.
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("body")).toContainText(/.+/);
  });

  test("une page pays publique s'affiche sans 500", async ({ page }) => {
    await page.goto("/");

    // Prend le premier lien vers /pays/<slug> s'il existe.
    const firstCountryLink = page.locator("a[href^='/pays/']").first();
    const count = await firstCountryLink.count();
    test.skip(count === 0, "Aucun lien /pays/* trouvé sur l'accueil (données manquantes ?).");

    const href = await firstCountryLink.getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);
    await expect(page.locator("body")).toContainText(/.+/);
  });

  test("/admin redirige les utilisateurs non connectés", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/admin\/connexion/);
    await expect(page).toHaveURL(/\/admin\/connexion/);
  });
});

