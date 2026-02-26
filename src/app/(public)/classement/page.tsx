import { createClient } from "@/lib/supabase/server";
import { ClassementContent } from "@/components/classement/ClassementContent";

export const dynamic = "force-dynamic";

function normId(id: string | null | undefined): string {
  return String(id ?? "").trim().toLowerCase();
}

export default async function ClassementPage() {
  const supabase = await createClient();
  const { data: countries } = await supabase
    .from("countries")
    .select("id, name, slug, flag_url, population, gdp, militarism, industry, science, stability")
    .order("name");

  const { data: historyRows, error: historyError } = await supabase
    .from("country_history")
    .select("country_id, date, population, gdp, militarism, industry, science, stability")
    .order("date", { ascending: false });

  const latestByCountry = new Map<string, (typeof historyRows)[0]>();
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Classement des nations
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Vue d'ensemble des puissances mondiales par critères global, militaire et économique.
      </p>
      <ClassementContent rows={rows} />
    </div>
  );
}
