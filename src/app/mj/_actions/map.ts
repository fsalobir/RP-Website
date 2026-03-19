"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { geoDistanceKm } from "@/lib/routes";
import type { RouteTier } from "@/lib/routes";
import { DEFAULT_MAP_DISPLAY_CONFIG, type MapDisplayConfig } from "@/lib/mapDisplayConfig";
import { ensureMj } from "./_auth";

export async function assignIsoRegionsToMilluipanur(): Promise<{ error?: string; assignedCount?: number }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const admin = createServiceRoleClient();

  const { data: realm, error: realmErr } = await admin
    .from("realms")
    .select("id")
    .eq("slug", "milluipanur")
    .maybeSingle();
  if (realmErr) return { error: realmErr.message };
  if (!realm?.id) return { error: "Royaume Milluipanûr introuvable. Appliquez d'abord la migration de seed." };

  // Ciblage robuste : on prend les régions dont l'ISO2 est GB ou IE (si présent).
  const { data: regions, error: regErr } = await admin
    .from("map_base_regions")
    .select("region_id, name, iso_a2, admin")
    .in("iso_a2", ["GB", "IE"]);
  if (regErr) return { error: regErr.message };

  const rows = (regions ?? []) as Array<{ region_id: string; name: string | null; iso_a2: string | null; admin: string | null }>;
  const regionIds = Array.from(new Set(rows.map((r) => String(r.region_id || "").trim()).filter(Boolean)));
  if (regionIds.length === 0) return { error: "Aucune région trouvée pour GB/IE dans map_base_regions." };

  // Pour éviter des conflits de unique(realm_id, name), on s'appuie sur un nom stable.
  // On privilégie `name`, sinon region_id.
  const suggestedNameByRegionId = new Map<string, string>();
  for (const r of rows) {
    const rid = String(r.region_id || "").trim();
    if (!rid) continue;
    const base = (r.name && r.name.trim()) ? r.name.trim() : rid;
    suggestedNameByRegionId.set(rid, base);
  }

  let assignedCount = 0;
  for (const regionId of regionIds) {
    const provinceName = suggestedNameByRegionId.get(regionId) ?? regionId;

    // Réutilise la logique existante : crée ou réassigne la province associée à cette région.
    const res = await createOrAssignProvinceFromRegion({ regionId, realmId: realm.id as string, provinceName });
    if (res.error) return { error: res.error };
    assignedCount += 1;
  }

  // Trace légère via meta des POI/ops; ici on ne persiste rien.
  revalidatePath("/");
  revalidatePath("/royaumes");
  revalidatePath("/mj/carte");
  revalidatePath("/mj");
  return { assignedCount };
}

export async function createOrAssignProvinceFromRegion(args: {
  regionId: string;
  realmId: string;
  provinceName: string;
  attrsJson?: string | null;
}): Promise<{ error?: string; provinceId?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const regionId = args.regionId.trim();
  const realmId = args.realmId.trim();
  const provinceName = args.provinceName.trim();
  const attrsJson = typeof args.attrsJson === "string" ? args.attrsJson : undefined;
  if (!regionId) return { error: "Région invalide." };
  if (!realmId) return { error: "Royaume invalide." };
  if (!provinceName) return { error: "Nom de province invalide." };

  let attrsToWrite: any = null;
  if (attrsJson !== undefined) {
    const trimmed = attrsJson.trim();
    if (!trimmed) {
      attrsToWrite = {};
    } else {
      try {
        attrsToWrite = JSON.parse(trimmed);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { error: `JSON invalide pour attrs: ${msg}` };
      }
    }
  }

  const admin = createServiceRoleClient();

  // Si une province existe déjà pour cette région (pivot), on la réassigne (update).
  const existingRes = await admin
    .from("province_base_regions")
    .select("province_id")
    .eq("region_id", regionId)
    .maybeSingle();

  if (existingRes.error) return { error: existingRes.error.message };

  if (existingRes.data?.province_id) {
    const existingProvinceId = existingRes.data.province_id as string;

    // Empêche la violation de contrainte unique (realm_id, name).
    // On récupère toutes les provinces qui portent ce nom pour pouvoir exclure celle en cours d'édition
    // et afficher une info plus utile.
    const { data: sameNameRows } = await admin
      .from("provinces")
      .select("id, map_ref")
      .eq("realm_id", realmId)
      .eq("name", provinceName);

    const conflicts = (sameNameRows ?? []).filter((r: any) => String(r.id) !== String(existingProvinceId));

    if (conflicts.length > 0) {
      const first = conflicts[0];
      const otherRegion = first?.map_ref ? String(first.map_ref) : null;
      const conflictProvinceId = first.id as string;

      // Si la province en conflit est orpheline (aucune entrée dans province_base_regions),
      // on peut la supprimer pour libérer le nom.
      const { data: conflictPivot } = await admin
        .from("province_base_regions")
        .select("region_id")
        .eq("province_id", conflictProvinceId)
        .limit(1)
        .maybeSingle();

      if (conflictPivot?.region_id) {
        return {
          error: otherRegion
            ? `Ce nom de province est déjà utilisé (région déjà attribuée : ${otherRegion}).`
            : "Ce nom de province est déjà utilisé dans ce royaume.",
        };
      }

      const { error: delErr } = await admin.from("provinces").delete().eq("id", conflictProvinceId);
      if (delErr) return { error: delErr.message };
    }

    const { error: updErr } = await admin
      .from("provinces")
      .update({
        realm_id: realmId,
        name: provinceName,
        ...(attrsToWrite !== null ? { attrs: attrsToWrite } : {}),
      })
      .eq("id", existingRes.data.province_id);
    if (updErr) {
      if (updErr.code === "23505") {
        return { error: "Ce nom de province est déjà utilisé dans ce royaume." };
      }
      return { error: updErr.message };
    }
    revalidatePath("/");
    revalidatePath("/royaumes");
    revalidatePath("/mj/carte");
    return { provinceId: existingRes.data.province_id as string };
  }

  // Cas création : empêche aussi un nom déjà utilisé dans ce royaume.
  const { data: conflict } = await admin
    .from("provinces")
    .select("id")
    .eq("realm_id", realmId)
    .eq("name", provinceName)
    .maybeSingle();
  if (conflict?.id) {
    const conflictProvinceId = conflict.id as string;
    const { data: conflictPivot } = await admin
      .from("province_base_regions")
      .select("region_id")
      .eq("province_id", conflictProvinceId)
      .limit(1)
      .maybeSingle();

    if (conflictPivot?.region_id) {
      return { error: "Ce nom de province est déjà utilisé dans ce royaume." };
    }

    const { error: delErr } = await admin.from("provinces").delete().eq("id", conflictProvinceId);
    if (delErr) return { error: delErr.message };
  }

  const { data, error } = await admin
    .from("provinces")
    .insert({
      realm_id: realmId,
      name: provinceName,
      map_ref: regionId,
      ...(attrsToWrite !== null ? { attrs: attrsToWrite } : {}),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    if (error?.code === "23505") {
      return { error: "Ce nom de province est déjà utilisé dans ce royaume." };
    }
    return { error: error?.message ?? "Impossible de créer la province." };
  }

  // Assure que la région existe aussi comme "base map region" pour satisfaire la FK
  // (province_base_regions.region_id -> map_base_regions.region_id).
  const { error: mapBaseErr } = await admin
    .from("map_base_regions")
    .upsert({ region_id: regionId, name: regionId }, { onConflict: "region_id" });
  if (mapBaseErr) return { error: mapBaseErr.message };

  const { error: pivotErr } = await admin.from("province_base_regions").insert({
    province_id: data.id,
    region_id: regionId,
  });
  if (pivotErr) return { error: pivotErr.message };

  revalidatePath("/");
  revalidatePath("/royaumes");
  revalidatePath("/mj/carte");
  return { provinceId: data.id as string };
}

type ProvinceRow = { id: string; realm_id: string; name: string; is_composite: boolean };
type MappingRow = { region_id: string; province_id: string };

function uniqStrings(xs: string[]) {
  return Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
}

export async function mergeProvinces(args: {
  regionIds: string[];
  realmId: string;
  newName: string;
}): Promise<{ error?: string; provinceId?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const regionIds = uniqStrings(args.regionIds ?? []);
  const realmId = args.realmId.trim();
  const newName = args.newName.trim();
  if (regionIds.length < 2) return { error: "Sélection insuffisante (minimum 2 régions)." };
  if (!realmId) return { error: "Royaume invalide." };
  if (!newName) return { error: "Nom invalide." };

  const admin = createServiceRoleClient();

  const { data: beforeMappingsRaw, error: beforeMapErr } = await admin
    .from("province_base_regions")
    .select("region_id, province_id")
    .in("region_id", regionIds);
  if (beforeMapErr) return { error: beforeMapErr.message };

  const beforeMappings = (beforeMappingsRaw ?? []) as MappingRow[];
  const affectedProvinceIds = Array.from(new Set(beforeMappings.map((m) => m.province_id).filter(Boolean)));

  const { data: beforeProvincesRaw, error: beforeProvErr } = await admin
    .from("provinces")
    .select("id, realm_id, name, is_composite")
    .in("id", affectedProvinceIds.length ? affectedProvinceIds : ["00000000-0000-0000-0000-000000000000"]);
  if (beforeProvErr) return { error: beforeProvErr.message };
  const beforeProvinces = (beforeProvincesRaw ?? []) as ProvinceRow[];

  const { data: created, error: createErr } = await admin
    .from("provinces")
    .insert({ realm_id: realmId, name: newName, is_composite: true })
    .select("id")
    .single();
  if (createErr || !created?.id) return { error: createErr?.message ?? "Impossible de créer la province." };
  const newProvinceId = created.id as string;

  // Détache ces régions de leurs anciennes provinces, puis attache à la nouvelle.
  const { error: delErr } = await admin.from("province_base_regions").delete().in("region_id", regionIds);
  if (delErr) return { error: delErr.message };

  const { error: insErr } = await admin.from("province_base_regions").insert(
    regionIds.map((rid) => ({ province_id: newProvinceId, region_id: rid })),
  );
  if (insErr) return { error: insErr.message };

  // Supprime les provinces devenues vides.
  for (const pid of affectedProvinceIds) {
    const { count } = await admin
      .from("province_base_regions")
      .select("region_id", { count: "exact", head: true })
      .eq("province_id", pid);
    if (!count) {
      await admin.from("provinces").delete().eq("id", pid);
    } else if (count === 1) {
      await admin.from("provinces").update({ is_composite: false }).eq("id", pid);
    }
  }

  const afterMappings: MappingRow[] = regionIds.map((rid) => ({ region_id: rid, province_id: newProvinceId }));
  const afterProvinces: ProvinceRow[] = [{ id: newProvinceId, realm_id: realmId, name: newName, is_composite: true }];

  await admin.from("province_map_ops").insert({
    op_kind: "merge",
    province_id: newProvinceId,
    created_by_user_id: user.id,
    before: { provinces: beforeProvinces, mappings: beforeMappings },
    after: { provinces: afterProvinces, mappings: afterMappings },
  });

  revalidatePath("/");
  revalidatePath("/royaumes");
  revalidatePath("/mj/carte");
  return { provinceId: newProvinceId };
}

export async function renameProvince(args: {
  provinceId: string;
  newName: string;
}): Promise<{ error?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const provinceId = args.provinceId.trim();
  const newName = args.newName.trim();
  if (!provinceId) return { error: "Province invalide." };
  if (!newName) return { error: "Nom invalide." };

  const admin = createServiceRoleClient();
  const { data: before, error: beforeErr } = await admin
    .from("provinces")
    .select("id, realm_id, name, is_composite")
    .eq("id", provinceId)
    .maybeSingle();
  if (beforeErr) return { error: beforeErr.message };
  if (!before) return { error: "Province introuvable." };

  // Empêche la violation de contrainte unique (realm_id, name).
  // On récupère toutes les provinces portant ce nom pour pouvoir exclure celle qu'on édite.
  const { data: sameNameRows } = await admin
    .from("provinces")
    .select("id, map_ref")
    .eq("realm_id", before.realm_id)
    .eq("name", newName);

  const conflicts = (sameNameRows ?? []).filter((r: any) => String(r.id) !== String(provinceId));
  if (conflicts.length > 0) {
    const first = conflicts[0];
    const otherRegion = first?.map_ref ? String(first.map_ref) : null;
    const conflictProvinceId = first.id as string;

    // Si la province en conflit n'est attachée à aucune région (orpheline),
    // elle n'apparaîtra pas sur la carte. Dans ce cas, on la supprime
    // pour permettre le renommage (unique realm_id+name).
    const { data: conflictPivot } = await admin
      .from("province_base_regions")
      .select("region_id")
      .eq("province_id", conflictProvinceId)
      .limit(1)
      .maybeSingle();

    if (conflictPivot?.region_id) {
      return {
        error: otherRegion
          ? `Ce nom de province est déjà utilisé (région déjà attribuée : ${otherRegion}).`
          : "Ce nom de province est déjà utilisé dans ce royaume.",
      };
    }

    const { error: delErr } = await admin.from("provinces").delete().eq("id", conflictProvinceId);
    if (delErr) return { error: delErr.message };
  }

  const { error: updErr } = await admin.from("provinces").update({ name: newName }).eq("id", provinceId);
  if (updErr) {
    if (updErr.code === "23505") {
      return { error: "Ce nom de province est déjà utilisé dans ce royaume." };
    }
    return { error: updErr.message };
  }

  await admin.from("province_map_ops").insert({
    op_kind: "rename",
    province_id: provinceId,
    created_by_user_id: user.id,
    before: { province: before },
    after: { province: { ...before, name: newName } },
  });

  revalidatePath("/");
  revalidatePath("/royaumes");
  revalidatePath("/mj/carte");
  return {};
}

export async function splitProvince(args: {
  provinceId: string;
  regionIdsToDetach: string[];
  realmIdForNew?: string;
}): Promise<{ error?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const provinceId = args.provinceId.trim();
  const regionIdsToDetach = uniqStrings(args.regionIdsToDetach ?? []);
  if (!provinceId) return { error: "Province invalide." };
  if (regionIdsToDetach.length === 0) return { error: "Aucune région à détacher." };

  const admin = createServiceRoleClient();
  const { data: prov, error: provErr } = await admin
    .from("provinces")
    .select("id, realm_id, name, is_composite")
    .eq("id", provinceId)
    .maybeSingle();
  if (provErr) return { error: provErr.message };
  if (!prov) return { error: "Province introuvable." };

  const realmId = (args.realmIdForNew ?? prov.realm_id).trim();
  const { data: beforeMappingsRaw, error: beforeMapErr } = await admin
    .from("province_base_regions")
    .select("region_id, province_id")
    .eq("province_id", provinceId);
  if (beforeMapErr) return { error: beforeMapErr.message };
  const beforeMappings = (beforeMappingsRaw ?? []) as MappingRow[];

  // Détache les régions demandées
  const { error: delErr } = await admin
    .from("province_base_regions")
    .delete()
    .eq("province_id", provinceId)
    .in("region_id", regionIdsToDetach);
  if (delErr) return { error: delErr.message };

  // Crée une province unitaire pour chaque région détachée
  const createdProvinceIds: string[] = [];
  for (const rid of regionIdsToDetach) {
    const { data: created, error: createErr } = await admin
      .from("provinces")
      .insert({ realm_id: realmId, name: `Province ${rid}`.slice(0, 80), is_composite: false })
      .select("id")
      .single();
    if (createErr || !created?.id) return { error: createErr?.message ?? "Impossible de fragmenter." };
    createdProvinceIds.push(created.id as string);

    const { error: insErr } = await admin.from("province_base_regions").insert({ province_id: created.id, region_id: rid });
    if (insErr) return { error: insErr.message };
  }

  // Met à jour le flag composite selon le nombre de régions restantes
  const { count } = await admin
    .from("province_base_regions")
    .select("region_id", { count: "exact", head: true })
    .eq("province_id", provinceId);
  if (!count) {
    await admin.from("provinces").delete().eq("id", provinceId);
  } else if (count === 1) {
    await admin.from("provinces").update({ is_composite: false }).eq("id", provinceId);
  } else {
    await admin.from("provinces").update({ is_composite: true }).eq("id", provinceId);
  }

  const afterMappingsRaw = await admin
    .from("province_base_regions")
    .select("region_id, province_id")
    .in("province_id", [provinceId, ...createdProvinceIds]);
  const afterMappings = ((afterMappingsRaw.data ?? []) as MappingRow[]) ?? [];

  await admin.from("province_map_ops").insert({
    op_kind: "split",
    province_id: provinceId,
    created_by_user_id: user.id,
    before: { province: prov, mappings: beforeMappings },
    after: { province_id: provinceId, mappings: afterMappings },
  });

  revalidatePath("/");
  revalidatePath("/royaumes");
  revalidatePath("/mj/carte");
  return {};
}

export async function undoProvinceMapOp(args: { opId: string }): Promise<{ error?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const opId = args.opId.trim();
  if (!opId) return { error: "Opération invalide." };

  const admin = createServiceRoleClient();
  const { data: op, error: opErr } = await admin
    .from("province_map_ops")
    .select("id, op_kind, before, after")
    .eq("id", opId)
    .maybeSingle();
  if (opErr) return { error: opErr.message };
  if (!op) return { error: "Opération introuvable." };

  const before = (op as any).before ?? {};
  const after = (op as any).after ?? {};
  const beforeMappings = (before.mappings ?? []) as Array<{ region_id: string; province_id: string }>;
  const afterMappings = (after.mappings ?? []) as Array<{ region_id: string; province_id: string }>;

  const affectedRegionIds = uniqStrings([
    ...beforeMappings.map((m) => m.region_id),
    ...afterMappings.map((m) => m.region_id),
  ]);
  const affectedProvinceIds = uniqStrings([
    ...beforeMappings.map((m) => m.province_id),
    ...afterMappings.map((m) => m.province_id),
  ]);

  // Reset mappings for affected regions
  if (affectedRegionIds.length) {
    await admin.from("province_base_regions").delete().in("region_id", affectedRegionIds);
  }
  if (beforeMappings.length) {
    await admin.from("province_base_regions").insert(beforeMappings);
  }

  // Restore provinces (best-effort)
  const beforeProvinces = (before.provinces ?? []) as ProvinceRow[];
  if (beforeProvinces.length) {
    for (const p of beforeProvinces) {
      await admin
        .from("provinces")
        .update({ name: p.name, realm_id: p.realm_id, is_composite: p.is_composite })
        .eq("id", p.id);
    }
  }

  // Delete provinces that only exist in after (typical merged province)
  const beforeIds = new Set(beforeProvinces.map((p) => p.id));
  for (const pid of affectedProvinceIds) {
    if (!beforeIds.has(pid)) {
      const { count } = await admin
        .from("province_base_regions")
        .select("region_id", { count: "exact", head: true })
        .eq("province_id", pid);
      if (!count) await admin.from("provinces").delete().eq("id", pid);
    }
  }

  await admin.from("province_map_ops").insert({
    op_kind: "undo",
    province_id: null,
    created_by_user_id: user.id,
    before: { undone_op_id: opId, restored: before },
    after: {},
  });

  revalidatePath("/");
  revalidatePath("/royaumes");
  revalidatePath("/mj/carte");
  return {};
}

export async function createMapObject(args: {
  regionId: string;
  kind: string;
  name: string;
  lon: number;
  lat: number;
  iconKey?: string | null;
}): Promise<{ error?: string; poiId?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const regionId = args.regionId.trim();
  const kind = args.kind.trim();
  const name = args.name.trim();
  const lon = Number(args.lon);
  const lat = Number(args.lat);
  const iconKey = args.iconKey ? String(args.iconKey) : null;

  if (!regionId) return { error: "Région invalide." };
  if (!kind) return { error: "Type invalide." };
  if (!name) return { error: "Nom invalide." };
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { error: "Coordonnées invalides." };

  const admin = createServiceRoleClient();
  const { data: mapping, error: mapErr } = await admin
    .from("province_base_regions")
    .select("province_id")
    .eq("region_id", regionId)
    .maybeSingle();
  if (mapErr) return { error: mapErr.message };
  if (!mapping?.province_id) return { error: "Aucune province rattachée à cette région." };

  const { data, error } = await admin
    .from("poi")
    .insert({
      province_id: mapping.province_id,
      kind,
      name,
      lon,
      lat,
      icon_key: iconKey,
      is_visible: true,
      meta: { created_by_user_id: user.id, source: "map" },
    } as any)
    .select("id")
    .single();

  if (error || !data?.id) return { error: error?.message ?? "Impossible de créer l’objet." };

  revalidatePath("/");
  revalidatePath("/royaumes");
  revalidatePath("/mj/carte");
  return { poiId: data.id as string };
}

export async function createCity(args: {
  regionId: string;
  name: string;
  iconKey?: string | null;
  lon: number;
  lat: number;
  iconScalePct?: number | null;
}): Promise<{ error?: string; cityId?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const regionId = args.regionId.trim();
  const name = args.name.trim();
  const iconKey = args.iconKey ? String(args.iconKey) : null;
  const lon = Number(args.lon);
  const lat = Number(args.lat);
  const iconScalePct = Number(args.iconScalePct ?? 100);

  if (!regionId) return { error: "Région invalide." };
  if (!name) return { error: "Nom invalide." };
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { error: "Coordonnées invalides." };

  const admin = createServiceRoleClient();

  const { data: mapping, error: mapErr } = await admin
    .from("province_base_regions")
    .select("province_id")
    .eq("region_id", regionId)
    .maybeSingle();
  if (mapErr) return { error: mapErr.message };
  if (!mapping?.province_id) return { error: "Aucune province rattachée à cette région." };

  const { data: province, error: provErr } = await admin
    .from("provinces")
    .select("id, realm_id")
    .eq("id", mapping.province_id)
    .maybeSingle();
  if (provErr) return { error: provErr.message };
  if (!province?.id || !province?.realm_id) return { error: "Province introuvable ou sans royaume." };

  const { data, error } = await admin
    .from("cities")
    .insert({
      realm_id: province.realm_id,
      province_id: province.id,
      name,
      icon_key: iconKey,
      lon,
      lat,
      population: null,
      attrs: { icon_scale_pct: Number.isFinite(iconScalePct) ? Math.max(10, Math.min(400, iconScalePct)) : 100 },
      created_by_user_id: user.id,
    } as any)
    .select("id")
    .single();

  if (error || !data?.id) return { error: error?.message ?? "Impossible de créer la ville." };

  revalidatePath("/mj/carte");
  revalidatePath("/mj");
  revalidatePath("/");
  revalidatePath("/royaumes");
  return { cityId: data.id as string };
}

export async function createCityBuilding(args: {
  cityId: string;
  kind: string;
  level?: number;
}): Promise<{ error?: string; buildingId?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const cityId = args.cityId.trim();
  const kind = args.kind.trim();
  const level = Math.max(1, Math.floor(Number(args.level ?? 1) || 1));

  if (!cityId) return { error: "Ville invalide." };
  if (!kind) return { error: "Type invalide." };

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("city_buildings")
    .insert({
      city_id: cityId,
      kind,
      level,
      attrs: {},
      created_by_user_id: user.id,
    } as any)
    .select("id")
    .single();

  if (error || !data?.id) return { error: error?.message ?? "Impossible de créer le bâtiment." };

  revalidatePath("/mj/carte");
  revalidatePath("/mj");
  return { buildingId: data.id as string };
}

export async function deleteCity(args: { cityId: string }): Promise<{ error?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const cityId = args.cityId.trim();
  if (!cityId) return { error: "Ville invalide." };

  const admin = createServiceRoleClient();
  const { error } = await admin.from("cities").delete().eq("id", cityId);
  if (error) return { error: error.message };

  // Nettoyage côté UI
  revalidatePath("/");
  revalidatePath("/royaumes");
  revalidatePath("/mj/carte");
  revalidatePath("/mj");
  return {};
}

export async function deleteRoute(args: { routeId: string }): Promise<{ error?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const routeId = args.routeId?.trim();
  if (!routeId) return { error: "Route invalide." };

  const admin = createServiceRoleClient();
  const { error } = await admin.from("routes").delete().eq("id", routeId);
  if (error) return { error: error.message };

  revalidatePath("/mj/carte");
  revalidatePath("/");
  revalidatePath("/royaumes");
  return {};
}

export async function updateCityIconScale(args: {
  cityId: string;
  iconScalePct: number;
}): Promise<{ error?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const cityId = args.cityId.trim();
  const iconScalePct = Math.max(10, Math.min(400, Number(args.iconScalePct) || 100));
  if (!cityId) return { error: "Ville invalide." };

  const admin = createServiceRoleClient();

  const { data: city, error: cityErr } = await admin
    .from("cities")
    .select("id, attrs")
    .eq("id", cityId)
    .maybeSingle();
  if (cityErr) return { error: cityErr.message };
  if (!city?.id) return { error: "Ville introuvable." };

  const attrs = {
    ...((city.attrs as Record<string, any> | null) ?? {}),
    icon_scale_pct: iconScalePct,
  };

  const { error } = await admin.from("cities").update({ attrs }).eq("id", cityId);
  if (error) return { error: error.message };

  revalidatePath("/mj/carte");
  revalidatePath("/");
  revalidatePath("/royaumes");
  return {};
}

const DEFAULT_MAX_ROUTE_KM = 500;

export async function createRoute(args: {
  cityAId?: string | null;
  cityBId: string;
  pathwayPointAId?: string | null;
  name: string;
  tier: RouteTier;
}): Promise<{ error?: string; routeId?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const cityAId = args.cityAId?.trim() || null;
  const cityBId = args.cityBId?.trim();
  const pathwayPointAId = args.pathwayPointAId?.trim() || null;
  const name = args.name?.trim();
  const tier = args.tier;

  const fromPathway = !!pathwayPointAId;
  if (!fromPathway && !cityAId) return { error: "Ville de départ ou point de branchement requis." };
  if (fromPathway && cityAId) return { error: "Indiquez soit une ville de départ soit un point de branchement, pas les deux." };
  if (!cityBId) return { error: "Ville d'arrivée requise." };
  if (!fromPathway && cityAId === cityBId) return { error: "Les deux villes doivent être différentes." };
  if (!name) return { error: "Nom de la route requis." };
  if (!["local", "regional", "national"].includes(tier)) return { error: "Tier invalide." };

  const admin = createServiceRoleClient();

  const cityB = (await admin.from("cities").select("id, lon, lat").eq("id", cityBId).maybeSingle()).data as { id: string; lon: number; lat: number } | null;
  if (!cityB || !Number.isFinite(cityB.lon) || !Number.isFinite(cityB.lat)) return { error: "Ville d'arrivée introuvable ou sans coordonnées." };

  let distance_km: number;
  let seed: number;
  if (fromPathway && pathwayPointAId) {
    const pt = (await admin.from("route_pathway_points").select("lat, lon").eq("id", pathwayPointAId).maybeSingle()).data as { lat: number; lon: number } | null;
    if (!pt || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lon)) return { error: "Point de branchement introuvable." };
    distance_km = geoDistanceKm({ lon: pt.lon, lat: pt.lat }, { lon: cityB.lon, lat: cityB.lat });
    seed = Math.abs((pathwayPointAId + cityBId).split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)) % 1e6;
  } else {
    const { data: cities, error: citiesErr } = await admin.from("cities").select("id, lon, lat").in("id", [cityAId!, cityBId]);
    if (citiesErr) return { error: citiesErr.message };
    const cityA = (cities as Array<{ id: string; lon: number; lat: number }>).find((c) => c.id === cityAId);
    if (!cityA || !Number.isFinite(cityA.lon) || !Number.isFinite(cityA.lat)) return { error: "Ville de départ introuvable." };
    distance_km = geoDistanceKm({ lon: cityA.lon, lat: cityA.lat }, { lon: cityB.lon, lat: cityB.lat });
    seed = Math.abs((cityAId! + cityBId).split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)) % 1e6;
  }

  const { data: maxParam } = await admin.from("rule_parameters").select("value").eq("key", "max_route_km").maybeSingle();
  const maxRouteKm = typeof maxParam?.value === "number" && maxParam.value > 0 ? maxParam.value : DEFAULT_MAX_ROUTE_KM;
  if (distance_km > maxRouteKm) return { error: `La distance (${Math.round(distance_km)} km) dépasse la limite (${maxRouteKm} km).` };

  const insertPayload: Record<string, unknown> = {
    name,
    city_b_id: cityBId,
    tier,
    distance_km: Math.round(distance_km * 100) / 100,
    attrs: { seed },
    created_by_user_id: user.id,
  };
  if (fromPathway) {
    (insertPayload as any).city_a_id = null;
    (insertPayload as any).pathway_point_a_id = pathwayPointAId;
  } else {
    (insertPayload as any).city_a_id = cityAId;
  }

  const { data, error } = await admin.from("routes").insert(insertPayload as any).select("id").single();
  if (error || !data?.id) return { error: error?.message ?? "Impossible de créer la route." };

  revalidatePath("/mj/carte");
  revalidatePath("/");
  revalidatePath("/royaumes");
  return { routeId: data.id as string };
}

/** Crée un point de branchement sur une route (à une position en %) et retourne son id pour créer une route embranchement. */
export async function createBranchPointOnRoute(args: {
  routeId: string;
  positionPct: number;
}): Promise<{ error?: string; pathwayPointId?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const routeId = args.routeId?.trim();
  const positionPct = Math.max(0, Math.min(100, Number(args.positionPct)));
  if (!routeId) return { error: "Route requise." };

  const admin = createServiceRoleClient();

  const { data: route } = await admin.from("routes").select("id, city_a_id, city_b_id").eq("id", routeId).maybeSingle();
  if (!route) return { error: "Route introuvable." };
  const r = route as { city_a_id: string | null; city_b_id: string | null };
  if (!r.city_a_id || !r.city_b_id) return { error: "Cette route n'a pas deux villes ; impossible d'interpoler." };

  const { data: cities } = await admin.from("cities").select("id, lon, lat").in("id", [r.city_a_id, r.city_b_id]);
  const cityA = (cities as Array<{ id: string; lon: number; lat: number }>)?.find((c) => c.id === r.city_a_id);
  const cityB = (cities as Array<{ id: string; lon: number; lat: number }>)?.find((c) => c.id === r.city_b_id);
  if (!cityA || !cityB) return { error: "Villes de la route introuvables." };

  const { data: wps } = await admin
    .from("route_pathway_points")
    .select("id, lat, lon, seq")
    .eq("route_id", routeId)
    .order("seq", { ascending: true });
  const waypoints = (wps ?? []) as Array<{ id: string; lat: number; lon: number; seq: number }>;
  const points: Array<{ lon: number; lat: number }> = [
    { lon: cityA.lon, lat: cityA.lat },
    ...waypoints.map((w) => ({ lon: w.lon, lat: w.lat })),
    { lon: cityB.lon, lat: cityB.lat },
  ];
  if (points.length < 2) return { error: "Polyline invalide." };

  const dists: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    dists.push(dists[i - 1] + geoDistanceKm(points[i - 1], points[i]));
  }
  const totalLen = dists[dists.length - 1];
  if (totalLen <= 0) return { error: "Longueur nulle." };
  const targetDist = (positionPct / 100) * totalLen;
  let idx = 0;
  while (idx < dists.length - 1 && dists[idx + 1] < targetDist) idx++;
  const t = idx >= dists.length - 1 ? 1 : (targetDist - dists[idx]) / (dists[idx + 1] - dists[idx]);
  const lat = points[idx].lat + t * (points[idx + 1].lat - points[idx].lat);
  const lon = points[idx].lon + t * (points[idx + 1].lon - points[idx].lon);

  const insertSeq = Math.min(waypoints.length, Math.max(0, Math.floor((positionPct / 100) * (waypoints.length + 1))));
  for (const w of waypoints) {
    if (w.seq >= insertSeq) await admin.from("route_pathway_points").update({ seq: w.seq + 1 }).eq("id", w.id);
  }
  const { data: inserted, error } = await admin
    .from("route_pathway_points")
    .insert({ route_id: routeId, seq: insertSeq, lat, lon })
    .select("id")
    .single();
  if (error || !inserted?.id) return { error: error?.message ?? "Impossible de créer le point." };

  revalidatePath("/mj/carte");
  revalidatePath("/");
  revalidatePath("/royaumes");
  return { pathwayPointId: (inserted as { id: string }).id };
}

/** Ajoute un point de navigation (waypoint) à une route pour forcer un détour. */
export async function addPathwayPointToRoute(args: {
  routeId: string;
  lat: number;
  lon: number;
  insertPosition: "start" | "middle" | "end";
}): Promise<{ error?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const routeId = args.routeId?.trim();
  const { lat, lon, insertPosition } = args;
  if (!routeId) return { error: "Route requise." };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: "Coordonnées lat/lon invalides." };

  const admin = createServiceRoleClient();

  const { data: route } = await admin.from("routes").select("id").eq("id", routeId).maybeSingle();
  if (!route) return { error: "Route introuvable." };

  const { data: existing } = await admin
    .from("route_pathway_points")
    .select("id, seq")
    .eq("route_id", routeId)
    .order("seq", { ascending: true });
  const points = (existing ?? []) as Array<{ id: string; seq: number }>;
  let newSeq: number;
  if (insertPosition === "start") {
    newSeq = 0;
    for (const p of points) {
      await admin.from("route_pathway_points").update({ seq: p.seq + 1 }).eq("id", p.id);
    }
  } else if (insertPosition === "middle") {
    newSeq = Math.floor(points.length / 2);
    for (const p of points) {
      if (p.seq >= newSeq) await admin.from("route_pathway_points").update({ seq: p.seq + 1 }).eq("id", p.id);
    }
  } else {
    newSeq = points.length;
  }

  const { error } = await admin.from("route_pathway_points").insert({
    route_id: routeId,
    seq: newSeq,
    lat,
    lon,
  });
  if (error) return { error: error.message };

  revalidatePath("/mj/carte");
  revalidatePath("/");
  revalidatePath("/royaumes");
  return {};
}

/** Supprime un point de passage d'une route. Impossible si le point est utilisé comme extrémité d'une route (embranchement). */
export async function deletePathwayPoint(args: { pathwayPointId: string }): Promise<{ error?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const pathwayPointId = args.pathwayPointId?.trim();
  if (!pathwayPointId) return { error: "Point de passage invalide." };

  const admin = createServiceRoleClient();
  const { data: used } = await admin
    .from("routes")
    .select("id")
    .or(`pathway_point_a_id.eq.${pathwayPointId},pathway_point_b_id.eq.${pathwayPointId}`)
    .limit(1);
  if (used && used.length > 0) return { error: "Ce point est utilisé comme extrémité d'une route (embranchement). Supprimez d'abord la route concernée." };

  const { error } = await admin.from("route_pathway_points").delete().eq("id", pathwayPointId);
  if (error) return { error: error.message };

  revalidatePath("/mj/carte");
  revalidatePath("/");
  revalidatePath("/royaumes");
  return {};
}

const MAP_DISPLAY_CONFIG_KEY = "map_display_config";

/** Lecture des réglages d'affichage de la carte (carte MJ et publique). */
export async function getMapDisplayConfig(): Promise<MapDisplayConfig> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("rule_parameters")
    .select("value")
    .eq("key", MAP_DISPLAY_CONFIG_KEY)
    .maybeSingle();
  const v = data?.value;
  if (!v || typeof v !== "object" || v === null) return DEFAULT_MAP_DISPLAY_CONFIG;
  const o = v as Record<string, unknown>;
  const D = DEFAULT_MAP_DISPLAY_CONFIG;
  return {
    cityIconMaxPx: Number(o.cityIconMaxPx) > 0 ? Number(o.cityIconMaxPx) : D.cityIconMaxPx,
    cityLabelFontSizePx: Number(o.cityLabelFontSizePx) > 0 ? Number(o.cityLabelFontSizePx) : D.cityLabelFontSizePx,
    zoomRefWorld: Number(o.zoomRefWorld) || D.zoomRefWorld,
    zoomRefProvince: Number(o.zoomRefProvince) || D.zoomRefProvince,
    sizeAtWorldPct: Number(o.sizeAtWorldPct) ?? D.sizeAtWorldPct,
    sizeCurveExp: Number(o.sizeCurveExp) || D.sizeCurveExp,
    fadeStartPct: Number(o.fadeStartPct) ?? D.fadeStartPct,
    fadeEndPct: Number(o.fadeEndPct) ?? D.fadeEndPct,
    routeStrokeLocalPx: (() => {
      const n = Number(o.routeStrokeLocalPx);
      return Number.isFinite(n) ? Math.max(0.01, Math.min(0.3, n)) : D.routeStrokeLocalPx;
    })(),
    routeStrokeRegionalPx: (() => {
      const n = Number(o.routeStrokeRegionalPx);
      return Number.isFinite(n) ? Math.max(0.01, Math.min(0.3, n)) : D.routeStrokeRegionalPx;
    })(),
    routeStrokeNationalPx: (() => {
      const n = Number(o.routeStrokeNationalPx);
      return Number.isFinite(n) ? Math.max(0.01, Math.min(0.3, n)) : D.routeStrokeNationalPx;
    })(),
    routeFadeStartPct: Number(o.routeFadeStartPct) ?? D.routeFadeStartPct,
    routeFadeEndPct: Number(o.routeFadeEndPct) ?? D.routeFadeEndPct,
    routeSizeAtWorldPct: Number(o.routeSizeAtWorldPct) ?? D.routeSizeAtWorldPct,
    routeSizeCurveExp: Number(o.routeSizeCurveExp) || D.routeSizeCurveExp,
    routeLabelFontSizePx: (() => {
      const n = Number(o.routeLabelFontSizePx);
      return Number.isFinite(n) ? Math.max(0.01, Math.min(1, n)) : D.routeLabelFontSizePx;
    })(),
    routeSinuosityLocalPct: Number(o.routeSinuosityLocalPct) ?? D.routeSinuosityLocalPct,
    routeSinuosityRegionalPct: Number(o.routeSinuosityRegionalPct) ?? D.routeSinuosityRegionalPct,
    routeSinuosityNationalPct: Number(o.routeSinuosityNationalPct) ?? D.routeSinuosityNationalPct,
  };
}

/** Enregistrement des réglages d'affichage par le MJ (appliqués à la carte publique aussi). */
export async function saveMapDisplayConfig(config: MapDisplayConfig): Promise<{ error?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("rule_parameters")
    .select("id")
    .eq("key", MAP_DISPLAY_CONFIG_KEY)
    .maybeSingle();

  const value = {
    cityIconMaxPx: config.cityIconMaxPx,
    cityLabelFontSizePx: config.cityLabelFontSizePx,
    zoomRefWorld: config.zoomRefWorld,
    zoomRefProvince: config.zoomRefProvince,
    sizeAtWorldPct: config.sizeAtWorldPct,
    sizeCurveExp: config.sizeCurveExp,
    fadeStartPct: config.fadeStartPct,
    fadeEndPct: config.fadeEndPct,
    routeStrokeLocalPx: config.routeStrokeLocalPx,
    routeStrokeRegionalPx: config.routeStrokeRegionalPx,
    routeStrokeNationalPx: config.routeStrokeNationalPx,
    routeFadeStartPct: config.routeFadeStartPct,
    routeFadeEndPct: config.routeFadeEndPct,
    routeSizeAtWorldPct: config.routeSizeAtWorldPct,
    routeSizeCurveExp: config.routeSizeCurveExp,
    routeLabelFontSizePx: config.routeLabelFontSizePx,
    routeSinuosityLocalPct: config.routeSinuosityLocalPct,
    routeSinuosityRegionalPct: config.routeSinuosityRegionalPct,
    routeSinuosityNationalPct: config.routeSinuosityNationalPct,
  };

  if (existing?.id) {
    const { error } = await admin.from("rule_parameters").update({ value }).eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin.from("rule_parameters").insert({ key: MAP_DISPLAY_CONFIG_KEY, value } as any);
    if (error) return { error: error.message };
  }

  revalidatePath("/mj/carte");
  revalidatePath("/");
  revalidatePath("/royaumes");
  return {};
}

