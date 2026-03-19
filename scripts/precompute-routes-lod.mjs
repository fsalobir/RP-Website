import fs from "node:fs/promises";

function perpendicularDistance(point, start, end) {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function simplify(points, epsilon) {
  if (!Array.isArray(points) || points.length <= 2) return points ?? [];
  let maxDist = -1;
  let splitIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      splitIdx = i;
    }
  }
  if (maxDist <= epsilon) return [start, end];
  const left = simplify(points.slice(0, splitIdx + 1), epsilon);
  const right = simplify(points.slice(splitIdx), epsilon);
  return [...left.slice(0, -1), ...right];
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || "tmp/routes-lod.json";
  if (!inputPath) {
    console.error("Usage: node scripts/precompute-routes-lod.mjs <input.json> [output.json]");
    process.exit(1);
  }
  const raw = await fs.readFile(inputPath, "utf8");
  const payload = JSON.parse(raw);
  const routes = Array.isArray(payload.routes) ? payload.routes : [];

  const out = routes.map((r) => {
    const points = Array.isArray(r.points) ? r.points : [];
    return {
      id: r.id,
      high: simplify(points, 0.1),
      mid: simplify(points, 0.25),
      low: simplify(points, 0.6),
    };
  });

  await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), routes: out }, null, 2), "utf8");
  console.log(`Precompute LOD terminé: ${outputPath} (${out.length} routes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

