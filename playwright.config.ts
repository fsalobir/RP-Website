import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // Démarre automatiquement l'app avec Supabase local pour que les pages utilisent le seed (supabase/seed.sql)
  // au lieu d'interroger un projet distant via .env.local.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "node scripts/start-next-for-playwright.mjs",
        url: "http://localhost:3000",
        // Important: on force un serveur neuf avec les variables d'env ci-dessous,
        // sinon un `next dev` déjà lancé pourrait pointer vers un Supabase distant.
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

