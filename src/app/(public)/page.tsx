import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CountriesTable } from "@/components/countries/CountriesTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const supabase = await createClient();

  const { data: countries, error } = await supabase
    .from("countries")
    .select("id, name, slug, flag_url, regime, population, gdp, militarism, industry, science, stability")
    .order("name");

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-[var(--danger)]">
          Erreur lors du chargement des pays. Vérifiez que la migration Supabase a été exécutée.
        </p>
      </div>
    );
  }

  const { data: historyRows, error: historyError } = await supabase
    .from("country_history")
    .select("country_id, date, population, gdp, militarism, industry, science, stability")
    .order("date", { ascending: false });

  function normId(id: string | null | undefined): string {
    return String(id ?? "").trim().toLowerCase();
  }

  const latestByCountry = new Map<string, NonNullable<typeof historyRows>[number]>();
  if (historyRows?.length && !historyError) {
    for (const row of historyRows) {
      const id = normId(row.country_id);
      if (id && !latestByCountry.has(id)) {
        latestByCountry.set(id, row);
      }
    }
  }

  const rows =
    countries?.map((c) => ({
      country: c,
      prev: latestByCountry.get(normId(c.id)) ?? null,
    })) ?? [];

  const panelStyle = {
    background: "var(--background-panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          Nations
        </h1>
        <p className="mt-1 text-[var(--foreground-muted)]">
          Sélectionnez un pays pour consulter ses indicateurs, forces militaires et avantages. Cliquez sur un en-tête de colonne pour trier.
        </p>
      </div>

      {!countries?.length ? (
        <div className="rounded-lg border p-8 text-center" style={panelStyle}>
          <p className="text-[var(--foreground-muted)]">
            Aucun pays en base. Utilisez l'administration pour en ajouter.
          </p>
          <Link
            href="/admin/connexion"
            className="mt-4 inline-block rounded py-2 px-4 font-semibold"
            style={{ background: "var(--accent)", color: "#0f1419" }}
          >
            Aller à l'administration
          </Link>
        </div>
      ) : (
        <CountriesTable rows={rows} />
      )}
    </div>
  );
}
