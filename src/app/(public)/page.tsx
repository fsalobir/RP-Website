import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CountriesTable } from "@/components/countries/CountriesTable";
import { computeHardPowerByCountry } from "@/lib/hardPower";
import { computeInfluenceForAll, applyInfluenceModifiers } from "@/lib/influence";
import { getInfluenceModifiersByCountry } from "@/lib/countryEffects";
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

  const [countriesResult, historyResult, rulesRes, rosterUnitsRes, rosterLevelsRes, countryMilitaryRes, effectsRes, lawsRes, controlRes] = await Promise.all([
    supabase
      .from("countries")
      .select("id, name, slug, flag_url, regime, population, gdp, militarism, industry, science, stability")
      .order("name"),
    supabase
      .from("country_history")
      .select("country_id, date, population, gdp, militarism, industry, science, stability")
      .order("date", { ascending: false }),
    supabase.from("rule_parameters").select("key, value").in("key", [
      "influence_config", "global_growth_effects",
      "mobilisation_config", "mobilisation_level_effects",
      "law_auto_industry_config", "law_auto_industry_level_effects",
      "law_air_industry_config", "law_air_industry_level_effects",
      "law_naval_industry_config", "law_naval_industry_level_effects",
      "law_research_config", "law_research_level_effects",
    ]),
    supabase.from("military_roster_units").select("id, branch, base_count"),
    supabase.from("military_roster_unit_levels").select("unit_id, level, hard_power"),
    supabase.from("country_military_units").select("country_id, roster_unit_id, current_level, extra_count"),
    supabase.from("country_effects").select("country_id, effect_kind, effect_target, value, duration_remaining, duration_kind").or("duration_remaining.gt.0,duration_kind.eq.permanent"),
    supabase.from("country_laws").select("country_id, law_key, score"),
    supabase.from("country_control").select("country_id, controller_country_id, share_pct, is_annexed"),
  ]);

  const { data: countries, error } = countriesResult;
  const { data: historyRows, error: historyError } = historyResult;
  const rulesByKey = Object.fromEntries((rulesRes.data ?? []).map((r) => [r.key, r.value]));
  const ruleParametersByKey: Record<string, { value: unknown }> = {};
  for (const r of rulesRes.data ?? []) ruleParametersByKey[r.key] = { value: r.value };
  const influenceConfig = rulesByKey.influence_config as Record<string, unknown> | undefined;
  const globalGrowthEffects = (Array.isArray(rulesByKey.global_growth_effects) ? rulesByKey.global_growth_effects : []) as Array<{ effect_kind: string; effect_target: string | null; value: number }>;
  const rosterUnits = (rosterUnitsRes.data ?? []) as Array<{ id: string; branch: MilitaryBranch; base_count: number }>;
  const rosterLevels = (rosterLevelsRes.data ?? []) as Array<{ unit_id: string; level: number; hard_power: number }>;
  const countryMilitaryUnits = (countryMilitaryRes.data ?? []) as Array<{ country_id: string; roster_unit_id: string; current_level: number; extra_count: number }>;
  const countryEffectsRows = (effectsRes.data ?? []) as Array<{ country_id: string; effect_kind: string; effect_target: string | null; value: number; duration_remaining?: number }>;
  const countryLawRows = (lawsRes.data ?? []) as Array<{ country_id: string; law_key: string; score: number }>;
  const controlRows = (controlRes.data ?? []) as Array<{ country_id: string; controller_country_id: string; share_pct: number; is_annexed: boolean }>;
  const countryById = new Map((countries ?? []).map((c) => [c.id, c]));
  const sphereByControllerId = new Map<string, Array<{ slug: string; flag_url: string | null; name: string; share_pct: number; is_annexed: boolean }>>();
  for (const r of controlRows) {
    const controlled = countryById.get(r.country_id);
    if (!controlled) continue;
    const list = sphereByControllerId.get(r.controller_country_id) ?? [];
    list.push({
      slug: controlled.slug,
      flag_url: controlled.flag_url,
      name: controlled.name,
      share_pct: Number(r.share_pct),
      is_annexed: !!r.is_annexed,
    });
    sphereByControllerId.set(r.controller_country_id, list);
  }

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
  const { byCountry: influenceByCountryRaw } = computeInfluenceForAll(
    countries ?? [],
    hardPowerByCountry,
    (influenceConfig ?? {}) as Parameters<typeof computeInfluenceForAll>[2]
  );
  const countryIds = (countries ?? []).map((c) => c.id);
  const influenceModifiersByCountry = getInfluenceModifiersByCountry(
    countryIds,
    countryEffectsRows,
    countryLawRows,
    ruleParametersByKey,
    globalGrowthEffects
  );
  const influenceByCountry = new Map(
    countryIds.map((id) => {
      const raw = influenceByCountryRaw.get(id);
      const mods = influenceModifiersByCountry.get(id);
      if (!raw) return [id, null] as const;
      const result = mods ? applyInfluenceModifiers(raw, mods) : raw;
      return [id, result] as const;
    })
  );

  const rows =
    countries?.map((c) => ({
      country: c,
      prev: latestByCountry.get(normId(c.id)) ?? null,
      influence: influenceByCountry.get(c.id)?.influence ?? null,
      sphere: sphereByControllerId.get(c.id) ?? [],
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
        <CountriesTable rows={rows} showSearch showWikiTooltips />
      )}
    </div>
  );
}
