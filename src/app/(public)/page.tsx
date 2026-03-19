import { unstable_noStore } from "next/cache";
import { createAnonClientForCache } from "@/lib/supabase/server";
import { getMapDisplayConfig } from "@/app/mj/_actions/map";
import { PublicMapWithRefresh } from "@/components/map/PublicMapWithRefresh";

// Carte publique = reflet autoritaire de la carte MJ : pas de cache, toujours données fraîches.
export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  unstable_noStore(); // opt-out du cache données pour cette page

  const params = await searchParams;
  const showUnauthorized = params.error === "non-autorise";
  const supabase = createAnonClientForCache();

  const [realmsRes, provinceRegionsRes, poiRes, citiesRes, routesRes, routePathwayPointsRes] = await Promise.all([
    supabase.from("realms").select("id, slug, name, is_npc").order("name"),
    supabase
      .from("province_base_regions")
      .select("region_id, provinces(id, realm_id, name, attrs)")
      .order("created_at", { ascending: true }),
    supabase
      .from("poi")
      .select("id, province_id, kind, name, lon, lat, icon_key, is_visible")
      .eq("is_visible", true),
    supabase
      .from("cities")
      .select("id, province_id, realm_id, name, lon, lat, icon_key, attrs")
      .order("created_at", { ascending: false }),
    supabase.from("routes").select("id, name, city_a_id, city_b_id, pathway_point_a_id, pathway_point_b_id, tier, distance_km, attrs").order("created_at", { ascending: false }),
    supabase.from("route_pathway_points").select("id, route_id, seq, lat, lon").order("route_id").order("seq"),
  ]);

  const realms = realmsRes.data ?? [];
  const provinceRegionsRaw = provinceRegionsRes.data ?? [];
  const provinces = provinceRegionsRaw
    .map((row: any) => row?.provinces ? ({ ...row.provinces, region_id: row.region_id }) : null)
    .filter(Boolean);
  const cities = (citiesRes.data ?? []) as Array<{
    id: string;
    province_id: string;
    realm_id: string;
    name: string;
    lon: number;
    lat: number;
    icon_key: string | null;
    attrs?: Record<string, unknown>;
  }>;
  const poi = (poiRes.data ?? []) as Array<{
    id: string;
    province_id: string;
    kind: string;
    name: string;
    lon: number | null;
    lat: number | null;
    icon_key: string | null;
    is_visible: boolean;
  }>;
  const routes = (routesRes.data ?? []) as Array<{
    id: string;
    name: string;
    city_a_id: string | null;
    city_b_id: string | null;
    pathway_point_a_id?: string | null;
    pathway_point_b_id?: string | null;
    tier: string;
    distance_km: number | null;
    attrs?: Record<string, unknown>;
  }>;
  const routePathwayPoints = (routePathwayPointsRes.data ?? []) as Array<{
    id: string;
    route_id: string;
    seq: number;
    lat: number;
    lon: number;
  }>;
  const error = realmsRes.error ?? provinceRegionsRes.error ?? citiesRes.error ?? routesRes.error ?? routePathwayPointsRes.error;

  const mapDisplayConfig = await getMapDisplayConfig();

  if (error) {
    return (
      <div className="relative h-[calc(100vh-3.5rem)] w-full">
        <div className="absolute inset-0 bg-[#071827]" />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,rgba(245,158,11,0.12),transparent_60%),radial-gradient(900px_circle_at_80%_15%,rgba(34,197,94,0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-black/40" />

        <div className="relative z-10 mx-auto flex h-full max-w-3xl items-center justify-center px-4">
          <div className="w-full rounded-2xl border border-amber-500/20 bg-black/50 p-6 shadow-2xl backdrop-blur">
            {showUnauthorized && (
              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3">
                <p className="text-amber-200">
                  Compte non autorisé. Seuls les MJ et les joueurs ayant un royaume peuvent se connecter.
                </p>
              </div>
            )}

            <p className="font-semibold text-red-200">Erreur lors du chargement des données.</p>
            <details className="mt-4 text-sm text-stone-300/80">
              <summary>Détail technique</summary>
              <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-3 whitespace-pre-wrap break-words">
                {error.message}
                {error.code ? `\nCode: ${error.code}` : ""}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <div className="absolute inset-0 bg-[#071827]" />
      <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,rgba(245,158,11,0.12),transparent_60%),radial-gradient(900px_circle_at_80%_15%,rgba(34,197,94,0.10),transparent_55%)]" />
      <div className="absolute inset-0 bg-black/35" />

      <div className="relative z-10 h-full w-full">
        <PublicMapWithRefresh
          provinces={provinces as any}
          realms={realms as any}
          mapObjects={poi as any}
          cities={cities as any}
          routes={routes as any}
          routePathwayPoints={routePathwayPoints}
          initialMapDisplayConfig={mapDisplayConfig}
        />
      </div>
    </div>
  );
}
