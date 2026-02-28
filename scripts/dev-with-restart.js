/**
 * Lance next dev et le redémarre toutes les N minutes pour limiter
 * la dégradation mémoire / lenteur du serveur de dev.
 * Usage: npm run dev:watch
 */
const { spawn } = require("child_process");

const RESTART_MINUTES = 3;
const RESTART_MS = RESTART_MINUTES * 60 * 1000;
const PAUSE_BEFORE_RESTART_MS = 2500;

function run() {
  const child = spawn("npx", ["next", "dev"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  const timer = setTimeout(() => {
    console.log(`\n[dev:watch] Redémarrage dans ${PAUSE_BEFORE_RESTART_MS / 1000}s (toutes les ${RESTART_MINUTES} min)...`);
    child.kill("SIGTERM");
    child.once("exit", () => {
      setTimeout(run, PAUSE_BEFORE_RESTART_MS);
    });
  }, RESTART_MS);

  child.on("exit", (code) => {
    clearTimeout(timer);
    if (code !== null && code !== 0 && code !== 130) process.exit(code);
  });
}

run();
