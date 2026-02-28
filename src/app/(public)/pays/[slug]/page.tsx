import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CountryTabs } from "./CountryTabs";
import type {
  CountryUpdateLog,
  MilitaryBranch,
  MilitaryRosterUnit,
  MilitaryRosterUnitLevel,
  CountryMilitaryUnit,
} from "@/types/database";

export type RosterRowByBranch = {
  unit: MilitaryRosterUnit;
  countryState: CountryMilitaryUnit | null;
  levels: { level: number; manpower: number }[];
};

export default async function CountryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: country, error } = await supabase
    .from("countries")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !country) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  let isPlayerForThisCountry = false;
  let assignedPlayerEmail: string | null = null;
  if (user) {
    const [adminRes, playerForCountryRes, playerOfCountryRes] = await Promise.all([
      supabase.from("admins").select("id").eq("user_id", user.id).single(),
      supabase.from("country_players").select("country_id").eq("user_id", user.id).eq("country_id", country.id).maybeSingle(),
      supabase.from("country_players").select("email, name").eq("country_id", country.id).maybeSingle(),
    ]);
    isAdmin = !!adminRes.data;
    isPlayerForThisCountry = !!playerForCountryRes.data;
    const playerRow = playerOfCountryRes.data;
    assignedPlayerEmail = (playerRow?.name?.trim() || playerRow?.email) ?? null;
  }
  const backHref = isAdmin ? "/admin/pays" : "/";

  const ruleKeys = [
    "population_growth_base_rate",
    "gdp_growth_base_rate",
    "gdp_growth_per_militarism",
    "gdp_growth_per_industry",
    "gdp_growth_per_science",
    "gdp_growth_per_stability",
    "population_growth_per_militarism",
    "population_growth_per_industry",
    "population_growth_per_science",
    "population_growth_per_stability",
    "budget_sante",
    "budget_education",
    "budget_recherche",
    "budget_infrastructure",
    "budget_industrie",
    "budget_defense",
    "budget_interieur",
    "budget_affaires_etrangeres",
  ];

  const [macrosRes, limitsRes, perksDefRes, countryPerksRes, budgetRes, effectsRes, countriesRes, updateLogsRes, ruleParamsRes, rosterUnitsRes, rosterLevelsRes, countryMilitaryUnitsRes] = await Promise.all([
    supabase.from("country_macros").select("*").eq("country_id", country.id),
    supabase
      .from("country_military_limits")
      .select("*, military_unit_types(*)")
      .eq("country_id", country.id),
    supabase.from("perks").select("*").order("sort_order"),
    supabase.from("country_perks").select("perk_id").eq("country_id", country.id),
    supabase.from("country_budget").select("*").eq("country_id", country.id).maybeSingle(),
    supabase.from("country_effects").select("*").eq("country_id", country.id).gt("duration_remaining", 0),
    supabase.from("countries").select("id, population, gdp, militarism, industry, science, stability"),
    isAdmin
      ? supabase.from("country_update_logs").select("*").eq("country_id", country.id).order("run_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as CountryUpdateLog[] }),
    isAdmin ? supabase.from("rule_parameters").select("key, value").in("key", ruleKeys) : Promise.resolve({ data: null }),
    supabase.from("military_roster_units").select("*").order("branch").order("sort_order").order("name_fr"),
    supabase.from("military_roster_unit_levels").select("*").order("unit_id").order("level"),
    supabase.from("country_military_units").select("*").eq("country_id", country.id),
  ]);

  const macros = macrosRes.data ?? [];
  const limits = limitsRes.data ?? [];
  const rosterUnits = (rosterUnitsRes.data ?? []) as MilitaryRosterUnit[];
  const rosterLevels = (rosterLevelsRes.data ?? []) as MilitaryRosterUnitLevel[];
  const countryMilitaryUnits = (countryMilitaryUnitsRes.data ?? []) as CountryMilitaryUnit[];
  const perksDef = perksDefRes.data ?? [];
  const unlockedPerkIds = new Set((countryPerksRes.data ?? []).map((p) => p.perk_id));
  const budget = budgetRes.data ?? null;
  const effects = effectsRes.data ?? [];

  const countries = countriesRes.data ?? [];
  const byPopulation = [...countries].sort((a, b) => Number(b.population) - Number(a.population));
  const byGdp = [...countries].sort((a, b) => Number(b.gdp) - Number(a.gdp));
  const rankPopulation = byPopulation.findIndex((c) => c.id === country.id) + 1 || 0;
  const rankGdp = byGdp.findIndex((c) => c.id === country.id) + 1 || 0;
  const updateLogs = (updateLogsRes.data ?? []) as CountryUpdateLog[];

  const ruleParametersByKey: Record<string, { value: unknown }> = {};
  if (ruleParamsRes.data) {
    for (const r of ruleParamsRes.data) {
      ruleParametersByKey[r.key] = { value: r.value };
    }
  }

  const worldAverages = isAdmin && countries.length > 0
    ? {
        pop_avg: countries.reduce((s, c) => s + Number(c.population ?? 0), 0) / countries.length,
        gdp_avg: countries.reduce((s, c) => s + Number(c.gdp ?? 0), 0) / countries.length,
        mil_avg: countries.reduce((s, c) => s + Number(c.militarism ?? 0), 0) / countries.length,
        ind_avg: countries.reduce((s, c) => s + Number(c.industry ?? 0), 0) / countries.length,
        sci_avg: countries.reduce((s, c) => s + Number(c.science ?? 0), 0) / countries.length,
        stab_avg: countries.reduce((s, c) => s + Number(c.stability ?? 0), 0) / countries.length,
      }
    : null;

  const branches: MilitaryBranch[] = ["terre", "air", "mer", "strategique"];
  const rosterByBranch: Record<MilitaryBranch, RosterRowByBranch[]> = {
    terre: [],
    air: [],
    mer: [],
    strategique: [],
  };
  for (const unit of rosterUnits) {
    const countryState =
      countryMilitaryUnits.find((cmu) => cmu.roster_unit_id === unit.id) ?? null;
    const levels = rosterLevels
      .filter((l) => l.unit_id === unit.id)
      .sort((a, b) => a.level - b.level)
      .map((l) => ({ level: l.level, manpower: l.manpower }));
    rosterByBranch[unit.branch].push({ unit, countryState, levels });
  }
  for (const b of branches) {
    rosterByBranch[b].sort(
      (a, b) => (a.unit.sort_order ?? 0) - (b.unit.sort_order ?? 0) || a.unit.name_fr.localeCompare(b.unit.name_fr)
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link
        href={backHref}
        className="mb-6 inline-block text-sm text-[var(--foreground-muted)] hover:text-[var(--accent)]"
      >
        ← Retour aux nations
      </Link>

      <div className="mb-8 flex flex-wrap items-center gap-6">
        {country.flag_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={country.flag_url}
            alt=""
            width={80}
            height={53}
            className="h-[53px] w-20 rounded border border-[var(--border)] object-cover"
            style={{ borderColor: "var(--border)" }}
          />
        ) : (
          <div
            className="h-[53px] w-20 rounded border border-[var(--border)] bg-[var(--background-elevated)]"
            style={{ borderColor: "var(--border)" }}
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {country.name}
          </h1>
          {country.regime && (
            <p className="text-[var(--foreground-muted)]">{country.regime}</p>
          )}
          {assignedPlayerEmail && (
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Joueur : {assignedPlayerEmail}
            </p>
          )}
        </div>
      </div>

      <CountryTabs
        country={country}
        macros={macros}
        limits={limits}
        perksDef={perksDef}
        unlockedPerkIds={unlockedPerkIds}
        budget={budget}
        effects={effects}
        rankPopulation={rankPopulation}
        rankGdp={rankGdp}
        isAdmin={isAdmin}
        isPlayerForThisCountry={isPlayerForThisCountry}
        assignedPlayerEmail={assignedPlayerEmail}
        updateLogs={updateLogs}
        ruleParametersByKey={ruleParametersByKey}
        worldAverages={worldAverages}
        rosterByBranch={rosterByBranch}
      />
    </div>
  );
}
