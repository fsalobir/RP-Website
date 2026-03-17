import { expect, test } from "@playwright/test";

test.describe("Crons API (local)", () => {
  const cronSecret = process.env.CRON_SECRET ?? "test-cron-secret";

  test("Test 1 (Daily Update) : POST /api/cron/daily-country-update avec Authorization: Bearer => 200", async ({ request }) => {
    const res = await request.post("/api/cron/daily-country-update", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("ok", true);
  });

  test("Test 2 (Sécurité Cron) : sans Authorization => 401/403", async ({ request }) => {
    const res = await request.post("/api/cron/daily-country-update");
    expect([401, 403]).toContain(res.status());
  });
});

