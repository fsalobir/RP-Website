"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ensureMj } from "./_auth";

export async function dissiperEffet(effectId: string): Promise<{ error?: string }> {
  const { error: authError } = await ensureMj();
  if (authError) return { error: authError };

  const admin = createServiceRoleClient();
  const { error } = await admin.from("effects").delete().eq("id", effectId);
  if (error) return { error: error.message };

  revalidatePath("/mj");
  return {};
}

export type CreateEffectPayload = {
  targetType: "realm" | "province";
  targetId: string;
  targetSubkey: string;
  kindPrefix: "sum_" | "mult_";
  value: number;
  durationMode: "permanent" | "ticks";
  durationTicks?: number;
  sourceLabel?: string;
};

export async function creerEffet(payload: CreateEffectPayload): Promise<{ error?: string }> {
  const { user, error: authError } = await ensureMj();
  if (authError || !user) return { error: authError ?? "Non autorisé." };

  const targetSubkey = payload.targetSubkey.trim();
  if (!targetSubkey) return { error: "La ressource ciblée est requise (ex: gold)." };

  const effectKind = `${payload.kindPrefix}${targetSubkey}`;

  let duration_kind: "permanent" | "updates" = "updates";
  let duration_remaining: number | null = null;

  if (payload.durationMode === "permanent") {
    duration_kind = "permanent";
    duration_remaining = null;
  } else {
    const ticks = Number(payload.durationTicks ?? 0);
    if (!Number.isFinite(ticks) || ticks < 1) return { error: "La durée (ticks) doit être un entier ≥ 1." };
    duration_kind = "updates";
    duration_remaining = Math.floor(ticks);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("effects").insert({
    effect_kind: effectKind,
    value: payload.value,
    duration_kind,
    duration_remaining,
    source_label: payload.sourceLabel?.trim() || "MJ",
    created_by_user_id: user.id,
    target_type: payload.targetType,
    target_id: payload.targetId,
    target_subkey: targetSubkey,
  });

  if (error) return { error: error.message };

  revalidatePath("/mj");
  return {};
}

