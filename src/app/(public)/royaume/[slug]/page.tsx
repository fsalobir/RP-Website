import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRealmBySlug, getRealmFullContext, getResolvedRealmEffects, getRealmAllEffects } from "@/lib/effects/service";
import { resolveEffectsForTarget } from "@/lib/effects/engine";
import { mapFinalNumbersFromAttrs } from "@/lib/effects/mapper";
import { formatNumber } from "@/lib/format";
import type { Json, UUID } from "@/types/fantasy";

export const revalidate = 60;

type ResourceKindRef = { key: string; label_fr: string } | { key: string; label_fr: string }[] | null;

type RealmResourceRow = {
  resource_kind_id: UUID;
  amount: number;
  resource_kinds: ResourceKindRef;
};

type ProvinceResourceRow = {
  province_id: UUID;
  resource_kind_id: UUID;
  amount: number;
  resource_kinds: ResourceKindRef;
};

function getKeyLabel(ref: ResourceKindRef): { key: string; label_fr: string } | null {
  if (ref == null) return null;
  return Array.isArray(ref) ? ref[0] ?? null : ref;
}

export default async function RoyaumeSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const realm = await getRealmBySlug(slug);
  if (!realm) notFound();

  const ctx = await getRealmFullContext(realm.id);
  const supabase = await createClient();
  const provinceIds = ctx.provinces.map((p) => p.id);
  const [resolvedRealmEffects, allEffects, realmResRes, provinceResRes, treasureRes] = await Promise.all([
    getResolvedRealmEffects(realm.id),
    getRealmAllEffects(realm.id),
    supabase
      .from("realm_resources")
      .select("resource_kind_id, amount, resource_kinds(key, label_fr)")
      .eq("realm_id", realm.id),
    provinceIds.length > 0
      ? supabase
          .from("province_resources")
          .select("province_id, resource_kind_id, amount, resource_kinds(key, label_fr)")
          .in("province_id", provinceIds)
      : { data: [] as ProvinceResourceRow[], error: null },
    supabase
      .from("items")
      .select("id, name, attrs")
      .eq("realm_id", realm.id)
      .is("equipped_by_character_id", null),
  ]);

  const realmResources = (realmResRes.data ?? []) as unknown as RealmResourceRow[];
  const provinceResources = (provinceResRes.data ?? []) as unknown as ProvinceResourceRow[];
  const treasureItems = (treasureRes.data ?? []) as Array<{ id: UUID; name: string; attrs: Json }>;

  const realmAttrs: Record<string, number> = {};
  for (const row of realmResources) {
    const k = getKeyLabel(row.resource_kinds);
    if (k?.key) realmAttrs[k.key] = Number(row.amount);
  }

  const finalRealm = mapFinalNumbersFromAttrs(realmAttrs, resolvedRealmEffects);

  const provinceFinals: Array<{ province: (typeof ctx.provinces)[number]; final: Record<string, number> }> = [];
  for (const province of ctx.provinces) {
    const resolvedProvince = resolveEffectsForTarget(
      { type: "province", id: province.id },
      allEffects,
    );
    const final = mapFinalNumbersFromAttrs(
      (province.attrs ?? {}) as Record<string, Json>,
      resolvedProvince,
    );
    provinceFinals.push({ province, final });
  }

  const resourceKeys = new Set<string>([
    ...Object.keys(finalRealm),
    ...provinceFinals.flatMap((p) => Object.keys(p.final)),
  ]);
  const globalResources: Record<string, number> = {};
  for (const key of resourceKeys) {
    const realmVal = finalRealm[key] ?? 0;
    const provincesSum = provinceFinals.reduce((acc, p) => acc + (p.final[key] ?? 0), 0);
    globalResources[key] = realmVal + provincesSum;
  }

  const resourceLabels: Record<string, string> = {};
  for (const row of realmResources) {
    const k = getKeyLabel(row.resource_kinds);
    if (k?.key) resourceLabels[k.key] = k.label_fr;
  }
  for (const row of provinceResources) {
    const k = getKeyLabel(row.resource_kinds);
    if (k?.key && !resourceLabels[k.key]) resourceLabels[k.key] = k.label_fr;
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <header className="mb-10 border-b border-amber-900/50 pb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h1 className="font-serif text-3xl font-bold tracking-wide text-amber-100">
              {realm.name}
            </h1>
            <span
              className={
                realm.is_npc
                  ? "rounded bg-stone-700 px-3 py-1 text-sm text-stone-300"
                  : "rounded bg-amber-900/40 px-3 py-1 text-sm text-amber-200"
              }
            >
              {realm.is_npc ? "PNJ" : "Royaume joueur"}
            </span>
          </div>
          <p className="mt-2 text-sm text-stone-500">Royaume · {realm.slug}</p>
        </header>

        {/* Tableau de bord — Ressources globales */}
        <section className="mb-10">
          <h2 className="mb-4 font-serif text-xl font-semibold text-amber-100">
            Tableau de bord
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(["gold", "population", "prosperity"] as const).map((key) => {
              const value = globalResources[key];
              if (value == null) return null;
              const label = resourceLabels[key] ?? key;
              return (
                <div
                  key={key}
                  className="rounded-lg border border-stone-700 bg-stone-900/80 p-4 shadow-lg"
                >
                  <div className="text-sm uppercase tracking-wider text-stone-500">
                    {label}
                  </div>
                  <div className="mt-1 font-semibold text-amber-100">
                    {formatNumber(value)}
                  </div>
                </div>
              );
            })}
            {Object.keys(globalResources)
              .filter((k) => !["gold", "population", "prosperity"].includes(k))
              .map((key) => {
                const value = globalResources[key];
                const label = resourceLabels[key] ?? key;
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-stone-700 bg-stone-900/80 p-4 shadow-lg"
                  >
                    <div className="text-sm uppercase tracking-wider text-stone-500">
                      {label}
                    </div>
                    <div className="mt-1 font-semibold text-amber-100">
                      {formatNumber(value)}
                    </div>
                  </div>
                );
              })}
          </div>
          {Object.keys(globalResources).length === 0 && (
            <p className="rounded-lg border border-stone-700 bg-stone-900/50 p-4 text-stone-500">
              Aucune ressource enregistrée.
            </p>
          )}
        </section>

        {/* Liste des provinces */}
        <section className="mb-10">
          <h2 className="mb-4 font-serif text-xl font-semibold text-amber-100">
            Provinces
          </h2>
          {provinceFinals.length === 0 ? (
            <p className="rounded-lg border border-stone-700 bg-stone-900/50 p-4 text-stone-500">
              Aucune province.
            </p>
          ) : (
            <ul className="space-y-4">
              {provinceFinals.map(({ province, final }) => (
                <li
                  key={province.id}
                  className="rounded-lg border border-stone-700 bg-stone-900/80 p-4 shadow-lg"
                >
                  <h3 className="font-semibold text-stone-100">{province.name}</h3>
                  <div className="mt-3 flex flex-wrap gap-4">
                    {Object.entries(final).map(([key, value]) => (
                      <span key={key} className="text-sm">
                        <span className="text-stone-500">
                          {resourceLabels[key] ?? key} :
                        </span>{" "}
                        <span className="font-medium text-amber-100">
                          {formatNumber(value)}
                        </span>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Salle du trésor */}
        <section className="mb-10">
          <h2 className="mb-4 font-serif text-xl font-semibold text-amber-100">
            Salle du trésor
          </h2>
          {treasureItems.length === 0 ? (
            <p className="rounded-lg border border-stone-700 bg-stone-900/50 p-4 text-stone-500">
              Aucun objet dans le trésor.
            </p>
          ) : (
            <ul className="space-y-3">
              {treasureItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-stone-700 bg-stone-900/80 px-4 py-3"
                >
                  <span className="font-medium text-stone-100">{item.name}</span>
                  {item.attrs &&
                    typeof item.attrs === "object" &&
                    !Array.isArray(item.attrs) &&
                    "description" in item.attrs &&
                    (
                      <p className="mt-1 text-sm text-stone-500">
                        {(item.attrs as { description?: string }).description}
                      </p>
                    )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-sm text-stone-500">
          <Link href="/" className="underline hover:text-amber-200">
            ← Retour à l&apos;accueil
          </Link>
        </p>
      </div>
    </div>
  );
}
