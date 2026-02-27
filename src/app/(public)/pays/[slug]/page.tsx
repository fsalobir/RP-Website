import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CountryTabs } from "./CountryTabs";

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
  if (user) {
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("user_id", user.id)
      .single();
    isAdmin = !!adminRow;
  }
  const backHref = isAdmin ? "/admin/pays" : "/";

  const [macrosRes, limitsRes, perksDefRes, countryPerksRes, budgetRes, effectsRes] = await Promise.all([
    supabase.from("country_macros").select("*").eq("country_id", country.id),
    supabase
      .from("country_military_limits")
      .select("*, military_unit_types(*)")
      .eq("country_id", country.id),
    supabase.from("perks").select("*").order("sort_order"),
    supabase.from("country_perks").select("perk_id").eq("country_id", country.id),
    supabase.from("country_budget").select("*").eq("country_id", country.id).maybeSingle(),
    supabase.from("country_effects").select("*").eq("country_id", country.id).gt("duration_remaining", 0),
  ]);

  const macros = macrosRes.data ?? [];
  const limits = limitsRes.data ?? [];
  const perksDef = perksDefRes.data ?? [];
  const unlockedPerkIds = new Set((countryPerksRes.data ?? []).map((p) => p.perk_id));
  const budget = budgetRes.data ?? null;
  const effects = effectsRes.data ?? [];

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
        isAdmin={isAdmin}
      />
    </div>
  );
}
