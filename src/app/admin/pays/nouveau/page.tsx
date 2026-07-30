import { createClient } from "@/lib/supabase/server";
import { CountryForm } from "@/components/admin/CountryForm";
import Link from "next/link";

export default async function AdminPaysNouveauPage() {
  const supabase = await createClient();
  const { data: continents, error } = await supabase
    .from("continents")
    .select("id, slug, label_fr")
    .order("sort_order");
  if (error) throw new Error(`Impossible de charger les continents : ${error.message}`);
  return (
    <div className="mx-auto max-w-[100rem] px-4 py-5 sm:px-6">
      <header className="mb-5 flex items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Nouveau pays</h1>
        <Link href="/admin/pays" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
          ← Retour
        </Link>
      </header>
      <CountryForm continents={continents ?? []} />
    </div>
  );
}
