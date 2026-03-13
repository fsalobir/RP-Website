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
import { RelationMapClient, type SphereData } from "./RelationMapClient";

const SPHERE_EMPIRE_COLORS = [
  "#f97316",
  "#06b6d4",
  "#8b5cf6",
  "#22c55e",
  "#f43f5e",
  "#eab308",
  "#14b8a6",
  "#3b82f6",
  "#a855f7",
  "#84cc16",
  "#f59e0b",
  "#ef4444",
];

type ControlRow = {
  country_id: string;
  controller_country_id: string;
  share_pct: number;
  is_annexed: boolean;
};

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
  const controlRows = (controlRes.data ?? []) as ControlRow[];

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

  const countryNames: Record<string, string> = {};
  countries.forEach((country) => {
    countryNames[country.id] = country.name;
  });

  function resolveEffectiveEmpireId(countryId: string): string {
    const visited = new Set<string>();
    let current = countryId;
    while (!visited.has(current)) {
      visited.add(current);
      const controls = controlsByCountry.get(current) ?? [];
      if (controls.length !== 1) return current;
      const sole = controls[0];
      if (Number(sole.share_pct) < 100) return current;
      if (!sole.controller_country_id || sole.controller_country_id === current) return current;
      current = sole.controller_country_id;
    }
    return current;
  }

  const sphereCountryControl: SphereData["countryControl"] = {};
  const empireCoreCountryIds = new Set<string>();
  controlsByCountry.forEach((controls, countryId) => {
    const aggregatedByEmpire = new Map<string, number>();
    for (const control of controls) {
      const share = Math.max(0, Number(control.share_pct) || 0);
      if (share <= 0) continue;
      const effectiveEmpireId = resolveEffectiveEmpireId(control.controller_country_id);
      const prev = aggregatedByEmpire.get(effectiveEmpireId) ?? 0;
      aggregatedByEmpire.set(effectiveEmpireId, prev + share);
    }
    const slices = Array.from(aggregatedByEmpire.entries())
      .map(([controllerId, sharePct]) => ({
        controllerId,
        sharePct,
      }))
      .map((control) => ({
        controllerId: control.controllerId,
        sharePct: Math.max(0, Number(control.sharePct) || 0),
      }))
      .filter((slice) => slice.sharePct > 0);
    if (slices.length === 0) return;
    slices.forEach((slice) => empireCoreCountryIds.add(slice.controllerId));
    const is100Single = slices.length === 1 && slices[0].sharePct >= 100;
    sphereCountryControl[countryId] = {
      is100Single,
      controllerId: is100Single ? slices[0].controllerId : undefined,
      slices: slices
        .sort((a, b) => b.sharePct - a.sharePct)
        .map((slice) => ({ controllerId: slice.controllerId, sharePct: Math.min(100, slice.sharePct) })),
    };
  });

  const empireIds = Array.from(empireCoreCountryIds).sort((a, b) =>
    (countryNames[a] ?? a).localeCompare(countryNames[b] ?? b, "fr")
  );
  const empires = empireIds.map((id, index) => ({
    id,
    name: countryNames[id] ?? "Empire inconnu",
    color: SPHERE_EMPIRE_COLORS[index % SPHERE_EMPIRE_COLORS.length],
  }));

  const sphereData: SphereData = {
    empires,
    countryControl: sphereCountryControl,
    countryNames,
    empireCoreCountryIds: Array.from(empireCoreCountryIds),
  };

  return (
    <div className="relative w-full px-4 py-10">
      {/* Arrière-plan pleine largeur écran */}
      <div
        className="absolute top-0 bottom-0 overflow-hidden"
        style={{ left: "50%", marginLeft: "-50vw", width: "100vw" }}
        aria-hidden
      >
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
          style={{
            backgroundImage: "url(/images/site/carte-diplomatique-bg.png)",
            filter: "blur(2px)",
          }}
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>
      <div className="relative z-10 max-w-6xl mx-auto">
        <RelationMapClient
          geoJson={geoJson}
          regionRelationMap={regionRelationMapSerialized}
          regionNames={regionNames}
          regionCountryNames={regionCountryNames}
          defaultSelectedRegionId={defaultSelectedRegionId}
          regionControl={regionControl}
          sphereData={sphereData}
        />
      </div>
    </div>
  );
}
