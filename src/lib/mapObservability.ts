export type MapMetricName =
  | "map_public_mount_ms"
  | "map_mj_mount_ms"
  | "map_router_refresh_ms"
  | "map_route_build_ms"
  | "map_routes_visible_count"
  | "map_route_labels_visible_count"
  | "map_cities_visible_count"
  | "map_objects_visible_count"
  | "map_interaction_frame_gap_ms";

export function emitMapMetric(name: MapMetricName, value: number, meta?: Record<string, unknown>) {
  if (!Number.isFinite(value)) return;
  const payload = { name, value: Number(value.toFixed(2)), ts: Date.now(), ...meta };
  if (typeof window !== "undefined") {
    const sink = (window as any).__mapMetricsSink;
    if (typeof sink === "function") sink(payload);
  }
  // Signal local activable à la demande pour éviter du bruit runtime.
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MAP_DEBUG_METRICS === "1") {
    console.info("[map-metric]", payload);
  }
}

