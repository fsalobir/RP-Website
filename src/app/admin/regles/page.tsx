import { createClient } from "@/lib/supabase/server";
import { getAllRelationRows, relationRowsToMap } from "@/lib/relations";
import { ReglesForm } from "@/components/admin/ReglesForm";

export default async function AdminReglesPage() {
  const supabase = await createClient();
  const AI_EVENT_ACTION_KEYS = [
    "insulte_diplomatique",
    "ouverture_diplomatique",
    "prise_influence",
    "escarmouche_militaire",
    "conflit_arme",
    "guerre_ouverte",
  ];

  const [rulesRes, rosterRes, countriesRes, rows, stateActionTypesRes] = await Promise.all([
    supabase.from("rule_parameters").select("*").order("key"),
    supabase.from("military_roster_units").select("id, name_fr").order("name_fr"),
    supabase.from("countries").select("id, name, slug").order("name"),
    getAllRelationRows(supabase),
    supabase.from("state_action_types").select("id, key, label_fr").in("key", AI_EVENT_ACTION_KEYS).order("sort_order"),
  ]);
  const rules = rulesRes.data ?? [];
  const rosterUnits = rosterRes.data ?? [];
  const countries = (countriesRes.data ?? []) as { id: string; name: string; slug: string }[];
  const stateActionTypesForAi = (stateActionTypesRes.data ?? []) as { id: string; key: string; label_fr: string }[];
  const map = relationRowsToMap(rows);
  const relationMap: Record<string, number> = {};
  map.forEach((v, k) => {
    relationMap[k] = v;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <ReglesForm
        rules={rules}
        rosterUnits={rosterUnits}
        countries={countries}
        relationMap={relationMap}
        stateActionTypesForAi={stateActionTypesForAi}
      />
    </div>
  );
}
