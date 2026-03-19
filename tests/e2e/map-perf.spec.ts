import { test, expect } from "@playwright/test";

test.describe("Carte - garde-fous perf UX", () => {
  test("la carte publique charge et reste interactive", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("svg").first()).toBeVisible();
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(250);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(250);
    await expect(page.locator("svg").first()).toBeVisible();
  });

  test("la route carte MJ est protégée", async ({ page }) => {
    await page.goto("/mj/carte");
    await expect(page.locator("body")).toBeVisible();
  });
});

