import { createClient } from "@/lib/supabase/server";
import { ReglesForm } from "@/components/admin/ReglesForm";

export default async function AdminReglesPage() {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("rule_parameters")
    .select("*")
    .order("key");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <ReglesForm rules={rules ?? []} />
    </div>
  );
}
