"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorldMapClient } from "@/components/map/WorldMapClient";
import type { WorldMapClientProps } from "@/components/map/WorldMapClient";
import { emitMapMetric } from "@/lib/mapObservability";

/**
 * Forcer un refresh routeur au montage pour éviter qu'une navigation client
 * réutilise un cache stale et masque des changements MJ récents.
 */
export function PublicMapWithRefresh(props: Omit<WorldMapClientProps, "mode">) {
  const router = useRouter();

  useEffect(() => {
    const t0 = performance.now();
    router.refresh();
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        emitMapMetric("map_router_refresh_ms", performance.now() - t0, { mode: "public" });
      });
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [router]);

  useEffect(() => {
    const t0 = performance.now();
    return () => emitMapMetric("map_public_mount_ms", performance.now() - t0, { mode: "public" });
  }, []);

  return <WorldMapClient mode="public" {...props} />;
}
