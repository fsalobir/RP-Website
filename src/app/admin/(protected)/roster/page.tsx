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
  const loadError = [unitsRes, levelsRes].find((result) => result.error)?.error;
  if (loadError) throw new Error(`Impossible de charger les unités militaires : ${loadError.message}`);

  return (
    <div className="mx-auto max-w-[100rem] px-4 py-6">
      <h1 className="mb-5 text-2xl font-bold text-[var(--foreground)]">
        Unités militaires
      </h1>

      <RosterEditor initialUnits={unitsRes.data ?? []} initialLevels={levelsRes.data ?? []} />
    </div>
  );
}

