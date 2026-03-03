import { createClient } from "@/lib/supabase/server";
import { RegionsCarteForm } from "./RegionsCarteForm";

export default async function AdminRegionsCartePage() {
  const supabase = await createClient();
  const [regionsRes, linksRes, countriesRes] = await Promise.all([
    supabase.from("map_regions").select("id, name, slug").order("sort_order"),
    supabase.from("map_region_countries").select("region_id, country_id"),
    supabase.from("countries").select("id, name"),
  ]);

  const regions = (regionsRes.data ?? []) as { id: string; name: string; slug: string }[];
  const links = (linksRes.data ?? []) as { region_id: string; country_id: string }[];
  const countries = (countriesRes.data ?? []) as { id: string; name: string }[];
  const countryIdToName = new Map(countries.map((c) => [c.id, c.name]));

  const countryNamesByRegion = new Map<string, string[]>();
  for (const l of links) {
    const name = countryIdToName.get(l.country_id);
    if (!name) continue;
    const list = countryNamesByRegion.get(l.region_id) ?? [];
    list.push(name);
    countryNamesByRegion.set(l.region_id, list);
  }

  const regionsWithCountries = regions.map((r) => ({
    ...r,
    country_count: countryNamesByRegion.get(r.id)?.length ?? 0,
    country_names: countryNamesByRegion.get(r.id) ?? [],
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Régions de la carte
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Gérez les régions affichées sur la carte des relations (liste et réinitialisation).
      </p>
      <RegionsCarteForm regions={regionsWithCountries} />
    </div>
  );
}
