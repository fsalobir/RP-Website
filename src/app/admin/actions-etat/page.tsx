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
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Actions d'État
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Définir les coûts (en actions) et les paramètres pour chaque type d'action d'État.
      </p>
      <StateActionTypesForm types={(types ?? []) as StateActionType[]} />
    </div>
  );
}
