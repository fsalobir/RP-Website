import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
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
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            Avantages
          </h1>
          <p className="mt-1 text-[var(--foreground-muted)]">
            Catégories et avantages (bonus conditionnés par les stats). Les effets utilisent la même logique que les effets actifs.
          </p>
        </div>
        <Link
          href="/admin"
          className="shrink-0 rounded border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] hover:text-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        >
          Retour tableau de bord
        </Link>
      </div>
      <div className="mt-8">
        <AvantagesManager
          categories={categories}
          perks={perks}
          rosterUnits={rosterUnits as Array<{ id: string; name_fr: string; branch: string; sub_type: string | null }>}
        />
      </div>
    </div>
  );
}
