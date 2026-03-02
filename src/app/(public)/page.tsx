import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CountriesTable } from "@/components/countries/CountriesTable";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { computeInfluenceForAll } from "@/lib/influence";
import type { MilitaryBranch } from "@/types/database";

export const revalidate = 3600;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const showUnauthorized = params.error === "non-autorise";
  const supabase = await createClient();

  const [countriesResult, historyResult, rulesRes, rosterUnitsRes, rosterLevelsRes, countryMilitaryRes] = await Promise.all([
    supabase
      .from("countries")
      .select("id, name, slug, flag_url, regime, population, gdp, militarism, industry, science, stability")
      .order("name"),
    supabase
      .from("country_history")
      .select("country_id, date, population, gdp, militarism, industry, science, stability")
      .order("date", { ascending: false }),
    supabase.from("rule_parameters").select("key, value").eq("key", "influence_config"),
    supabase.from("military_roster_units").select("id, branch, base_count"),
    supabase.from("military_roster_unit_levels").select("unit_id, level, hard_power"),
    supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
  ]);

  const { data: countries, error } = countriesResult;
  const { data: historyRows, error: historyError } = historyResult;
  const influenceConfig = (rulesRes.data ?? []).find((r) => r.key === "influence_config")?.value as Record<string, unknown> | undefined;
  const rosterUnits = (rosterUnitsRes.data ?? []) as Array<{ id: string; branch: MilitaryBranch; base_count: number }>;
  const rosterLevels = (rosterLevelsRes.data ?? []) as Array<{ unit_id: string; level: number; hard_power: number }>;
  const countryMilitaryUnits = (countryMilitaryRes.data ?? []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>;

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-[var(--danger)]">
          Erreur lors du chargement des pays. Vérifiez que la migration Supabase a été exécutée.
        </p>
      </div>
    );
  }

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

  const hardPowerByCountry = computeHardPowerByCountry(countryMilitaryUnits, rosterUnits, rosterLevels);
  const { byCountry: influenceByCountry } = computeInfluenceForAll(
    countries ?? [],
    hardPowerByCountry,
    (influenceConfig ?? {}) as Parameters<typeof computeInfluenceForAll>[2]
  );

  const rows =
    countries?.map((c) => ({
      country: c,
      prev: latestByCountry.get(normId(c.id)) ?? null,
      influence: influenceByCountry.get(c.id)?.influence ?? null,
    })) ?? [];

  const panelStyle = {
    background: "var(--background-panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {showUnauthorized && (
        <div
          className="mb-6 rounded-lg border px-4 py-3"
          style={{ borderColor: "var(--danger)", background: "var(--background-panel)" }}
        >
          <p className="text-[var(--danger)]">Compte non autorisé. Seuls les administrateurs et les joueurs assignés à un pays peuvent se connecter.</p>
        </div>
      )}
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
