import fs from "node:fs/promises";

const THRESHOLDS_PATH = process.env.MAP_BENCH_THRESHOLDS || "docs/map-benchmark-thresholds.json";
const INTERACTION_PATH = process.env.MAP_INTERACTION_BENCH || "tmp/map-benchmark-interaction.json";
const BASELINE_PATH = process.env.MAP_INTERACTION_BASELINE || "";
const PROFILE = process.env.MAP_BENCH_PROFILE || "medium";

function pickResult(results, page) {
  return (results || []).find((r) => r.page === page);
}

function fail(msg) {
  console.error(`[map-bench-check] ${msg}`);
  process.exitCode = 1;
}

async function main() {
  const thresholds = JSON.parse(await fs.readFile(THRESHOLDS_PATH, "utf8"));
  const interaction = JSON.parse(await fs.readFile(INTERACTION_PATH, "utf8"));
  const profileThresholds = thresholds?.profiles?.[PROFILE];
  if (!profileThresholds) {
    throw new Error(`Profil de seuils introuvable: ${PROFILE}`);
  }
  const publicRes = pickResult(interaction.results, "public");
  const mjRes = pickResult(interaction.results, "mj");
  if (!publicRes || !mjRes) {
    throw new Error("Résultats benchmark incomplets (public/mj manquants).");
  }

  const checks = [
    ["public.frameGapP95Ms", publicRes.frameGapP95Ms, profileThresholds.public.frameGapP95MsMax],
    ["public.wheelStepP95Ms", publicRes.wheelStepP95Ms, profileThresholds.public.wheelStepP95MsMax],
    ["public.longTasksMax", publicRes.longTasksMax, profileThresholds.public.longTasksMax],
    ["public.svgNodesMax", publicRes.svgNodesMax, profileThresholds.public.svgNodesMax],
    ["mj.frameGapP95Ms", mjRes.frameGapP95Ms, profileThresholds.mj.frameGapP95MsMax],
    ["mj.wheelStepP95Ms", mjRes.wheelStepP95Ms, profileThresholds.mj.wheelStepP95MsMax],
    ["mj.longTasksMax", mjRes.longTasksMax, profileThresholds.mj.longTasksMax],
    ["mj.svgNodesMax", mjRes.svgNodesMax, profileThresholds.mj.svgNodesMax],
  ];

  for (const [name, value, max] of checks) {
    if (value > max) {
      fail(`${name}=${value} dépasse le seuil ${max}`);
    } else {
      console.log(`[map-bench-check] OK ${name}=${value} (<= ${max})`);
    }
  }

  if (BASELINE_PATH) {
    const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
    const maxRegressionPct = Number(profileThresholds.maxRegressionPct ?? 15);
    const baselinePublic = pickResult(baseline.results, "public");
    const baselineMj = pickResult(baseline.results, "mj");
    if (!baselinePublic || !baselineMj) {
      throw new Error("Baseline benchmark invalide (public/mj manquants).");
    }
    const regressions = [
      ["public.frameGapP95Ms", baselinePublic.frameGapP95Ms, publicRes.frameGapP95Ms],
      ["public.wheelStepP95Ms", baselinePublic.wheelStepP95Ms, publicRes.wheelStepP95Ms],
      ["mj.frameGapP95Ms", baselineMj.frameGapP95Ms, mjRes.frameGapP95Ms],
      ["mj.wheelStepP95Ms", baselineMj.wheelStepP95Ms, mjRes.wheelStepP95Ms],
    ];
    for (const [name, base, cur] of regressions) {
      if (base <= 0) continue;
      const pct = ((cur - base) / base) * 100;
      if (pct > maxRegressionPct) {
        fail(`${name} régression ${pct.toFixed(2)}% (> ${maxRegressionPct}%)`);
      } else {
        console.log(`[map-bench-check] OK ${name} régression ${pct.toFixed(2)}%`);
      }
    }
  }

  if (process.exitCode && process.exitCode !== 0) {
    throw new Error("Seuils de benchmark non respectés.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

