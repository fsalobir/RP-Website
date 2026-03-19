export type LonLatPoint = [number, number];

function perpendicularDistance(point: LonLatPoint, start: LonLatPoint, end: LonLatPoint): number {
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

export function simplifyPolylineRdp(points: LonLatPoint[], epsilon: number): LonLatPoint[] {
  if (points.length <= 2) return points;
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
  const left = simplifyPolylineRdp(points.slice(0, splitIdx + 1), epsilon);
  const right = simplifyPolylineRdp(points.slice(splitIdx), epsilon);
  return [...left.slice(0, -1), ...right];
}

export function simplifyPolylinePreservingCurves(points: LonLatPoint[], epsilon: number): LonLatPoint[] {
  if (points.length < 6) return points;
  const simplified = simplifyPolylineRdp(points, epsilon);
  // Evite de transformer des routes sinueuses en simple segment.
  if (simplified.length < 3 && points.length >= 3) return points;
  // Evite la perte excessive de détails.
  if (simplified.length < Math.min(6, Math.floor(points.length * 0.2))) return points;
  return simplified;
}

export function buildRouteLodVariants(
  points: LonLatPoint[],
  options?: { epsilonLow?: number; epsilonMid?: number; epsilonHigh?: number }
): { high: LonLatPoint[]; mid: LonLatPoint[]; low: LonLatPoint[] } {
  const epsilonLow = options?.epsilonLow ?? 0.6;
  const epsilonMid = options?.epsilonMid ?? 0.25;
  const epsilonHigh = options?.epsilonHigh ?? 0.1;
  return {
    high: simplifyPolylineRdp(points, epsilonHigh),
    mid: simplifyPolylineRdp(points, epsilonMid),
    low: simplifyPolylineRdp(points, epsilonLow),
  };
}

export function pickRouteLodByZoom(
  lod: { high: LonLatPoint[]; mid: LonLatPoint[]; low: LonLatPoint[] },
  zoom: number
): LonLatPoint[] {
  if (zoom >= 6) return lod.high;
  if (zoom >= 2.4) return lod.mid;
  return lod.low;
}

