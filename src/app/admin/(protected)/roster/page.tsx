import { createClient } from "@/lib/supabase/server";
import { RosterEditor } from "@/components/admin/RosterEditor";

export default async function AdminRosterPage() {
  const supabase = await createClient();

  const [unitsRes, levelsRes] = await Promise.all([
    supabase
      .from("military_roster_units")
      .select("*")
      .order("branch")
      .order("sort_order")
      .order("name_fr"),
    supabase
      .from("military_roster_unit_levels")
      .select("*")
      .order("unit_id")
      .order("level"),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Unités militaires
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Définissez les modèles d’unités disponibles, leurs niveaux, leurs effectifs, leur puissance et leur coût.
      </p>

      <RosterEditor initialUnits={unitsRes.data ?? []} initialLevels={levelsRes.data ?? []} />
    </div>
  );
}

