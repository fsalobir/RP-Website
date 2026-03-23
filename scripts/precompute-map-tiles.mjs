import { spawn } from "node:child_process";

const STEPS = [
  "scripts/extract-static-map-geo.mjs",
  "scripts/build-map-mvt-tiles.mjs",
  "scripts/precompute-map-tiles-check.mjs",
  "scripts/publish-map-tiles-manifest.mjs",
];

async function runStep(step) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [step], { stdio: "inherit", shell: false });
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${step} failed with code ${code}`));
    });
  });
}

async function main() {
  for (const step of STEPS) {
    console.log(`[precompute-map-tiles] step=${step}`);
    await runStep(step);
  }
  console.log("[precompute-map-tiles] done");
}

main().catch((error) => {
  console.error("[precompute-map-tiles] failed:", error);
  process.exit(1);
});
