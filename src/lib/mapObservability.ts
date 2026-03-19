export type MapMetricName =
  | "map_public_mount_ms"
  | "map_mj_mount_ms"
  | "map_router_refresh_ms"
  | "map_route_build_ms"
  | "map_interaction_frame_gap_ms";

export function emitMapMetric(name: MapMetricName, value: number, meta?: Record<string, unknown>) {
  if (!Number.isFinite(value)) return;
  const payload = { name, value: Number(value.toFixed(2)), ts: Date.now(), ...meta };
  if (typeof window !== "undefined") {
    const sink = (window as any).__mapMetricsSink;
    if (typeof sink === "function") sink(payload);
  }
  // Signal simple pour benchmark local/staging.
  if (process.env.NODE_ENV !== "production") console.info("[map-metric]", payload);
}

