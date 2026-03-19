"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorldMapClient } from "@/components/map/WorldMapClient";

/**
 * Affiche la carte publique et force un rafraîchissement des données au montage.
 * Garantit que la carte reflète toujours l’état autoritaire (carte MJ), même
 * après une navigation client qui aurait servi un cache.
 */
export function PublicMapWithRefresh(props: {
  provinces: any;
  realms: any;
  mapObjects: any;
  cities: any;
  routes?: any;
  initialMapDisplayConfig?: any;
}) {
  const router = useRouter();

  useEffect(() => {
    router.refresh();
  }, [router]);

  return (
    <WorldMapClient
      mode="public"
      provinces={props.provinces}
      realms={props.realms}
      mapObjects={props.mapObjects}
      cities={props.cities}
      routes={props.routes}
      initialMapDisplayConfig={props.initialMapDisplayConfig}
    />
  );
}
