type WorkerInput = {
  routes: Array<{ points: Array<{ lon: number; lat: number }> }>;
};

type WorkerOutput = {
  routesCoordsBuffer: ArrayBuffer;
  routesIndexBuffer: ArrayBuffer;
  labelsBuffer: ArrayBuffer;
};

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const routes = event.data.routes ?? [];
  const routeCount = routes.length;
  let totalPoints = 0;
  for (const route of routes) {
    totalPoints += route.points.length;
  }

  const coords = new Float32Array(totalPoints * 2);
  const index = new Uint32Array(routeCount * 2);
  const labels = new Float32Array(routeCount * 3);

  let offset = 0;
  routes.forEach((route, ri) => {
    const pts = simplify(route.points);
    index[ri * 2] = offset;
    index[ri * 2 + 1] = pts.length;
    for (const p of pts) {
      coords[offset * 2] = toWorldX(p.lon);
      coords[offset * 2 + 1] = toWorldY(p.lat);
      offset += 1;
    }
    const mid = pts[Math.floor(pts.length / 2)] ?? pts[0] ?? { lon: 0, lat: 0 };
    labels[ri * 3] = toWorldX(mid.lon);
    labels[ri * 3 + 1] = toWorldY(mid.lat);
    labels[ri * 3 + 2] = ri;
  });

  const out: WorkerOutput = {
    routesCoordsBuffer: coords.buffer,
    routesIndexBuffer: index.buffer,
    labelsBuffer: labels.buffer,
  };
  (self as DedicatedWorkerGlobalScope).postMessage(out, [out.routesCoordsBuffer, out.routesIndexBuffer, out.labelsBuffer]);
};

function simplify(points: Array<{ lon: number; lat: number }>) {
  if (points.length <= 2) return points;
  const out: Array<{ lon: number; lat: number }> = [];
  for (let i = 0; i < points.length; i += 1) {
    if (i === 0 || i === points.length - 1 || i % 2 === 0) out.push(points[i]);
  }
  return out;
}

function toWorldX(lon: number) {
  return ((lon + 180) / 360) * 4096;
}

function toWorldY(lat: number) {
  return ((85 - lat) / 170) * 2048;
}
