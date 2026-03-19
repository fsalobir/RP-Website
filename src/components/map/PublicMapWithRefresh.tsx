"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorldMapClient } from "@/components/map/WorldMapClient";
import type { WorldMapClientProps } from "@/components/map/WorldMapClient";

/**
 * Forcer un refresh routeur au montage pour éviter qu'une navigation client
 * réutilise un cache stale et masque des changements MJ récents.
 */
export function PublicMapWithRefresh(props: Omit<WorldMapClientProps, "mode">) {
  const router = useRouter();

  useEffect(() => {
    router.refresh();
  }, [router]);

  return <WorldMapClient mode="public" {...props} />;
}
