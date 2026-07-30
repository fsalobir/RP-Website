import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CountriesTable } from "@/components/countries/CountriesTable";
import { ResetStatsButton } from "../../pays/ResetStatsButton";
import { AdvanceDayButton } from "../../pays/AdvanceDayButton";
import { RandomizeBudgetsButton } from "../../pays/RandomizeBudgetsButton";
import { RandomizeIdeologiesButton } from "../../pays/RandomizeIdeologiesButton";
import { WorldActionLock } from "../../pays/WorldActionLock";
import { updateCountryAiStatus, updateCountryContinent } from "../../pays/actions";

export default async function AdminPaysListPage() {
  const supabase = await createClient();
  const [countriesRes, countryPlayersRes, continentsRes] = await Promise.all([
    supabase
      .from("countries")
      .select("id, name, slug, flag_url, regime, population, gdp, militarism, industry, science, stability, ai_status, continent_id")
      .order("name"),
    supabase.from("country_players").select("country_id, name").order("country_id"),
    supabase.from("continents").select("id, slug, label_fr").order("sort_order"),
  ]);
  const loadError = [countriesRes, countryPlayersRes, continentsRes].find((result) => result.error)?.error;
  if (loadError) throw new Error(`Impossible de charger les pays : ${loadError.message}`);
  const countries = countriesRes.data;
  const countryPlayers = countryPlayersRes.data;
  const continents = continentsRes.data;

  const playerNameByCountryId: Record<string, string> = {};
  for (const p of countryPlayers ?? []) {
    const row = p as { country_id: string; name: string | null };
    const name = row.name?.trim() || null;
    if (row.country_id) playerNameByCountryId[row.country_id] = name ?? "—";
  }

  const rows =
    countries?.map((c) => ({
      country: c,
      prev: null,
      influence: null as number | null,
    })) ?? [];

  const countryIdsWithPlayer = (countryPlayers ?? []).map((p) => (p as { country_id: string }).country_id);

  return (
    <div className="mx-auto max-w-[100rem] px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Pays</h1>
        <Link
          href="/admin/pays/nouveau"
          className="btn-primary inline-flex min-h-11 items-center rounded-lg px-4 py-2"
          style={{ background: "var(--accent)", color: "#0f1419", fontWeight: 700 }}
        >
          + Nouveau pays
        </Link>
      </header>

      <details className="group border-b" style={{ borderColor: "var(--border)" }}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <span>Actions sur tous les pays</span>
          <span className="flex items-center gap-2 font-normal text-[var(--foreground-muted)]">
            4 commandes sensibles
            <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
          </span>
        </summary>
        <div className="border-t py-3" style={{ borderColor: "var(--border-muted)" }}>
          <div className="flex flex-wrap items-start gap-2">
            <WorldActionLock>
              <AdvanceDayButton />
              <RandomizeBudgetsButton />
              <RandomizeIdeologiesButton />
              <ResetStatsButton />
            </WorldActionLock>
          </div>
        </div>
      </details>

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
        <div className="mt-4">
          <CountriesTable
            rows={rows}
            showAiStatusColumn
            showModifierButton
            updateAiStatusAction={updateCountryAiStatus}
            countryIdsWithPlayer={countryIdsWithPlayer}
            adminLayout
            playerNameByCountryId={playerNameByCountryId}
            continents={continents ?? []}
            updateCountryContinentAction={updateCountryContinent}
          />
        </div>
      )}
    </div>
  );
}

