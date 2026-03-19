export type MapWorkerRequest =
  | { id: string; type: "simplifyRoute"; points: Array<[number, number]>; epsilon: number }
  | { id: string; type: "noop" };

export type MapWorkerResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

function simplify(points: Array<[number, number]>, epsilon: number): Array<[number, number]> {
  if (points.length <= 2) return points;
  const out: Array<[number, number]> = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const next = points[i + 1];
    const dist = Math.abs((next[0] - prev[0]) * (prev[1] - cur[1]) - (prev[0] - cur[0]) * (next[1] - prev[1]));
    if (dist >= epsilon) out.push(cur);
  }
  out.push(points[points.length - 1]);
  return out;
}

self.onmessage = (event: MessageEvent<MapWorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === "simplifyRoute") {
      const result = simplify(msg.points, msg.epsilon);
      const res: MapWorkerResponse = { id: msg.id, ok: true, result };
      self.postMessage(res);
      return;
    }
    self.postMessage({ id: msg.id, ok: true, result: null } satisfies MapWorkerResponse);
  } catch (e) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    } satisfies MapWorkerResponse);
  }
};

