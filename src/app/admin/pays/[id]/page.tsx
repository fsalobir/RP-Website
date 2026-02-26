import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CountryForm } from "@/components/admin/CountryForm";

export default async function AdminPaysEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: country, error } = await supabase
    .from("countries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !country) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Modifier {country.name}
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Généralités, société, macros, militaire et avantages.
      </p>
      <CountryForm country={country} />
    </div>
  );
}
