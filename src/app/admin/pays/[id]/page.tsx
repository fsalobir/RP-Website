import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CountryForm } from "@/components/admin/CountryForm";
import { MobilisationAdminBlock } from "./MobilisationAdminBlock";
import { ControlAdminBlock } from "./ControlAdminBlock";

export default async function AdminPaysEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [
    { data: country, error },
    mobilisationRes,
    configRes,
    controlRes,
    countriesRes,
  ] = await Promise.all([
    supabase.from("countries").select("*").eq("id", id).single(),
    supabase.from("country_mobilisation").select("score, target_score").eq("country_id", id).maybeSingle(),
    supabase.from("rule_parameters").select("value").eq("key", "mobilisation_config").maybeSingle(),
    supabase.from("country_control").select("id, controller_country_id, share_pct, is_annexed").eq("country_id", id),
    supabase.from("countries").select("id, name").order("name"),
  ]);

  if (error || !country) notFound();

  const mobilisation = mobilisationRes.data ?? null;
  const config = configRes.data?.value as { level_thresholds?: Record<string, number> } | undefined;
  const levelThresholds = config?.level_thresholds;

  const controlRows = (controlRes.data ?? []).map((r) => ({
    id: r.id,
    controller_country_id: r.controller_country_id,
    controller_name: "", // rempli ci-dessous
    share_pct: Number(r.share_pct),
    is_annexed: !!r.is_annexed,
  }));
  const countries = (countriesRes.data ?? []) as { id: string; name: string }[];
  const countryById = new Map(countries.map((c) => [c.id, c]));
  controlRows.forEach((r) => {
    r.controller_name = countryById.get(r.controller_country_id)?.name ?? r.controller_country_id;
  });
  const otherCountries = countries.filter((c) => c.id !== id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Modifier {country.name}
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Généralités, société, macros, militaire, contrôle et avantages.
      </p>
      <CountryForm country={country} />
      <div className="mt-8 space-y-8">
        <MobilisationAdminBlock
          countryId={id}
          initialScore={mobilisation?.score ?? 0}
          initialTargetScore={mobilisation?.target_score ?? 0}
          levelThresholds={levelThresholds}
        />
        <ControlAdminBlock
          countryId={id}
          controls={controlRows}
          otherCountries={otherCountries}
        />
      </div>
    </div>
  );
}
