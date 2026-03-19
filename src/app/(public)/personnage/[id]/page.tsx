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
import type { Effect, Json, UUID } from "@/types/fantasy";

export const revalidate = 60;

type CharacterRow = {
  id: UUID;
  realm_id: UUID;
  province_id: UUID | null;
  name: string;
  status: string;
  attrs: unknown;
  meta: unknown;
  realms: { id: UUID; name: string; slug: string; player_user_id: string | null } | null;
  provinces: { name: string } | null;
  items: Array<{
    id: UUID;
    name: string;
    attrs: unknown;
    meta: unknown;
  }>;
};

function isEffectActive(e: Pick<Effect, "duration_kind" | "duration_remaining">): boolean {
  if (e.duration_kind === "permanent") return true;
  if (e.duration_remaining == null) return true;
  return e.duration_remaining > 0;
}

export default async function PersonnagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createServiceRoleClient();

  const { data: charData, error: charError } = await admin
    .from("characters")
    .select(
      "id, realm_id, province_id, name, status, attrs, meta, realms(id, name, slug, player_user_id), provinces(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (charError || !charData) notFound();

  const character = charData as unknown as CharacterRow;
  const realm = character.realms;
  if (!realm) notFound();

  const { data: itemsData } = await admin
    .from("items")
    .select("id, name, attrs, meta")
    .eq("equipped_by_character_id", character.id);
  const equippedItems = (itemsData ?? []) as CharacterRow["items"];
  const itemIds = equippedItems.map((i) => i.id);

  const viewerContext = await getViewerContext();
  const hasGrant = await hasVisibilityForSubject(
    viewerContext.viewerRealmId,
    "character",
    character.id,
    "summary",
  );
  const canViewDetails = checkCanViewDetails(
    viewerContext,
    realm.id,
    "character",
    character.id,
    hasGrant,
  );

  let attrsFinal: Record<string, number> = {};
  const itemEffectsByItemId: Record<string, Array<{ effect_kind: string; value: number }>> = {};
  if (canViewDetails) {
    const targetIds = [character.id, ...itemIds];
    const { data: effectsData } = await admin
      .from("effects")
      .select("*")
      .in("target_type", ["character", "item"])
      .in("target_id", targetIds.length ? targetIds : [character.id]);
    const allEffects = ((effectsData ?? []) as Effect[]).filter(isEffectActive);
    const resolved = resolveEffectsForTarget(
      { type: "character", id: character.id },
      allEffects,
    );
    const charAttrs: Json =
      character.attrs && typeof character.attrs === "object" && !Array.isArray(character.attrs)
        ? (character.attrs as unknown as Json)
        : {};
    attrsFinal = mapFinalNumbersFromAttrs(charAttrs, resolved);

    for (const item of equippedItems) {
      const itemResolved = resolveEffectsForTarget(
        { type: "item", id: item.id },
        allEffects,
      );
      const itemAttrs: Json =
        item.attrs && typeof item.attrs === "object" && !Array.isArray(item.attrs)
          ? (item.attrs as unknown as Json)
          : {};
      const itemFinal = mapFinalNumbersFromAttrs(itemAttrs, itemResolved);
      const bonuses = Object.entries(itemResolved.byKind).map(([, eff]) => ({
        effect_kind: eff.effect_kind,
        value: eff.value,
      }));
      itemEffectsByItemId[item.id] = bonuses;
    }
  }

  const meta = character.meta && typeof character.meta === "object" && !Array.isArray(character.meta)
    ? (character.meta as Record<string, unknown>)
    : {};
  const title = meta.title ? String(meta.title) : null;
  const role = meta.role ? String(meta.role) : null;
  const description = meta.description ? String(meta.description) : null;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-10 border-b border-amber-900/50 pb-6">
          <h1 className="font-serif text-3xl font-bold tracking-wide text-amber-100">
            {character.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-stone-500">
            <span>{realm.name}</span>
            {character.provinces?.name && (
              <>
                <span>·</span>
                <span>{character.provinces.name}</span>
              </>
            )}
            {(title || role) && (
              <>
                <span>·</span>
                <span>{title ?? role}</span>
              </>
            )}
            <span
              className={
                character.status === "active"
                  ? "rounded bg-emerald-900/40 px-2 py-0.5 text-sm text-emerald-200"
                  : "rounded bg-stone-600 px-2 py-0.5 text-sm text-stone-300"
              }
            >
              {character.status === "active" ? "Actif" : character.status}
            </span>
          </div>
        </header>

        {canViewDetails ? (
          <>
            {Object.keys(attrsFinal).length > 0 && (
              <section className="mb-8">
                <h2 className="mb-4 font-serif text-xl font-semibold text-amber-100">
                  Attributs
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
              </section>
            )}

            <section className="mb-8">
              <h2 className="mb-4 font-serif text-xl font-semibold text-amber-100">
                Équipement
              </h2>
              {equippedItems.length === 0 ? (
                <p className="rounded-lg border border-stone-700 bg-stone-900/50 p-4 text-stone-500">
                  Aucun objet équipé.
                </p>
              ) : (
                <ul className="space-y-4">
                  {equippedItems.map((item) => {
                    const desc =
                      item.attrs && typeof item.attrs === "object" && !Array.isArray(item.attrs) && "description" in item.attrs
                        ? String((item.attrs as { description?: string }).description ?? "")
                        : "";
                    const bonuses = itemEffectsByItemId[item.id] ?? [];
                    return (
                      <li
                        key={item.id}
                        className="rounded-lg border border-stone-700 bg-stone-900/80 p-4"
                      >
                        <span className="font-medium text-stone-100">{item.name}</span>
                        {desc ? (
                          <p className="mt-1 text-sm text-stone-500">{desc}</p>
                        ) : null}
                        {bonuses.length > 0 ? (
                          <ul className="mt-2 flex flex-wrap gap-2 text-sm text-amber-200/90">
                            {bonuses.map((b, i) => (
                              <li key={i}>
                                {b.effect_kind} {b.value >= 0 ? "+" : ""}{formatNumber(b.value)}
                              </li>
                            ))}
                          </ul>
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
              Les détails de ce personnage vous sont cachés.
            </p>
            {(title || role || description) && (
              <div className="mt-3 text-stone-400">
                {title && <p>{title}</p>}
                {role && title !== role && <p>{role}</p>}
                {description && <p className="mt-2">{description}</p>}
              </div>
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
