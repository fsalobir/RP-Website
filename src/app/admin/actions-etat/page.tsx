import { createClient } from "@/lib/supabase/server";
import { StateActionTypesForm } from "@/components/admin/StateActionTypesForm";
import type { StateActionType } from "@/types/database";

export default async function AdminActionsEtatPage() {
  const supabase = await createClient();
  const { data: types } = await supabase
    .from("state_action_types")
    .select("*")
    .order("sort_order");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--foreground)]">
        Actions d'État
      </h1>
      <p className="mb-5 max-w-[72ch] text-sm leading-relaxed text-[var(--foreground-muted)]">
        Comparez les actions par usage, puis réglez leur coût, leurs conditions et leur résultat.
      </p>
      <StateActionTypesForm types={(types ?? []) as StateActionType[]} />
    </div>
  );
}
