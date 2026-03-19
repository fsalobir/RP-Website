import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveEffectsForTarget } from "@/lib/effects/engine";
import { mapFinalNumbersFromAttrs } from "@/lib/effects/mapper";
import { formatNumber } from "@/lib/format";
import {
  getViewerContext,
  hasVisibilityForSubject,
  canViewDetails as checkCanViewDetails,
} from "@/lib/visibility";
import type { Effect, Json, Province, Realm, UUID } from "@/types/fantasy";

export const revalidate = 60;

type ProvinceWithRelations = Province & {
  realms: Realm | null;
  province_races: Array<{
    race_id: UUID;
    share_pct: number | null;
    count: number | null;
    races: { key: string; label_fr: string } | null;
  }>;
  poi: Array<{
    id: UUID;
    kind: string;
    name: string;
    attrs: unknown;
  }>;
};

function isEffectActive(e: Pick<Effect, "duration_kind" | "duration_remaining">): boolean {
  if (e.duration_kind === "permanent") return true;
  if (e.duration_remaining == null) return true;
  return e.duration_remaining > 0;
}

export default async function ProvincePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createServiceRoleClient();

  const { data: provinceData, error: provinceError } = await admin
    .from("provinces")
    .select(
      "id, realm_id, name, map_ref, attrs, created_at, updated_at, realms(id, name, slug, player_user_id), province_races(race_id, share_pct, count, races(key, label_fr)), poi(id, kind, name, attrs)",
    )
    .eq("id", id)
    .maybeSingle();

  if (provinceError || !provinceData) notFound();

  const province = provinceData as unknown as ProvinceWithRelations;
  const realm = province.realms;
  if (!realm) notFound();

  const viewerContext = await getViewerContext();
  const hasGrant = await hasVisibilityForSubject(
    viewerContext.viewerRealmId,
    "province",
    province.id as UUID,
    "summary",
  );
  const canViewDetails = checkCanViewDetails(
    viewerContext,
    realm.id,
    "province",
    province.id,
    hasGrant,
  );

  let attrsFinal: Record<string, number> = {};
  let effectsResolved = false;
  if (canViewDetails) {
    const poiIds = (province.poi ?? []).map((p) => p.id);
    const targetIds = [province.id, ...poiIds];
    const { data: effectsData } = await admin
      .from("effects")
      .select("*")
      .in("target_type", ["province", "poi"])
      .in("target_id", targetIds.length ? targetIds : [province.id]);
    const allEffects = ((effectsData ?? []) as Effect[]).filter(isEffectActive);
    const resolved = resolveEffectsForTarget({ type: "province", id: province.id }, allEffects);
    const provinceAttrs: Json =
      province.attrs && typeof province.attrs === "object" && !Array.isArray(province.attrs)
        ? (province.attrs as unknown as Json)
        : {};
    attrsFinal = mapFinalNumbersFromAttrs(provinceAttrs, resolved);
    effectsResolved = true;
  }

  const description =
    province.attrs && typeof province.attrs === "object" && !Array.isArray(province.attrs) && "description" in province.attrs
      ? String((province.attrs as { description?: string }).description ?? "")
      : "";

  const provinceRaces = province.province_races ?? [];
  const totalShare =
    provinceRaces.reduce((acc, pr) => acc + (Number(pr.share_pct) || 0), 0) || 1;
  const dominantRace = provinceRaces.length
    ? provinceRaces.sort((a, b) => (Number(b.share_pct) || 0) - (Number(a.share_pct) || 0))[0]
    : null;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-10 border-b border-amber-900/50 pb-6">
          <h1 className="font-serif text-3xl font-bold tracking-wide text-amber-100">
            {province.name}
          </h1>
          <p className="mt-2 text-stone-500">
            Province · {realm.name}
          </p>
        </header>

        {description ? (
          <section className="mb-8 rounded-lg border border-stone-700 bg-stone-900/80 p-4">
            <h2 className="mb-2 font-serif text-lg font-semibold text-amber-100">Description</h2>
            <p className="text-stone-300">{description}</p>
          </section>
        ) : null}

        {canViewDetails && effectsResolved ? (
          <>
            <section className="mb-8">
              <h2 className="mb-4 font-serif text-xl font-semibold text-amber-100">
                Statistiques locales
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(attrsFinal).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-stone-700 bg-stone-900/80 p-4"
                  >
                    <div className="text-sm uppercase tracking-wider text-stone-500">{key}</div>
                    <div className="mt-1 font-semibold text-amber-100">{formatNumber(value)}</div>
                  </div>
                ))}
              </div>
              {Object.keys(attrsFinal).length === 0 && (
                <p className="rounded-lg border border-stone-700 bg-stone-900/50 p-4 text-stone-500">
                  Aucune statistique enregistrée.
                </p>
              )}
            </section>

            <section className="mb-8">
              <h2 className="mb-4 font-serif text-xl font-semibold text-amber-100">
                Répartition des races
              </h2>
              {provinceRaces.length === 0 ? (
                <p className="text-stone-500">Aucune donnée de population par race.</p>
              ) : (
                <ul className="space-y-3">
                  {provinceRaces.map((pr) => {
                    const race = pr.races;
                    const label = race?.label_fr ?? race?.key ?? "Inconnue";
                    const pct = totalShare ? (Number(pr.share_pct) || 0) / totalShare : 0;
                    const widthPct = Math.min(100, Math.round(pct * 100));
                    return (
                      <li key={pr.race_id} className="flex items-center gap-4">
                        <span className="w-32 text-sm text-stone-300">{label}</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-stone-800">
                          <div
                            className="h-4 rounded-full bg-amber-700/80"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="text-sm text-stone-500">
                          {formatNumber(widthPct)} %
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="mb-8">
              <h2 className="mb-4 font-serif text-xl font-semibold text-amber-100">
                Bâtiments et points d&apos;intérêt
              </h2>
              {(!province.poi || province.poi.length === 0) ? (
                <p className="rounded-lg border border-stone-700 bg-stone-900/50 p-4 text-stone-500">
                  Aucun POI dans cette province.
                </p>
              ) : (
                <ul className="space-y-3">
                  {province.poi.map((p) => {
                    const desc =
                      p.attrs && typeof p.attrs === "object" && !Array.isArray(p.attrs) && "description" in p.attrs
                        ? String((p.attrs as { description?: string }).description ?? "")
                        : "";
                    return (
                      <li
                        key={p.id}
                        className="rounded-lg border border-stone-700 bg-stone-900/80 px-4 py-3"
                      >
                        <span className="font-medium text-stone-100">{p.name}</span>
                        <span className="ml-2 text-sm text-stone-500">({p.kind})</span>
                        {desc ? (
                          <p className="mt-1 text-sm text-stone-500">{desc}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <section className="mb-8 rounded-lg border border-stone-700 bg-stone-900/80 p-6">
            <p className="text-stone-500">
              Les détails de cette province vous sont cachés. Vous ne voyez que les informations publiques.
            </p>
            {dominantRace?.races && (
              <p className="mt-2 text-stone-400">
                Population majoritaire : {dominantRace.races.label_fr}.
              </p>
            )}
          </section>
        )}

        <p className="text-sm text-stone-500">
          <Link href="/" className="underline hover:text-amber-200">
            ← Retour à l&apos;accueil
          </Link>
          {realm.slug ? (
            <>
              {" · "}
              <Link href={`/royaume/${realm.slug}`} className="underline hover:text-amber-200">
                Voir le royaume
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
