import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CountryForm } from "@/components/admin/CountryForm";
import { MobilisationAdminBlock } from "./MobilisationAdminBlock";

export default async function AdminPaysEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: country, error }, mobilisationRes, configRes] = await Promise.all([
    supabase.from("countries").select("*").eq("id", id).single(),
    supabase.from("country_mobilisation").select("score, target_score").eq("country_id", id).maybeSingle(),
    supabase.from("rule_parameters").select("value").eq("key", "mobilisation_config").maybeSingle(),
  ]);

  if (error || !country) notFound();

  const mobilisation = mobilisationRes.data ?? null;
  const config = configRes.data?.value as { level_thresholds?: Record<string, number> } | undefined;
  const levelThresholds = config?.level_thresholds;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-[var(--foreground)]">
        Modifier {country.name}
      </h1>
      <p className="mb-8 text-[var(--foreground-muted)]">
        Généralités, société, macros, militaire et avantages.
      </p>
      <CountryForm country={country} />
      <div className="mt-8">
        <MobilisationAdminBlock
          countryId={id}
          initialScore={mobilisation?.score ?? 0}
          initialTargetScore={mobilisation?.target_score ?? 0}
          levelThresholds={levelThresholds}
        />
      </div>
    </div>
  );
}
