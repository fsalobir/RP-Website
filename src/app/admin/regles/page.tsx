import { createClient } from "@/lib/supabase/server";
import { ReglesForm } from "@/components/admin/ReglesForm";

export default async function AdminReglesPage() {
  const supabase = await createClient();
  const [rulesRes, rosterRes] = await Promise.all([
    supabase.from("rule_parameters").select("*").order("key"),
    supabase.from("military_roster_units").select("id, name_fr").order("name_fr"),
  ]);
  const rules = rulesRes.data ?? [];
  const rosterUnits = rosterRes.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <ReglesForm rules={rules} rosterUnits={rosterUnits} />
    </div>
  );
}
