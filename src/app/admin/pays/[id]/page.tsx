import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CountryForm } from "@/components/admin/CountryForm";
import { CountryLawsAdminBlock } from "./CountryLawsAdminBlock";
import { ControlAdminBlock } from "./ControlAdminBlock";
import { DeleteCountryButton } from "./DeleteCountryButton";
import { LAW_DEFINITIONS } from "@/lib/laws";

export default async function AdminPaysEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const configKeys = LAW_DEFINITIONS.map((d) => d.configRuleKey);

  const [
    { data: country, error },
    lawsRes,
    configsRes,
    controlRes,
    countriesRes,
    continentsRes,
  ] = await Promise.all([
    supabase.from("countries").select("*").eq("id", id).single(),
    supabase.from("country_laws").select("law_key, score, target_score").eq("country_id", id),
    supabase.from("rule_parameters").select("key, value").in("key", configKeys),
    supabase.from("country_control").select("id, controller_country_id, share_pct, is_annexed").eq("country_id", id),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("continents").select("id, slug, label_fr").order("sort_order"),
  ]);

  if (error || !country) notFound();

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
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            Modifier {country.name}
          </h1>
          <p className="mt-1 text-[var(--foreground-muted)]">
            Généralités, société, macros, militaire, contrôle et avantages.
          </p>
        </div>
        <Link
          href="/admin/pays"
          className="shrink-0 rounded border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] hover:text-[var(--accent)]"
        >
          Retour liste
        </Link>
      </div>
      <div className="mb-8" />
      <CountryForm country={country} continents={continents} />
      <div className="mt-8 space-y-8">
        <CountryLawsAdminBlock
          countryId={id}
          lawRows={lawRows}
          configsByKey={configsByKey}
        />
        <ControlAdminBlock
          countryId={id}
          controls={controlRows}
          otherCountries={otherCountries}
        />
        <div className="border-t pt-8" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-2 text-lg font-semibold text-[var(--foreground)]">Zone dangereuse</h2>
          <DeleteCountryButton countryId={id} countryName={country.name} />
        </div>
      </div>
    </div>
  );
}
