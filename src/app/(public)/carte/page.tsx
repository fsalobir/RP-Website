import { createClient } from "@/lib/supabase/server";
import { getCachedAuth } from "@/lib/auth-server";
import { getAllRelationRows } from "@/lib/relations";
import {
  buildRegionToCountryIds,
  buildRegionRelationMap,
  type MapRegionRow,
  type MapRegionCountryRow,
} from "@/lib/mapRegions";
import { buildWorldGeoJSONWithRegionIds } from "@/lib/buildWorldGeoJSON";
import { RelationMapClient } from "./RelationMapClient";

function deriveControlStatus(
  controls: { share_pct: number; is_annexed: boolean }[]
): "Souverain" | "Contesté" | "Occupé" | "Annexé" {
  if (controls.length === 0) return "Souverain";
  if (controls.length === 1 && controls[0].share_pct >= 100) {
    return controls[0].is_annexed ? "Annexé" : "Occupé";
  }
  return "Contesté";
}

export default async function CartePage() {
  const supabase = await createClient();
  const [regionsRes, regionCountriesRes, countriesRes, relationRows, controlRes] = await Promise.all([
    supabase.from("map_regions").select("id, name, slug, geometry, sort_order").order("sort_order"),
    supabase.from("map_region_countries").select("region_id, country_id"),
    supabase.from("countries").select("id, slug, name"),
    getAllRelationRows(supabase),
    supabase.from("country_control").select("country_id, controller_country_id, share_pct, is_annexed"),
  ]);

  const regions = (regionsRes.data ?? []) as MapRegionRow[];
  const regionCountries = (regionCountriesRes.data ?? []) as MapRegionCountryRow[];
  const countries = (countriesRes.data ?? []) as { id: string; slug: string; name: string }[];
  const controlRows = (controlRes.data ?? []) as Array<{
    country_id: string;
    controller_country_id: string;
    share_pct: number;
    is_annexed: boolean;
  }>;

  const regionNames: Record<string, string> = {};
  regions.forEach((r) => {
    regionNames[r.id] = r.name;
  });

  const regionIdsWithCountry = new Set(regionCountries.map((rc) => rc.region_id));
  const orphanRegions = regions.filter((r) => !regionIdsWithCountry.has(r.id));

  let geoJson = buildWorldGeoJSONWithRegionIds(regions, regionNames, regionCountries, countries, orphanRegions);
  geoJson = JSON.parse(JSON.stringify(geoJson)) as typeof geoJson;

  const regionToCountryIds = buildRegionToCountryIds(regionCountries);
  const countryIdToNameForNames = new Map(countries.map((c) => [c.id, c.name]));
  const regionCountryNames: Record<string, string[]> = {};
  regionToCountryIds.forEach((ids, regionId) => {
    regionCountryNames[regionId] = ids.map((cid) => countryIdToNameForNames.get(cid) ?? "").filter(Boolean);
  });
  const regionIds = regions.map((r) => r.id);
  const regionRelationMap = buildRegionRelationMap(regionIds, regionToCountryIds, relationRows);

  const regionRelationMapSerialized: Record<string, number> = {};
  regionRelationMap.forEach((v, k) => {
    regionRelationMapSerialized[k] = v;
  });

  const auth = await getCachedAuth();
  const playerCountryId = auth.playerCountryId ?? null;
  const defaultSelectedRegionId =
    playerCountryId != null
      ? (regionCountries.find((rc) => rc.country_id === playerCountryId)?.region_id ?? null)
      : null;

  const controlsByCountry = new Map<string, { share_pct: number; is_annexed: boolean; controller_country_id: string }[]>();
  for (const row of controlRows) {
    const list = controlsByCountry.get(row.country_id) ?? [];
    list.push({
      share_pct: row.share_pct,
      is_annexed: row.is_annexed,
      controller_country_id: row.controller_country_id,
    });
    controlsByCountry.set(row.country_id, list);
  }
  const countryIdToRegionId = new Map<string, string>();
  for (const rc of regionCountries) {
    countryIdToRegionId.set(rc.country_id, rc.region_id);
  }
  const regionControl: Record<string, { status: "Contesté" | "Occupé" | "Annexé"; controllerName: string; controllerRegionId: string }> = {};
  for (const rc of regionCountries) {
    const controls = controlsByCountry.get(rc.country_id) ?? [];
    const status = deriveControlStatus(controls);
    if (status === "Souverain") continue;
    const main = controls.length === 1 ? controls[0] : controls.find((c) => c.share_pct >= 100) ?? controls[0];
    if (!main) continue;
    const controllerName = countryIdToNameForNames.get(main.controller_country_id) ?? "";
    const controllerRegionId = countryIdToRegionId.get(main.controller_country_id) ?? "";
    regionControl[rc.region_id] = { status, controllerName, controllerRegionId };
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Carte des relations diplomatiques
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Visualisez les relations entre les nations. Sélectionnez une région sur la carte pour colorer selon le niveau de relation (moyenne entre pays des deux régions). Les pays non présents en base sont affichés en gris.
      </p>
      <RelationMapClient
        geoJson={geoJson}
        regionRelationMap={regionRelationMapSerialized}
        regionNames={regionNames}
        regionCountryNames={regionCountryNames}
        defaultSelectedRegionId={defaultSelectedRegionId}
        regionControl={regionControl}
      />
    </div>
  );
}
