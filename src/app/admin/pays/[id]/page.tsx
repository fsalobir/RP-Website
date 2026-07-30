import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CountryForm } from "@/components/admin/CountryForm";
import { CountryLawsAdminBlock } from "./CountryLawsAdminBlock";
import { ControlAdminBlock } from "./ControlAdminBlock";
import { DeleteCountryButton } from "./DeleteCountryButton";
import { LAW_DEFINITIONS } from "@/lib/laws";

const COUNTRY_TABS = [
  { id: "fiche", label: "Fiche" },
  { id: "lois", label: "Lois" },
  { id: "controle", label: "Contrôle" },
  { id: "suppression", label: "Suppression" },
] as const;

type CountryTab = (typeof COUNTRY_TABS)[number]["id"];

export default async function AdminPaysEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string | string[] }>;
}) {
  const { id } = await params;
  const requestedTab = (await searchParams).onglet;
  const activeTab: CountryTab = COUNTRY_TABS.some(
    ({ id: tabId }) => tabId === requestedTab,
  )
    ? (requestedTab as CountryTab)
    : "fiche";
  const supabase = await createClient();

  const configKeys = LAW_DEFINITIONS.map((d) => d.configRuleKey);

  const [
    countryRes,
    lawsRes,
    configsRes,
    controlRes,
    countriesRes,
    continentsRes,
  ] = await Promise.all([
    supabase.from("countries").select("*").eq("id", id).maybeSingle(),
    supabase.from("country_laws").select("law_key, score, target_score").eq("country_id", id),
    supabase.from("rule_parameters").select("key, value").in("key", configKeys),
    supabase.from("country_control").select("id, controller_country_id, share_pct, is_annexed").eq("country_id", id),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("continents").select("id, slug, label_fr").order("sort_order"),
  ]);

  const loadError = [countryRes, lawsRes, configsRes, controlRes, countriesRes, continentsRes].find((result) => result.error)?.error;
  if (loadError) throw new Error(`Impossible de charger le pays : ${loadError.message}`);
  const country = countryRes.data;
  if (!country) notFound();

  const lawRows = (lawsRes.data ?? []) as Array<{ law_key: string; score: number; target_score: number }>;
  const configsByKey: Record<string, { level_thresholds?: Record<string, number> }> = {};
  for (const r of configsRes.data ?? []) {
    configsByKey[r.key] = r.value as { level_thresholds?: Record<string, number> };
  }

  const controlRows = (controlRes.data ?? []).map((r) => ({
    id: r.id,
    controller_country_id: r.controller_country_id,
    controller_name: "",
    share_pct: Number(r.share_pct),
    is_annexed: !!r.is_annexed,
  }));
  const countries = (countriesRes.data ?? []) as { id: string; name: string }[];
  const countryById = new Map(countries.map((c) => [c.id, c]));
  controlRows.forEach((r) => {
    r.controller_name = countryById.get(r.controller_country_id)?.name ?? r.controller_country_id;
  });
  const otherCountries = countries.filter((c) => c.id !== id);
  const continents = continentsRes.data ?? [];

  return (
    <div className="mx-auto max-w-[100rem] px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <h1 className="min-w-0 truncate text-2xl font-bold text-[var(--foreground)]">{country.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/pays/${country.slug}`}
            className="inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm font-medium text-[var(--foreground-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          >
            Voir côté joueur
          </Link>
          <Link
            href="/admin/pays"
            className="inline-flex min-h-11 items-center px-2 py-2 text-sm font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            ← Tous les pays
          </Link>
        </div>
      </header>
      <nav
        aria-label="Réglages du pays"
        className="flex overflow-x-auto border-b"
        style={{ borderColor: "var(--border)" }}
      >
        {COUNTRY_TABS.map(({ id: tabId, label }) => (
          <Link
            key={tabId}
            href={`/admin/pays/${id}?onglet=${tabId}`}
            aria-current={activeTab === tabId ? "page" : undefined}
            scroll={false}
            className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm font-medium transition-colors ${
              activeTab === tabId
                ? "border-[var(--accent)] text-[var(--foreground)]"
                : "border-transparent text-[var(--foreground-muted)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {activeTab === "fiche" && (
        <section aria-label="Fiche du pays" className="pt-5">
          <CountryForm country={country} continents={continents} />
        </section>
      )}
      {activeTab === "lois" && (
        <section aria-label="Lois du pays" className="pt-5">
          <CountryLawsAdminBlock
            countryId={id}
            lawRows={lawRows}
            configsByKey={configsByKey}
          />
        </section>
      )}
      {activeTab === "controle" && (
        <section aria-label="Contrôle du pays" className="pt-5">
          <ControlAdminBlock
            countryId={id}
            controls={controlRows}
            otherCountries={otherCountries}
          />
        </section>
      )}
      {activeTab === "suppression" && (
        <section aria-label="Suppression du pays" className="pt-5">
          <h2 className="mb-3 text-base font-semibold text-[var(--foreground)]">Supprimer le pays</h2>
          <DeleteCountryButton countryId={id} countryName={country.name} />
        </section>
      )}
    </div>
  );
}
