import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CountriesTable } from "@/components/countries/CountriesTable";
import { ResetStatsButton } from "./ResetStatsButton";
import { AdvanceDayButton } from "./AdvanceDayButton";
import { RandomizeBudgetsButton } from "./RandomizeBudgetsButton";
import { RandomizeIdeologiesButton } from "./RandomizeIdeologiesButton";
import { updateCountryAiStatus } from "./actions";

function normId(id: string | null | undefined): string {
  return String(id ?? "").trim().toLowerCase();
}

export default async function AdminPaysListPage() {
  const supabase = await createClient();
  const [
    { data: countries },
    { data: countryPlayers },
    { data: historyRows, error: historyError },
  ] = await Promise.all([
    supabase
      .from("countries")
      .select("id, name, slug, flag_url, regime, population, gdp, militarism, industry, science, stability, ai_status")
      .order("name"),
    supabase.from("country_players").select("country_id"),
    supabase
      .from("country_history")
      .select("country_id, date, population, gdp, militarism, industry, science, stability")
      .order("date", { ascending: false }),
  ]);

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

  const countryIdsWithPlayer = (countryPlayers ?? []).map((p) => (p as { country_id: string }).country_id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            Pays
          </h1>
          <p className="mt-1 text-[var(--foreground-muted)]">
            Modifier les nations et leurs indicateurs.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Link
            href="/admin/pays/nouveau"
            className="btn-primary rounded py-2 px-4"
            style={{ background: "var(--accent)", color: "#0f1419", fontWeight: 600 }}
          >
            Nouveau pays
          </Link>
          <ResetStatsButton />
          <AdvanceDayButton />
          <RandomizeBudgetsButton />
          <RandomizeIdeologiesButton />
        </div>
      </div>

      {!countries?.length ? (
        <div
          className="rounded-lg border p-8 text-center"
          style={{ background: "var(--background-panel)", borderColor: "var(--border)" }}
        >
          <p className="text-[var(--foreground-muted)]">Aucun pays. Créez-en un.</p>
          <Link
            href="/admin/pays/nouveau"
            className="mt-4 inline-block text-[var(--accent)] hover:underline"
          >
            Nouveau pays
          </Link>
        </div>
      ) : (
        <CountriesTable rows={rows} showModifierButton showAiStatusColumn updateAiStatusAction={updateCountryAiStatus} countryIdsWithPlayer={countryIdsWithPlayer} />
      )}
    </div>
  );
}
