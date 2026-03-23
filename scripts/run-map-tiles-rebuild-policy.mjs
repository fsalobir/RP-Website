import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const TMP_DIR = process.env.MAP_TILES_TMP_DIR || "tmp/map-tiles";
const STATE_PATH = path.join(TMP_DIR, "rebuild-state.json");
const BATCH_MS = Number(process.env.MAP_TILES_BATCH_MS ?? 5 * 60 * 1000);
const force = process.argv.includes("--force");
const markDirty = process.argv.includes("--mark-dirty");

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
  } catch {
    return { dirty: false, dirtyAt: null, lastRunAt: null, running: false };
  }
}

async function writeState(state) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

async function runPipeline() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/precompute-map-tiles.mjs"], { stdio: "inherit", shell: false });
    child.on("exit", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`pipeline exit ${code}`))));
  });
}

async function main() {
  const now = Date.now();
  const state = await readState();
  if (markDirty) {
    state.dirty = true;
    state.dirtyAt = new Date(now).toISOString();
    await writeState(state);
    console.log("[run-map-tiles-rebuild-policy] dirty=true");
    return;
  }
  if (state.running) {
    console.log("[run-map-tiles-rebuild-policy] build déjà en cours, skip");
    return;
  }
  const dirtyAtMs = state.dirtyAt ? new Date(state.dirtyAt).getTime() : 0;
  const due = state.dirty && now - dirtyAtMs >= BATCH_MS;
  if (!force && !due) {
    console.log("[run-map-tiles-rebuild-policy] pas de rebuild (batch 5 min non atteint)");
    return;
  }

  state.running = true;
  await writeState(state);
  try {
    await runPipeline();
    state.running = false;
    state.dirty = false;
    state.lastRunAt = new Date().toISOString();
    await writeState(state);
    console.log("[run-map-tiles-rebuild-policy] rebuild terminé");
  } catch (error) {
    state.running = false;
    await writeState(state);
    console.error("[run-map-tiles-rebuild-policy] rebuild échoué:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[run-map-tiles-rebuild-policy] failed:", error);
  process.exit(1);
});
