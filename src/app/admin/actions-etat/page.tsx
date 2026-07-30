import { createClient } from "@/lib/supabase/server";
import { StateActionTypesForm } from "@/components/admin/StateActionTypesForm";
import type { StateActionType } from "@/types/database";

export default async function AdminActionsEtatPage() {
  const supabase = await createClient();
  const { data: types, error } = await supabase
    .from("state_action_types")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(`Impossible de charger les actions d'État : ${error.message}`);

  return (
    <div className="mx-auto max-w-[100rem] px-4 py-6">
      <h1 className="mb-5 text-2xl font-bold text-[var(--foreground)]">
        Actions d'État
      </h1>
      <StateActionTypesForm types={(types ?? []) as StateActionType[]} />
    </div>
  );
}
