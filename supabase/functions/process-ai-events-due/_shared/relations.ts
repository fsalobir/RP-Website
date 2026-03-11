import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const RELATION_MIN = -100;
export const RELATION_MAX = 100;

export function normalizePair(countryIdA: string, countryIdB: string): [string, string] {
  if (countryIdA === countryIdB) return [countryIdA, countryIdB];
  return countryIdA < countryIdB ? [countryIdA, countryIdB] : [countryIdB, countryIdA];
}

export async function getRelation(
  supabase: SupabaseClient,
  countryIdA: string,
  countryIdB: string
): Promise<number> {
  if (countryIdA === countryIdB) return 0;
  const [a, b] = normalizePair(countryIdA, countryIdB);
  const { data } = await supabase
    .from("country_relations")
    .select("value")
    .eq("country_a_id", a)
    .eq("country_b_id", b)
    .maybeSingle();
  return Number(data?.value ?? 0);
}
