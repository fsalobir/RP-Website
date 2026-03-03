import { createClient } from "@/lib/supabase/server";
import { getAllRelationRows, relationRowsToMap } from "@/lib/relations";
import { MatriceDiplomatiqueForm } from "./MatriceDiplomatiqueForm";

export default async function AdminMatriceDiplomatiquePage() {
  const supabase = await createClient();
  const [countriesRes, rows] = await Promise.all([
    supabase.from("countries").select("id, name, slug").order("name"),
    getAllRelationRows(supabase),
  ]);

  const countries = (countriesRes.data ?? []) as { id: string; name: string; slug: string }[];
  const map = relationRowsToMap(rows);
  const relationMap: Record<string, number> = {};
  map.forEach((v, k) => {
    relationMap[k] = v;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Matrice Diplomatique
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Définissez la relation bilatérale entre deux pays (-100 = haine féroce, +100 = loyauté absolue). Une seule valeur par paire.
      </p>
      <MatriceDiplomatiqueForm countries={countries} relationMap={relationMap} />
    </div>
  );
}
