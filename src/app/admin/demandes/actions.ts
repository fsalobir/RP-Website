"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getRelation, normalizePair, RELATION_MIN, RELATION_MAX } from "@/lib/relations";
import type { AdminEffectAdded } from "@/types/database";

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { supabase: null, error: "Réservé aux admins." };
  return { supabase, error: null, userId: user.id };
}

export async function updateRequestEffect(
  requestId: string,
  adminEffectAdded: AdminEffectAdded | null
): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { error } = await supabase
    .from("state_action_requests")
    .update({ admin_effect_added: adminEffectAdded as unknown as Record<string, unknown> })
    .eq("id", requestId)
    .in("status", ["pending"]);

  if (error) return { error: error.message };
  revalidatePath("/admin/demandes");
  return {};
}

function clampRelation(value: number): number {
  return Math.max(RELATION_MIN, Math.min(RELATION_MAX, Math.round(value)));
}

export async function acceptRequest(requestId: string): Promise<{ error?: string }> {
  const { supabase, error: authError, userId } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: req, error: fetchErr } = await supabase
    .from("state_action_requests")
    .select("id, country_id, action_type_id, status, payload, admin_effect_added")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Requête introuvable." };
  if (req.status !== "pending") return { error: "Cette demande a déjà été traitée." };

  const { data: actionType } = await supabase
    .from("state_action_types")
    .select("key, params_schema")
    .eq("id", req.action_type_id)
    .single();

  const key = (actionType?.key ?? "") as string;
  const payload = (req.payload ?? {}) as Record<string, string>;
  const params = (actionType?.params_schema ?? {}) as Record<string, number>;

  if (key === "insulte_diplomatique") {
    const targetCountryId = payload.target_country_id;
    if (!targetCountryId) return { error: "Pays cible manquant pour Insulte diplomatique." };
    const relationDelta = typeof params.relation_delta === "number" ? params.relation_delta : -10;
    const current = await getRelation(supabase, req.country_id, targetCountryId);
    const [a, b] = normalizePair(req.country_id, targetCountryId);
    const newValue = clampRelation(current + relationDelta);
    const { error: relErr } = await supabase
      .from("country_relations")
      .upsert(
        { country_a_id: a, country_b_id: b, value: newValue, updated_at: new Date().toISOString() },
        { onConflict: "country_a_id,country_b_id" }
      );
    if (relErr) return { error: relErr.message };
  }

  const effect = req.admin_effect_added as AdminEffectAdded | null;
  if (effect && typeof effect === "object" && effect.name && effect.effect_kind) {
    const targetCountryId =
      key === "prise_influence" && payload.target_country_id
        ? payload.target_country_id
        : req.country_id;
    const durationKind = effect.duration_kind ?? "updates";
    const durationRemaining = durationKind === "permanent" ? 0 : (Number(effect.duration_remaining) || 30);
    const row = {
      country_id: targetCountryId,
      name: effect.name,
      effect_kind: effect.effect_kind,
      effect_target: effect.effect_target ?? null,
      effect_subtype: effect.effect_subtype ?? null,
      value: Number(effect.value),
      duration_kind: durationKind,
      duration_remaining: durationRemaining,
    };
    const { error: insErr } = await supabase.from("country_effects").insert(row);
    if (insErr) return { error: insErr.message };
  }

  const { error: upErr } = await supabase
    .from("state_action_requests")
    .update({
      status: "accepted",
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", requestId);

  if (upErr) return { error: upErr.message };
  revalidatePath("/admin/demandes");
  revalidatePath("/pays");
  return {};
}

export async function refuseRequest(
  requestId: string,
  refundActions: boolean,
  refusalMessage: string
): Promise<{ error?: string }> {
  const { supabase, error: authError, userId } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: req, error: fetchErr } = await supabase
    .from("state_action_requests")
    .select("id, country_id, action_type_id, status")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Requête introuvable." };
  if (req.status !== "pending") return { error: "Cette demande a déjà été traitée." };

  if (refundActions) {
    const { data: actionType } = await supabase
      .from("state_action_types")
      .select("cost")
      .eq("id", req.action_type_id)
      .single();
    const cost = actionType?.cost ?? 1;
    const { data: balanceRow } = await supabase
      .from("country_state_action_balance")
      .select("balance")
      .eq("country_id", req.country_id)
      .single();
    const current = balanceRow?.balance ?? 0;
    await supabase
      .from("country_state_action_balance")
      .upsert(
        {
          country_id: req.country_id,
          balance: current + cost,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "country_id" }
      );
  }

  const { error: upErr } = await supabase
    .from("state_action_requests")
    .update({
      status: "refused",
      refund_actions: refundActions,
      refusal_message: refusalMessage.trim() || null,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", requestId);

  if (upErr) return { error: upErr.message };
  revalidatePath("/admin/demandes");
  revalidatePath("/pays");
  return {};
}
