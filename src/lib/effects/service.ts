import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveEffectsForTarget, type EffectTargetRef, type ResolvedEffects } from "@/lib/effects/engine";
import type { Effect, Province, Realm, UUID } from "@/types/fantasy";

export class RealmNotFoundError extends Error {
  realmId: UUID;
  constructor(realmId: UUID) {
    super(`Royaume introuvable (id=${realmId}).`);
    this.name = "RealmNotFoundError";
    this.realmId = realmId;
  }
}

export type RealmFullContext = {
  realm: Realm;
  provinces: Province[];
  items: Array<{ id: UUID; realm_id: UUID; equipped_by_character_id: UUID | null }>;
};

function isEffectActive(e: Pick<Effect, "duration_kind" | "duration_remaining">): boolean {
  if (e.duration_kind === "permanent") return true;
  if (e.duration_remaining == null) return true;
  return e.duration_remaining > 0;
}

/**
 * Récupère le contexte complet d’un Royaume (en parallèle) :
 * - le Royaume
 * - ses Provinces
 * - ses Items (tous ; le filtrage “non équipés” se fait dans getResolvedRealmEffects)
 */
export async function getRealmFullContext(realmId: UUID): Promise<RealmFullContext> {
  const supabase = createServiceRoleClient();

  const realmReq = supabase.from("realms").select("*").eq("id", realmId).maybeSingle();
  const provincesReq = supabase.from("provinces").select("*").eq("realm_id", realmId);
  // On ne sélectionne que les champs nécessaires pour l’agrégation + ids.
  const itemsReq = supabase
    .from("items")
    .select("id, realm_id, equipped_by_character_id")
    .eq("realm_id", realmId);

  const [realmRes, provincesRes, itemsRes] = await Promise.all([realmReq, provincesReq, itemsReq]);

  if (realmRes.error) {
    throw new Error(`Erreur Supabase lors du chargement du royaume (${realmId}) : ${realmRes.error.message}`);
  }
  if (!realmRes.data) {
    throw new RealmNotFoundError(realmId);
  }

  if (provincesRes.error) {
    throw new Error(`Erreur Supabase lors du chargement des provinces du royaume (${realmId}) : ${provincesRes.error.message}`);
  }
  if (itemsRes.error) {
    throw new Error(`Erreur Supabase lors du chargement des items du royaume (${realmId}) : ${itemsRes.error.message}`);
  }

  return {
    realm: realmRes.data as Realm,
    provinces: (provincesRes.data ?? []) as Province[],
    items: (itemsRes.data ?? []) as Array<{ id: UUID; realm_id: UUID; equipped_by_character_id: UUID | null }>,
  };
}

/**
 * Résout les effets agrégés d’un Royaume :
 * - récupère royaume + provinces + items
 * - récupère tous les effets actifs liés à ces entités en 1 requête (`in('target_id', allIds)`)
 * - agrège via le moteur pur, en incluant la hiérarchie Provinces + Items non équipés
 */
export async function getResolvedRealmEffects(realmId: UUID): Promise<ResolvedEffects> {
  const supabase = createServiceRoleClient();

  const ctx = await getRealmFullContext(realmId);

  const provinceTargets: EffectTargetRef[] = ctx.provinces.map((p) => ({ type: "province", id: p.id }));
  const treasureItemTargets: EffectTargetRef[] = ctx.items
    .filter((i) => i.equipped_by_character_id == null)
    .map((i) => ({ type: "item", id: i.id }));

  const allTargetIds: UUID[] = [
    ctx.realm.id,
    ...ctx.provinces.map((p) => p.id),
    ...ctx.items.map((i) => i.id),
  ];

  // Une seule requête : tous les effets qui pointent vers les IDs du contexte.
  // Note: le filtrage `target_type` évite des collisions d’UUID entre tables (même si peu probable).
  const effectsRes = await supabase
    .from("effects")
    .select("*")
    .in("target_id", allTargetIds)
    .in("target_type", ["realm", "province", "item"]);

  if (effectsRes.error) {
    throw new Error(`Erreur Supabase lors du chargement des effets du royaume (${realmId}) : ${effectsRes.error.message}`);
  }

  const allEffects = ((effectsRes.data ?? []) as Effect[]).filter(isEffectActive);

  return resolveEffectsForTarget(
    { type: "realm", id: ctx.realm.id },
    allEffects,
    { relatedTargetsForRealm: [...provinceTargets, ...treasureItemTargets] },
  );
}

/**
 * Récupère un Royaume par son slug (pour les pages publiques).
 */
export async function getRealmBySlug(slug: string): Promise<Realm | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("realms")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new Error(`Erreur Supabase lors du chargement du royaume (slug=${slug}) : ${error.message}`);
  }
  return (data as Realm | null) ?? null;
}

/**
 * Retourne tous les effets actifs liés au royaume (realm + provinces + items).
 * Permet de résoudre les effets par province côté page (resolveEffectsForTarget).
 */
export async function getRealmAllEffects(realmId: UUID): Promise<Effect[]> {
  const ctx = await getRealmFullContext(realmId);
  const allTargetIds: UUID[] = [
    ctx.realm.id,
    ...ctx.provinces.map((p) => p.id),
    ...ctx.items.map((i) => i.id),
  ];
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("effects")
    .select("*")
    .in("target_id", allTargetIds)
    .in("target_type", ["realm", "province", "item"]);
  if (error) {
    throw new Error(`Erreur Supabase lors du chargement des effets (realm=${realmId}) : ${error.message}`);
  }
  return ((data ?? []) as Effect[]).filter(isEffectActive);
}

