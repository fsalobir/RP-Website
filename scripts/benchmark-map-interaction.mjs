import { chromium } from "@playwright/test";

const BASE_URL = process.env.MAP_BENCH_URL || "http://127.0.0.1:3000";
const ITERATIONS = Number(process.env.MAP_BENCH_ITERATIONS || 4);
const OUTPUT_PATH = process.env.MAP_BENCH_OUTPUT || "tmp/map-benchmark-interaction.json";
const PROFILE = process.env.MAP_BENCH_PROFILE || "medium";
const DATASET_TAG = process.env.MAP_BENCH_DATASET_TAG || "unspecified";

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

async function runScenario(page, path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(700);
  const perf = await page.evaluate(async () => {
    const frameGaps = [];
    let last = performance.now();
    const frames = 100;
    for (let i = 0; i < frames; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      frameGaps.push(now - last);
      last = now;
    }
    return { frameGaps };
  });

  const box = await page.locator("svg").first().boundingBox();
  if (!box) throw new Error("Carte SVG introuvable pour benchmark interaction.");

  const centerX = box.x + box.width * 0.5;
  const centerY = box.y + box.height * 0.5;
  const wheelDurations = [];

  for (let i = 0; i < 6; i += 1) {
    const t0 = performance.now();
    await page.mouse.move(centerX + i * 4, centerY + i * 2);
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(120);
    const t1 = performance.now();
    wheelDurations.push(t1 - t0);
  }

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 220, centerY + 90, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const counts = await page.evaluate(() => {
    const svgNodes = document.querySelectorAll("svg *").length;
    const longTasks = performance
      .getEntries()
      .filter((e) => e.entryType === "longtask")
      .length;
    return { svgNodes, longTasks };
  });

  return {
    frameGapP95Ms: percentile(perf.frameGaps, 95),
    frameGapP99Ms: percentile(perf.frameGaps, 99),
    wheelStepP95Ms: percentile(wheelDurations, 95),
    wheelStepP99Ms: percentile(wheelDurations, 99),
    svgNodes: counts.svgNodes,
    longTasks: counts.longTasks,
  };
}

async function benchPage(browser, name, path) {
  const samples = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    samples.push(await runScenario(page, path));
    await context.close();
  }
  const frame95 = samples.map((s) => s.frameGapP95Ms);
  const frame99 = samples.map((s) => s.frameGapP99Ms);
  const wheel95 = samples.map((s) => s.wheelStepP95Ms);
  const wheel99 = samples.map((s) => s.wheelStepP99Ms);
  return {
    page: name,
    iterations: ITERATIONS,
    frameGapP95Ms: Number(percentile(frame95, 95).toFixed(2)),
    frameGapP99Ms: Number(percentile(frame99, 95).toFixed(2)),
    wheelStepP95Ms: Number(percentile(wheel95, 95).toFixed(2)),
    wheelStepP99Ms: Number(percentile(wheel99, 95).toFixed(2)),
    longTasksMax: Math.max(...samples.map((s) => s.longTasks)),
    svgNodesMax: Math.max(...samples.map((s) => s.svgNodes)),
    samples,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    results.push(await benchPage(browser, "public", "/"));
    results.push(await benchPage(browser, "mj", "/mj/carte"));
    const payload = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      profile: PROFILE,
      datasetTag: DATASET_TAG,
      results,
    };
    const fs = await import("node:fs/promises");
    await fs.mkdir("tmp", { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("[benchmark:map:interaction] failed:", e);
  process.exit(1);
});

