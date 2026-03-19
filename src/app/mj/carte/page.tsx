import { createServiceRoleClient } from "@/lib/supabase/server";
import { WorldMapClient } from "@/components/map/WorldMapClient";
import {
  createOrAssignProvinceFromRegion,
  assignIsoRegionsToMilluipanur,
  createCity,
  createCityBuilding,
  createRoute,
  addPathwayPointToRoute,
  deletePathwayPoint,
  createBranchPointOnRoute,
  deleteRoute,
  deleteCity,
  updateCityIconScale,
  createMapObject,
  mergeProvinces,
  renameProvince,
  splitProvince,
  undoProvinceMapOp,
  getMapDisplayConfig,
  saveMapDisplayConfig,
} from "../_actions/map";

export const revalidate = 0;

export default async function MjCartePage() {
  const admin = createServiceRoleClient();

  const [realmsRes, provinceRegionsRes, opsRes, poiRes, citiesRes, routesRes, routePathwayPointsRes, maxRouteKmRes] = await Promise.all([
    admin.from("realms").select("id, slug, name, is_npc").order("name"),
    admin
      .from("province_base_regions")
      .select("region_id, provinces(id, realm_id, name, attrs)")
      .order("created_at", { ascending: true }),
    admin
      .from("province_map_ops")
      .select("id, op_kind, created_at, province_id")
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("poi")
      .select("id, province_id, kind, name, lon, lat, icon_key, is_visible")
      .eq("is_visible", true),
    admin
      .from("cities")
      .select("id, province_id, realm_id, name, lon, lat, icon_key, attrs")
      .order("created_at", { ascending: false }),
    admin.from("routes").select("id, name, city_a_id, city_b_id, pathway_point_a_id, pathway_point_b_id, tier, distance_km, attrs").order("created_at", { ascending: false }),
    admin.from("route_pathway_points").select("id, route_id, seq, lat, lon").order("route_id").order("seq"),
    admin.from("rule_parameters").select("value").eq("key", "max_route_km").maybeSingle(),
  ]);

  const realms = (realmsRes.data ?? []) as Array<{ id: string; slug: string; name: string; is_npc: boolean }>;
  const provinces = (provinceRegionsRes.data ?? [])
    .map((row: any) => row?.provinces ? ({ ...row.provinces, region_id: row.region_id }) : null)
    .filter(Boolean) as Array<{ id: string; realm_id: string; name: string; region_id: string; attrs?: Record<string, any> }>;
  const recentOps = (opsRes.data ?? []) as Array<{ id: string; op_kind: string; created_at: string; province_id: string | null }>;
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
  const cities = (citiesRes.data ?? []) as Array<{
    id: string;
    province_id: string;
    realm_id: string;
    name: string;
    lon: number;
    lat: number;
    icon_key: string | null;
    attrs?: Record<string, any>;
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
    attrs?: Record<string, any>;
  }>;
  const routePathwayPoints = (routePathwayPointsRes.data ?? []) as Array<{
    id: string;
    route_id: string;
    seq: number;
    lat: number;
    lon: number;
  }>;
  const maxRouteKm =
    typeof maxRouteKmRes.data?.value === "number" && maxRouteKmRes.data.value > 0
      ? maxRouteKmRes.data.value
      : 500;

  const mapDisplayConfig = await getMapDisplayConfig();

  return (
    <div>
      <div className="relative h-[calc(100vh-5rem)] min-h-[480px] w-full overflow-hidden border border-amber-500/20 bg-black/20">
        <WorldMapClient
          mode="mj"
          provinces={provinces}
          realms={realms}
          mjCreateOrAssignProvince={createOrAssignProvinceFromRegion}
          mjMergeProvinces={mergeProvinces}
          mjRenameProvince={renameProvince}
          mjSplitProvince={splitProvince}
          mjUndoProvinceMapOp={undoProvinceMapOp}
          mjRecentOps={recentOps}
          mjCreateMapObject={createMapObject}
          mjCreateCity={createCity}
          mjCreateCityBuilding={createCityBuilding}
          mjDeleteCity={deleteCity}
          mjUpdateCityIconScale={updateCityIconScale}
          mjCreateRoute={createRoute}
          mjAddPathwayPointToRoute={addPathwayPointToRoute}
          mjDeletePathwayPoint={deletePathwayPoint}
          mjCreateBranchPointOnRoute={createBranchPointOnRoute}
          mjDeleteRoute={deleteRoute}
          maxRouteKm={maxRouteKm}
          initialMapDisplayConfig={mapDisplayConfig}
          onSaveMapDisplayConfig={saveMapDisplayConfig}
          mapObjects={poi as any}
          cities={cities as any}
          routes={routes}
          routePathwayPoints={routePathwayPoints}
        />
      </div>
    </div>
  );
}

