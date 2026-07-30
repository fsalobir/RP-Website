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
  const categories = (categoriesRes.data ?? []) as PerkCategory[];
  const perks = (perksRes.data ?? []) as Array<Perk & { perk_effects?: PerkEffect[]; perk_requirements?: PerkRequirement[] }>;
  const rosterUnits = rosterRes.data ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--foreground)]">Avantages</h1>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-[var(--foreground-muted)]">
        Créez les avantages, leurs conditions de déblocage et leurs effets sur un pays.
      </p>
      <div className="mt-5">
        <AvantagesManager
          categories={categories}
          perks={perks}
          rosterUnits={rosterUnits as Array<{ id: string; name_fr: string; branch: string; sub_type: string | null }>}
        />
      </div>
    </div>
  );
}
