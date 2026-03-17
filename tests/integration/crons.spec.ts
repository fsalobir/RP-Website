import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

function parseEnvOutput(stdout: string) {
  const env: Record<string, string> = {};
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("Stopped services:")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx);
    let value = line.slice(eqIdx + 1);
    if (value.startsWith("\"") && value.endsWith("\"")) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

async function getSupabaseLocalEnv() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCmd, ["run", "supabase", "--", "status", "-o", "env"], {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += String(d)));
  child.stderr.on("data", (d) => (err += String(d)));

  const code: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (c) => resolve(c ?? 1));
  });

  if (code !== 0) {
    throw new Error(`supabase status -o env a échoué (code ${code}).\n${err || out}`);
  }
  return parseEnvOutput(out);
}

async function waitForHttpOk(url: string, { timeoutMs }: { timeoutMs: number }) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status >= 200 && res.status < 500) return;
    } catch {
      // ignore
    }
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout en attendant ${url}`);
    await delay(500);
  }
}

async function killProcessTree(proc: ReturnType<typeof spawn>) {
  if (proc.killed) return;
  if (process.platform === "win32") {
    const pid = proc.pid;
    if (!pid) return;
    // taskkill est la manière la plus fiable de tuer next dev + enfants sur Windows
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: true, stdio: "ignore" });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  proc.kill("SIGTERM");
  await delay(500);
  if (!proc.killed) proc.kill("SIGKILL");
}

describe("Crons API (local)", () => {
  const baseUrl = process.env.INTEGRATION_BASE_URL ?? "http://localhost:3010";
  const cronSecret = process.env.INTEGRATION_CRON_SECRET ?? "test-cron-secret";

  let nextProc: ReturnType<typeof spawn> | null = null;
  let supabaseEnv: Record<string, string>;
  let supabaseAdmin: ReturnType<typeof createClient>;

  beforeAll(async () => {
    supabaseEnv = await getSupabaseLocalEnv();

    const apiUrl = supabaseEnv.API_URL ?? "http://127.0.0.1:54321";
    const serviceRoleKey = supabaseEnv.SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      throw new Error("SERVICE_ROLE_KEY manquant (Supabase local non démarré ?). Lance `npm run test:e2e:setup`.");
    }

    supabaseAdmin = createClient(apiUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const port = new URL(baseUrl).port || "3010";
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    nextProc = spawn(npmCmd, ["run", "dev"], {
      shell: true,
      stdio: "inherit",
      env: {
        ...process.env,
        PORT: port,
        CRON_SECRET: cronSecret,
        NEXT_PUBLIC_SUPABASE_URL: apiUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.ANON_KEY ?? "",
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      },
    });

    await waitForHttpOk(`${baseUrl}/`, { timeoutMs: 120_000 });
  }, 180_000);

  afterAll(async () => {
    if (nextProc) await killProcessTree(nextProc);
  });

  test("Cron Daily (/api/cron/daily-country-update) répond 200", async () => {
    // Le RPC run_daily_country_update peut échouer selon la config DB locale (safeupdate/WHERE).
    // Pour ce test d'intégration "route + auth", on force cron_paused=true afin d'obtenir un 200 déterministe.
    const { error: pauseErr } = await supabaseAdmin.from("rule_parameters").upsert(
      {
        key: "cron_paused",
        value: true,
        description: "Test integration: pause cron daily",
      },
      { onConflict: "key" }
    );
    if (pauseErr) throw new Error(pauseErr.message);

    const res = await fetch(`${baseUrl}/api/cron/daily-country-update`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("ok", true);
    expect(json).toHaveProperty("paused", true);
  });

  test("Cron IA (/api/cron/generate-ai-events) insère au moins 1 ai_event_requests", async () => {
    // Garantit une config minimale qui génère quelque chose.
    const { data: oneActionType, error: actionTypeErr } = await supabaseAdmin
      .from("state_action_types")
      .select("key")
      .limit(1)
      .maybeSingle();
    if (actionTypeErr) throw new Error(actionTypeErr.message);
    const actionKey = (oneActionType as { key?: string } | null)?.key;
    expect(actionKey, "Aucun state_action_types.key trouvé (migrations/seed incomplets ?)").toBeTruthy();

    // Prépare des pays IA pour rendre la génération déterministe (au moins 1 émetteur mineur + 1 cible mineure).
    const { error: aiStatusErr } = await supabaseAdmin
      .from("countries")
      .update({ ai_status: "minor" })
      .in("slug", ["alpha", "bravo"]);
    if (aiStatusErr) throw new Error(aiStatusErr.message);

    // Garantit que l'intervalle ne bloque pas (même si p_force n'est pas supporté par la version SQL locale).
    const { error: lastRunErr } = await supabaseAdmin.from("rule_parameters").upsert(
      { key: "ai_events_last_run", value: "1970-01-01T00:00:00Z", description: "Test integration: last run old" },
      { onConflict: "key" }
    );
    if (lastRunErr) throw new Error(lastRunErr.message);

    const { error: cfgErr } = await supabaseAdmin.from("rule_parameters").upsert(
      {
        key: "ai_events_config",
        value: {
          interval_hours: 1,
          count_major_per_run: 0,
          count_minor_per_run: 1,
          allowed_action_type_keys_major: [],
          allowed_action_type_keys_minor: [actionKey],
          target_major_ai: false,
          target_minor_ai: true,
          target_players: false,
          trigger_amplitude_minutes: 0,
        },
        description: "Test integration: config minimale events IA",
      },
      { onConflict: "key" }
    );
    if (cfgErr) throw new Error(cfgErr.message);

    const before = await supabaseAdmin
      .from("ai_event_requests")
      .select("id", { count: "exact", head: true });
    if (before.error) throw new Error(before.error.message);
    const beforeCount = before.count ?? 0;

    const res = await fetch(`${baseUrl}/api/cron/generate-ai-events?force=true`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("ok", true);

    // Le cron est synchrone côté route (RPC), mais on laisse une petite marge pour l'écriture.
    for (let i = 0; i < 10; i++) {
      const after = await supabaseAdmin
        .from("ai_event_requests")
        .select("id", { count: "exact", head: true });
      if (after.error) throw new Error(after.error.message);
      const afterCount = after.count ?? 0;
      if (afterCount > beforeCount) return;
      await delay(500);
    }

    throw new Error("Aucun nouvel ai_event_requests détecté après l'appel cron IA.");
  }, 60_000);
});

