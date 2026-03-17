import { spawn } from "node:child_process";

function parseEnvOutput(stdout) {
  // Format: KEY="value" (une ligne par variable)
  const env = {};
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

function runSupabaseStatusEnv() {
  return new Promise((resolve, reject) => {
    const supabaseCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const supabaseArgs = ["run", "supabase", "--", "status", "-o", "env"];

    const child = spawn(supabaseCmd, supabaseArgs, {
      // Sur Windows (Node 24), le spawn direct de `npm.cmd` peut renvoyer EINVAL selon le contexte.
      // `shell: true` est le plus robuste pour ce cas d'usage (commande courte, args contrôlés).
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`supabase status -o env a échoué (code ${code}).\n${err || out}`));
        return;
      }
      resolve(parseEnvOutput(out));
    });
  });
}

const supabaseEnv = await runSupabaseStatusEnv();

const nextEnv = {
  ...process.env,
  // On force l'app à utiliser Supabase local (seedé) pendant les E2E
  NEXT_PUBLIC_SUPABASE_URL: supabaseEnv.API_URL ?? "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.SERVICE_ROLE_KEY,
};

if (!nextEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || !nextEnv.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Impossible de récupérer ANON_KEY / SERVICE_ROLE_KEY via `supabase status -o env`. " +
      "Assure-toi que Supabase local est démarré (npm run test:e2e:setup)."
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
