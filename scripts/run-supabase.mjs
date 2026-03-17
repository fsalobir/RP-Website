import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function findLocalWindowsSupabaseExe() {
  // Chemin historique utilisé dans le repo
  const rel = path.join("tools", "supabase-cli", "2.78.1", "supabase.exe");
  const abs = path.resolve(process.cwd(), rel);
  return fs.existsSync(abs) ? abs : null;
}

const args = process.argv.slice(2);

let cmd = process.env.SUPABASE_CLI_PATH || "supabase";
let cmdArgs = args;

if (process.platform === "win32") {
  // Sur Windows, on privilégie le binaire local si présent pour éviter les soucis de PATH.
  const local = findLocalWindowsSupabaseExe();
  if (local) {
    cmd = local;
  } else {
    // Fallback : supabase dans le PATH
    cmd = "supabase";
  }
}

const child = spawn(cmd, cmdArgs, {
  shell: true,
  stdio: "inherit",
  env: process.env,
});

child.on("close", (code) => process.exit(code ?? 1));
