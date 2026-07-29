import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CountriesTable } from "@/components/countries/CountriesTable";
import { ResetStatsButton } from "../../pays/ResetStatsButton";
import { AdvanceDayButton } from "../../pays/AdvanceDayButton";
import { RandomizeBudgetsButton } from "../../pays/RandomizeBudgetsButton";
import { RandomizeIdeologiesButton } from "../../pays/RandomizeIdeologiesButton";
import { updateCountryAiStatus, updateCountryContinent } from "../../pays/actions";
import { AdminSettingsGuide } from "@/components/admin/AdminSettingsUi";

export default async function AdminPaysListPage() {
  const supabase = await createClient();
  const [
    { data: countries },
    { data: countryPlayers },
    { data: continents },
  ] = await Promise.all([
    supabase
      .from("countries")
      .select("id, name, slug, flag_url, regime, population, gdp, militarism, industry, science, stability, ai_status, continent_id")
      .order("name"),
    supabase.from("country_players").select("country_id, name").order("country_id"),
    supabase.from("continents").select("id, slug, label_fr").order("sort_order"),
  ]);

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
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            className="btn-primary inline-flex min-h-11 items-center rounded px-4 py-2"
            style={{ background: "var(--accent)", color: "#0f1419", fontWeight: 600 }}
          >
            Nouveau pays
          </Link>
        </div>
      </div>
      <AdminSettingsGuide
        purpose="Cette liste donne accès aux données de chaque pays. Les menus Continent et Statut IA sont enregistrés dès leur modification."
        impact="Le continent change le contexte régional. Le statut IA détermine si le pays peut recevoir des événements automatiques."
        check="Recherchez le pays, vérifiez son joueur éventuel, puis ouvrez sa fiche pour les réglages détaillés."
      />
      <details className="my-6 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--background-panel)" }}>
        <summary className="min-h-12 cursor-pointer px-4 py-3 font-medium text-[var(--foreground)]">
          Actions sur l’ensemble du monde
          <span className="ml-2 text-sm font-normal text-[var(--warning)]">à utiliser avec prudence</span>
        </summary>
        <div className="border-t p-4" style={{ borderColor: "var(--border-muted)" }}>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
            Ces commandes modifient tous les pays ou font avancer la simulation. Chaque action demande une confirmation.
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <AdvanceDayButton />
            <RandomizeBudgetsButton />
            <RandomizeIdeologiesButton />
            <ResetStatsButton />
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
        <CountriesTable
          rows={rows}
          showAiStatusColumn
          updateAiStatusAction={updateCountryAiStatus}
          countryIdsWithPlayer={countryIdsWithPlayer}
          adminLayout
          playerNameByCountryId={playerNameByCountryId}
          continents={continents ?? []}
          updateCountryContinentAction={updateCountryContinent}
        />
      )}
    </div>
  );
}

