import { createServiceRoleClient } from "@/lib/supabase/server";
import { MapPrototypeTabs } from "@/components/map/proto/MapPrototypeTabs";
import { buildMapProtoDatasetFromRows, getMapProtoMockDataset, type MapProtoDataMode } from "@/components/map/proto/data/mapProtoDataSource";

export const revalidate = 0;

type SearchParams = Promise<{ source?: string }>;

export default async function MjCarteComparaisonPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const sourceMode: MapProtoDataMode = params?.source === "supabase" ? "supabase" : "mock";
  const dataset =
    sourceMode === "supabase"
      ? await getSupabaseDataset()
      : getMapProtoMockDataset();

  return (
    <div className="flex min-h-[560px] flex-col gap-4 p-4">
      <header className="rounded-xl border border-amber-500/20 bg-black/35 px-4 py-3">
        <h1 className="text-lg font-semibold text-white">Banc de comparaison cartographique</h1>
        <p className="mt-1 text-sm text-white/70">
          Onglets de prototypage pour tester des moteurs de carte distincts avec le même scénario.
        </p>
      </header>
      <MapPrototypeTabs initialDataset={dataset} sourceMode={sourceMode} />
    </div>
  );
}

async function getSupabaseDataset() {
  const admin = createServiceRoleClient();
  const [citiesRes, routesRes, routePathwayRes] = await Promise.all([
    admin.from("cities").select("id, name, lon, lat, icon_key").order("created_at", { ascending: false }).limit(2000),
    admin.from("routes").select("id, name, city_a_id, city_b_id").order("created_at", { ascending: false }).limit(1500),
    admin.from("route_pathway_points").select("route_id, seq, lon, lat").order("route_id").order("seq"),
  ]);

  if (citiesRes.error || routesRes.error || routePathwayRes.error) {
    return getMapProtoMockDataset();
  }

  return buildMapProtoDatasetFromRows(citiesRes.data ?? [], routesRes.data ?? [], routePathwayRes.data ?? []);
}
