import { chromium } from "@playwright/test";

const BASE_URL = process.env.MAP_BENCH_URL || "http://localhost:3000";
const PAGES = [
  { name: "public", path: "/" },
  { name: "mj", path: "/mj/carte" },
];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

async function sampleMetrics(page) {
  return await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const navTiming = nav
      ? {
          domContentLoadedMs: nav.domContentLoadedEventEnd - nav.startTime,
          loadEventMs: nav.loadEventEnd - nav.startTime,
        }
      : null;

    const routePaths = document.querySelectorAll("path[data-route-id], g path[stroke]").length;
    const cityMarkers = document.querySelectorAll("[data-city-id], [data-poi-id]").length;
    const svgNodes = document.querySelectorAll("svg *").length;

    return {
      navTiming,
      routePaths,
      cityMarkers,
      svgNodes,
    };
  });
}

async function runPageBenchmark(browser, pageDef, iterations = 5) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const samples = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await page.goto(`${BASE_URL}${pageDef.path}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(1200);
    const t1 = performance.now();
    const m = await sampleMetrics(page);
    samples.push({
      ttReadyMs: t1 - t0,
      ...m,
    });
  }

  await context.close();

  const ttReady = samples.map((s) => s.ttReadyMs);
  const dcl = samples.map((s) => s.navTiming?.domContentLoadedMs ?? 0);
  const load = samples.map((s) => s.navTiming?.loadEventMs ?? 0);

  const aggregate = {
    page: pageDef.name,
    iterations,
    ttReadyP50: Number(percentile(ttReady, 50).toFixed(1)),
    ttReadyP95: Number(percentile(ttReady, 95).toFixed(1)),
    domContentLoadedP95: Number(percentile(dcl, 95).toFixed(1)),
    loadEventP95: Number(percentile(load, 95).toFixed(1)),
    routePathsMax: Math.max(...samples.map((s) => s.routePaths)),
    cityMarkersMax: Math.max(...samples.map((s) => s.cityMarkers)),
    svgNodesMax: Math.max(...samples.map((s) => s.svgNodes)),
  };

  return { aggregate, samples };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const p of PAGES) {
      results.push(await runPageBenchmark(browser, p, Number(process.env.MAP_BENCH_ITERATIONS || 5)));
    }

    console.log(JSON.stringify({ baseUrl: BASE_URL, generatedAt: new Date().toISOString(), results }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[benchmark:map] failed:", err);
  process.exit(1);
});

