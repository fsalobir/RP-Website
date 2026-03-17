import { spawn } from "node:child_process";

// CI / Playwright: on privilégie des variables d'environnement explicites,
// plutôt qu'un parsing fragile de `supabase status -o env`.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquants. " +
      "Définis-les via .env.local ou via l'env Playwright/CI."
  );
}

const nextEnv = {
  ...process.env,
  // On force l'app à utiliser Supabase local (seedé) pendant les E2E
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  // Secret cron pour les tests d'intégration (routes /api/cron/*)
  CRON_SECRET: process.env.CRON_SECRET ?? "test-cron-secret",
};

if (!nextEnv.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY manquante. " +
      "Définis-la via .env.local ou via l'env Playwright/CI."
  );
}

const devCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const devArgs = ["run", "dev"];

const dev = spawn(devCmd, devArgs, {
  shell: true,
  stdio: "inherit",
  env: nextEnv,
});

dev.on("close", (code) => process.exit(code ?? 1));
