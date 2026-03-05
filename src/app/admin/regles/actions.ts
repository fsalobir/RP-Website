"use server";

import { revalidateTag, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Invalide les caches impactés par la modification des règles.
 * - Fiches pays : tag country-page-globals
 * - Classement et liste des nations : dépendent de influence_config et autres règles → revalidation immédiate pour l'équilibrage
 */
export async function revalidateCountryPageGlobals() {
  revalidateTag("country-page-globals", "max");
  revalidatePath("/classement");
  revalidatePath("/");
}

/**
 * Recalcule les paires de régions limitrophes (map_region_neighbors) à partir des géométries map_regions.
 * À appeler après toute modification des formes de la carte. Utilisé par le mode de distance « Voisins » des events IA.
 */
export async function computeMapRegionNeighbors(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const { error } = await supabase.rpc("compute_map_region_neighbors");
  if (error) return { error: error.message };
  revalidatePath("/admin/regles");
  return {};
}

export type VoisinageEntry = {
  country_id: string;
  country_name: string;
  neighbors: { id: string; name: string }[];
};

/**
 * Retourne pour chaque pays (ayant une région) la liste des pays voisins (régions limitrophes).
 * Utilisé pour le debug du mode « Voisins » des events IA.
 */
export async function getVoisinagesByCountry(): Promise<{ error?: string; data?: VoisinageEntry[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { error: "Réservé aux admins." };

  const [mrcRes, mrnRes, countriesRes] = await Promise.all([
    supabase.from("map_region_countries").select("country_id, region_id"),
    supabase.from("map_region_neighbors").select("region_a_id, region_b_id"),
    supabase.from("countries").select("id, name"),
  ]);

  if (mrcRes.error) return { error: mrcRes.error.message };
  if (mrnRes.error) return { error: mrnRes.error.message };
  if (countriesRes.error) return { error: countriesRes.error.message };

  const countryById = new Map<string, { name: string }>();
  for (const c of countriesRes.data ?? []) {
    countryById.set(c.id, { name: c.name ?? "" });
  }

  const regionToCountries = new Map<string, Set<string>>();
  const countryToRegions = new Map<string, Set<string>>();
  for (const row of mrcRes.data ?? []) {
    const cid = row.country_id as string;
    const rid = row.region_id as string;
    if (!regionToCountries.has(rid)) regionToCountries.set(rid, new Set());
    regionToCountries.get(rid)!.add(cid);
    if (!countryToRegions.has(cid)) countryToRegions.set(cid, new Set());
    countryToRegions.get(cid)!.add(rid);
  }

  const regionToNeighborRegions = new Map<string, Set<string>>();
  for (const row of mrnRes.data ?? []) {
    const a = row.region_a_id as string;
    const b = row.region_b_id as string;
    if (!regionToNeighborRegions.has(a)) regionToNeighborRegions.set(a, new Set());
    regionToNeighborRegions.get(a)!.add(b);
    if (!regionToNeighborRegions.has(b)) regionToNeighborRegions.set(b, new Set());
    regionToNeighborRegions.get(b)!.add(a);
  }

  const result: VoisinageEntry[] = [];
  const seenCountries = new Set<string>();

  for (const [countryId, regionIds] of countryToRegions) {
    const neighborCountryIds = new Set<string>();
    for (const rid of regionIds) {
      const neighborRegions = regionToNeighborRegions.get(rid);
      if (!neighborRegions) continue;
      for (const nrid of neighborRegions) {
        const countriesInRegion = regionToCountries.get(nrid);
        if (!countriesInRegion) continue;
        for (const cid of countriesInRegion) {
          if (cid !== countryId) neighborCountryIds.add(cid);
        }
      }
    }
    const name = countryById.get(countryId)?.name ?? countryId;
    result.push({
      country_id: countryId,
      country_name: name,
      neighbors: Array.from(neighborCountryIds)
        .map((id) => ({ id, name: countryById.get(id)?.name ?? id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
    seenCountries.add(countryId);
  }

  result.sort((a, b) => a.country_name.localeCompare(b.country_name));
  return { data: result };
}
