import { createClient } from "@/lib/supabase/server";
import { CountryForm } from "@/components/admin/CountryForm";

export default async function AdminPaysNouveauPage() {
  const supabase = await createClient();
  const { data: continents } = await supabase
    .from("continents")
    .select("id, slug, label_fr")
    .order("sort_order");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Nouveau pays
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Remplissez les champs puis enregistrez.
      </p>
      <CountryForm continents={continents ?? []} />
    </div>
  );
}
