"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveEffectsForTarget } from "@/lib/effects/engine";
import { mapFinalNumbersFromAttrs } from "@/lib/effects/mapper";
import {
  buildResourceIdByKey,
  buildResourceKeyById,
  extractProductionFromFinalAttrs,
} from "@/lib/tickProduction";
import type { Effect, Province, UUID } from "@/types/fantasy";
import { ensureMj } from "./_auth";

function isEffectActive(e: Pick<Effect, "duration_kind" | "duration_remaining">): boolean {
  if (e.duration_kind === "permanent") return true;
  if (e.duration_remaining == null) return true;
  return e.duration_remaining > 0;
}

export async function triggerTick(notes?: string): Promise<{ error?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const admin = createServiceRoleClient();

  const { data: tickRun, error: tickRunError } = await admin
    .from("tick_runs")
    .insert({
      triggered_by: "mj",
      status: "running",
      notes: notes?.trim() || null,
    })
    .select("id")
    .single();

  if (tickRunError || !tickRun?.id) return { error: tickRunError?.message ?? "Impossible de créer le tick_run." };

  const tickRunId = tickRun.id as string;

  try {
    // --- Chargement des données ---
    const { data: provincesData, error: provincesError } = await admin
      .from("provinces")
      .select("id, realm_id, attrs");
    if (provincesError) throw new Error(provincesError.message);
    const provinces = (provincesData ?? []) as Pick<Province, "id" | "realm_id" | "attrs">[];

    const { data: resourceKindsData, error: rkError } = await admin.from("resource_kinds").select("id, key");
    if (rkError) throw new Error(rkError.message);
    const resourceKinds = (resourceKindsData ?? []) as Array<{ id: UUID; key: string }>;
    const resourceIdByKey = buildResourceIdByKey(resourceKinds);
    const resourceKeyById = buildResourceKeyById(resourceKinds);

    const provinceIds = provinces.map((p) => p.id);
    const { data: effectsData, error: effectsError } = await admin
      .from("effects")
      .select("*")
      .eq("target_type", "province")
      .in("target_id", provinceIds.length ? provinceIds : ["00000000-0000-0000-0000-000000000000"]);
    if (effectsError) throw new Error(effectsError.message);
    const allEffects = ((effectsData ?? []) as Effect[]).filter(isEffectActive);

    const { data: prData, error: prError } = await admin.from("province_resources").select("province_id, resource_kind_id, amount");
    if (prError) throw new Error(prError.message);
    const provinceResources = (prData ?? []) as Array<{ province_id: UUID; resource_kind_id: UUID; amount: number }>;

    const realmIds = [...new Set(provinces.map((p) => p.realm_id))];
    const { data: rrData, error: rrError } = await admin
      .from("realm_resources")
      .select("realm_id, resource_kind_id, amount")
      .in("realm_id", realmIds.length ? realmIds : ["00000000-0000-0000-0000-000000000000"]);
    if (rrError) throw new Error(rrError.message);
    const realmResources = (rrData ?? []) as Array<{ realm_id: UUID; resource_kind_id: UUID; amount: number }>;

    // Stocks actuels : clés (province_id, resource_kind_id) et (realm_id, resource_kind_id)
    const provinceStock = new Map<string, number>();
    for (const row of provinceResources) {
      provinceStock.set(`${row.province_id}:${row.resource_kind_id}`, Number(row.amount));
    }
    const realmStock = new Map<string, number>();
    for (const row of realmResources) {
      realmStock.set(`${row.realm_id}:${row.resource_kind_id}`, Number(row.amount));
    }

    // --- Production par province et agrégation royaume ---
    const provinceProduction = new Map<string, number>();
    const realmProduction = new Map<string, number>();
    const provinceAttrsFinal = new Map<UUID, Record<string, number>>();
    const provinceNewStocks = new Map<string, number>();

    for (const province of provinces) {
      const resolved = resolveEffectsForTarget({ type: "province", id: province.id }, allEffects);
      const attrsFinal = mapFinalNumbersFromAttrs(province.attrs, resolved);
      provinceAttrsFinal.set(province.id, attrsFinal);

      const prod = extractProductionFromFinalAttrs(attrsFinal, resourceIdByKey);
      for (const [resourceKindId, amount] of prod) {
        const key = `${province.id}:${resourceKindId}`;
        provinceProduction.set(key, (provinceProduction.get(key) ?? 0) + amount);
        const realmKey = `${province.realm_id}:${resourceKindId}`;
        realmProduction.set(realmKey, (realmProduction.get(realmKey) ?? 0) + amount);
      }
    }

    const now = new Date().toISOString();

    // --- Nouveaux stocks province : current + production ---
    for (const province of provinces) {
      for (const rk of resourceKinds) {
        const pk = `${province.id}:${rk.id}`;
        const current = provinceStock.get(pk) ?? 0;
        const prod = provinceProduction.get(pk) ?? 0;
        const newAmount = current + prod;
        provinceNewStocks.set(pk, newAmount);
      }
    }

    // --- Upsert province_resources ---
    const provinceRows = provinces.flatMap((p) =>
      resourceKinds.map((rk) => {
        const pk = `${p.id}:${rk.id}`;
        const amount = provinceNewStocks.get(pk) ?? 0;
        return { province_id: p.id, resource_kind_id: rk.id, amount, updated_at: now };
      }),
    );
    if (provinceRows.length) {
      const { error: upsertPr } = await admin.from("province_resources").upsert(provinceRows, {
        onConflict: "province_id,resource_kind_id",
      });
      if (upsertPr) throw new Error(upsertPr.message);
    }

    // --- Nouveaux stocks royaume et upsert realm_resources ---
    const realmNewStocks = new Map<string, number>();
    for (const realmId of realmIds) {
      for (const rk of resourceKinds) {
        const rkKey = `${realmId}:${rk.id}`;
        const current = realmStock.get(rkKey) ?? 0;
        const prod = realmProduction.get(rkKey) ?? 0;
        realmNewStocks.set(rkKey, current + prod);
      }
    }
    const realmRows = realmIds.flatMap((realmId) =>
      resourceKinds.map((rk) => {
        const rkKey = `${realmId}:${rk.id}`;
        const amount = realmNewStocks.get(rkKey) ?? 0;
        return { realm_id: realmId, resource_kind_id: rk.id, amount, updated_at: now };
      }),
    );
    if (realmRows.length) {
      const { error: upsertRr } = await admin.from("realm_resources").upsert(realmRows, {
        onConflict: "realm_id,resource_kind_id",
      });
      if (upsertRr) throw new Error(upsertRr.message);
    }

    // --- tick_resource_changes (deltas = production) ---
    const changeRows: Array<{
      tick_run_id: string;
      realm_id: UUID | null;
      province_id: UUID | null;
      resource_kind_id: UUID;
      delta: number;
      reason: string;
      source_type: string;
      meta: Record<string, unknown>;
    }> = [];
    for (const province of provinces) {
      for (const rk of resourceKinds) {
        const prod = provinceProduction.get(`${province.id}:${rk.id}`) ?? 0;
        if (prod === 0) continue;
        changeRows.push({
          tick_run_id: tickRunId,
          realm_id: province.realm_id,
          province_id: province.id,
          resource_kind_id: rk.id,
          delta: prod,
          reason: "production",
          source_type: "province",
          meta: {},
        });
      }
    }
    if (changeRows.length) {
      const { error: chErr } = await admin.from("tick_resource_changes").insert(changeRows);
      if (chErr) throw new Error(chErr.message);
    }

    // --- Snapshots : realm_history et province_history ---
    const realmSnapshotRows = realmIds.map((realmId) => {
      const resources: Record<string, number> = {};
      for (const rk of resourceKinds) {
        const key = resourceKeyById.get(rk.id);
        if (key) resources[key] = realmNewStocks.get(`${realmId}:${rk.id}`) ?? 0;
      }
      return { tick_run_id: tickRunId, realm_id: realmId, snapshot: { resources, meta: {} } };
    });
    if (realmSnapshotRows.length) {
      const { error: rhErr } = await admin.from("realm_history").insert(realmSnapshotRows);
      if (rhErr) throw new Error(rhErr.message);
    }

    const provinceSnapshotRows = provinces.map((p) => {
      const resources: Record<string, number> = {};
      for (const rk of resourceKinds) {
        const key = resourceKeyById.get(rk.id);
        if (key) resources[key] = provinceNewStocks.get(`${p.id}:${rk.id}`) ?? 0;
      }
      return {
        tick_run_id: tickRunId,
        province_id: p.id,
        realm_id: p.realm_id,
        snapshot: { resources, attrs_final: provinceAttrsFinal.get(p.id) ?? {} },
      };
    });
    if (provinceSnapshotRows.length) {
      const { error: phErr } = await admin.from("province_history").insert(provinceSnapshotRows);
      if (phErr) throw new Error(phErr.message);
    }

    // --- Décrémenter les effets non permanents ---
    const { data: toDecrement, error: listError } = await admin
      .from("effects")
      .select("id, duration_remaining, duration_kind")
      .neq("duration_kind", "permanent")
      .not("duration_remaining", "is", null);
    if (listError) throw new Error(listError.message);

    const rows = (toDecrement ?? []) as Array<{ id: string; duration_remaining: number; duration_kind: string }>;
    if (rows.length) {
      const decResults = await Promise.all(
        rows.map((r) =>
          admin
            .from("effects")
            .update({ duration_remaining: Number(r.duration_remaining) - 1 })
            .eq("id", r.id),
        ),
      );
      const firstErr = decResults.find((r) => r.error)?.error;
      if (firstErr) throw new Error(firstErr.message);
    }

    // --- Supprimer les effets expirés ---
    const { error: purgeError } = await admin
      .from("effects")
      .delete()
      .neq("duration_kind", "permanent")
      .not("duration_remaining", "is", null)
      .lte("duration_remaining", 0);
    if (purgeError) throw new Error(purgeError.message);

    // --- Marquer le tick comme réussi ---
    const { error: endError } = await admin
      .from("tick_runs")
      .update({ status: "succeeded", ended_at: now })
      .eq("id", tickRunId);
    if (endError) throw new Error(endError.message);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from("tick_runs")
      .update({ status: "failed", ended_at: new Date().toISOString(), notes: `Échec tick MJ: ${message}` })
      .eq("id", tickRunId);
    return { error: `Échec du tour : ${message}` };
  }

  revalidatePath("/mj");
  return {};
}
