import { createClient } from "@/lib/supabase/server";
import { AvantagesManager } from "./AvantagesManager";
import type { PerkCategory, Perk, PerkEffect, PerkRequirement } from "@/types/database";

export default async function AdminAvantagesPage() {
  const supabase = await createClient();
  const [categoriesRes, perksRes, rosterRes] = await Promise.all([
    supabase.from("perk_categories").select("*").order("sort_order"),
    supabase.from("perks").select("*, perk_effects(*), perk_requirements(*)").order("sort_order"),
    supabase.from("military_roster_units").select("id, name_fr, branch, sub_type").order("branch").order("sort_order"),
  ]);
  const loadError = [categoriesRes, perksRes, rosterRes].find((result) => result.error)?.error;
  if (loadError) throw new Error(`Impossible de charger les avantages : ${loadError.message}`);
  const categories = (categoriesRes.data ?? []) as PerkCategory[];
  const perks = (perksRes.data ?? []) as Array<Perk & { perk_effects?: PerkEffect[]; perk_requirements?: PerkRequirement[] }>;
  const rosterUnits = rosterRes.data ?? [];

  return (
    <div className="mx-auto max-w-[100rem] px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--foreground)]">Avantages</h1>
      <div className="mt-4">
        <AvantagesManager
          categories={categories}
          perks={perks}
          rosterUnits={rosterUnits as Array<{ id: string; name_fr: string; branch: string; sub_type: string | null }>}
        />
      </div>
    </div>
  );
}
