type SupabaseClientLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => unknown;
      maybeSingle: () => Promise<{ data?: { value?: unknown } | null }>;
    };
  };
};

/** Ligne de la table country_relations (une paire normalisée country_a_id < country_b_id). */
export interface CountryRelationRow {
  country_a_id: string;
  country_b_id: string;
  value: number;
  updated_at: string;
}

const RELATION_MIN = -100;
const RELATION_MAX = 100;

/** Retourne [minId, maxId] pour garantir une clé unique par paire. */
export function normalizePair(
  countryIdA: string,
  countryIdB: string
): [string, string] {
  if (countryIdA === countryIdB) return [countryIdA, countryIdB];
  return countryIdA < countryIdB ? [countryIdA, countryIdB] : [countryIdB, countryIdA];
}

/** Valeur de relation entre deux pays (0 si aucune ligne). */
export async function getRelation(
  supabase: SupabaseClientLike,
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

/** Toutes les lignes de relations (pour construire une map ou colorer la carte). */
export async function getAllRelationRows(
  supabase: SupabaseClientLike
): Promise<CountryRelationRow[]> {
  const res = (await (supabase
    .from("country_relations")
    .select("country_a_id, country_b_id, value, updated_at") as unknown)) as {
    data?: CountryRelationRow[] | null;
    error?: { message?: string } | null;
  };
  if (res.error) throw new Error(res.error.message ?? "Erreur lors du chargement des relations.");
  return (res.data ?? []) as CountryRelationRow[];
}

/** Construit une map clé "a_id|b_id" (a < b) → value. */
export function relationRowsToMap(rows: CountryRelationRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(`${r.country_a_id}|${r.country_b_id}`, r.value);
  }
  return map;
}

/** Récupère la valeur entre deux pays depuis la map (0 si absente). */
export function getRelationFromMap(
  map: Map<string, number>,
  countryIdA: string,
  countryIdB: string
): number {
  if (countryIdA === countryIdB) return 0;
  const [a, b] = normalizePair(countryIdA, countryIdB);
  return map.get(`${a}|${b}`) ?? 0;
}

export { RELATION_MIN, RELATION_MAX };
