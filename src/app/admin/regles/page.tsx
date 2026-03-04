import { createClient } from "@/lib/supabase/server";
import { getAllRelationRows, relationRowsToMap } from "@/lib/relations";
import { ReglesForm } from "@/components/admin/ReglesForm";

export default async function AdminReglesPage() {
  const supabase = await createClient();
  const [rulesRes, rosterRes, countriesRes, rows] = await Promise.all([
    supabase.from("rule_parameters").select("*").order("key"),
    supabase.from("military_roster_units").select("id, name_fr").order("name_fr"),
    supabase.from("countries").select("id, name, slug").order("name"),
    getAllRelationRows(supabase),
  ]);
  const rules = rulesRes.data ?? [];
  const rosterUnits = rosterRes.data ?? [];
  const countries = (countriesRes.data ?? []) as { id: string; name: string; slug: string }[];
  const map = relationRowsToMap(rows);
  const relationMap: Record<string, number> = {};
  map.forEach((v, k) => {
    relationMap[k] = v;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <ReglesForm rules={rules} rosterUnits={rosterUnits} countries={countries} relationMap={relationMap} />
    </div>
  );
}
