"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getRelation } from "@/lib/relations";
import {
  actionRequiresTarget,
  actionRequiresTargetAcceptance,
  getStateActionMinRelationRequired,
} from "@/lib/actionKeys";

export async function submitStateActionRequest(
  countryId: string,
  actionTypeId: string,
  payload: Record<string, unknown>
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: playerRow } = await supabase
    .from("country_players")
    .select("country_id")
    .eq("user_id", user.id)
    .eq("country_id", countryId)
    .maybeSingle();
  if (!playerRow) return { error: "Vous n'êtes pas le joueur de ce pays." };

  const { data: actionType, error: typeErr } = await supabase
    .from("state_action_types")
    .select("id, key, cost, params_schema")
    .eq("id", actionTypeId)
    .single();
  if (typeErr || !actionType) return { error: "Type d'action introuvable." };
  const actionKey = actionType.key as string;
  const paramsSchema = (actionType.params_schema ?? {}) as Record<string, unknown>;
  const cost = (actionType.cost ?? 1) as number;

  const targetCountryId = typeof payload.target_country_id === "string" ? payload.target_country_id : null;
  if (actionRequiresTarget(actionKey)) {
    if (!targetCountryId) return { error: "Veuillez choisir un pays cible." };
    if (targetCountryId === countryId) return { error: "La cible ne peut pas être le pays émetteur." };
  }

  const minRelationRequired = getStateActionMinRelationRequired(actionKey, paramsSchema);
  if (minRelationRequired !== null && targetCountryId) {
    const relation = await getRelation(supabase, countryId, targetCountryId);
    if (relation > minRelationRequired) {
      return {
        error: `Relation insuffisamment hostile. Cette action exige une relation de ${minRelationRequired} ou moins.`,
      };
    }
  }

  const { data: balanceRow } = await supabase
    .from("country_state_action_balance")
    .select("balance")
    .eq("country_id", countryId)
    .maybeSingle();
  const current = (balanceRow?.balance ?? 0) as number;
  if (current < cost) return { error: `Solde insuffisant (${current} action(s), coût ${cost}).` };

  const requiresTargetAcceptance = actionRequiresTargetAcceptance(actionKey, paramsSchema);
  const initialStatus = requiresTargetAcceptance ? "pending_target" : "pending";

  const insertPayload: Record<string, unknown> = {
    country_id: countryId,
    user_id: user.id,
    action_type_id: actionTypeId,
    status: initialStatus,
    payload,
  };
  if (targetCountryId) {
    insertPayload.target_country_id = targetCountryId;
  }

  const { error: insErr } = await supabase.from("state_action_requests").insert(insertPayload);
  if (insErr) return { error: insErr.message };

  // UPDATE uniquement : la RLS n'autorise l'INSERT joueur que si balance = 0
  const { data: updated, error: balErr } = await supabase
    .from("country_state_action_balance")
    .update({ balance: current - cost, updated_at: new Date().toISOString() })
    .eq("country_id", countryId)
    .gte("balance", cost)
    .select("country_id")
    .maybeSingle();
  if (balErr) return { error: balErr.message };
  if (!updated) return { error: "Solde insuffisant ou ligne de solde absente." };

  revalidatePath("/pays");
  revalidatePath("/admin/demandes");
  return {};
}

export async function acceptTargetStateActionRequest(requestId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: playerRow } = await supabase
    .from("country_players")
    .select("country_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!playerRow) return { error: "Vous n'êtes pas assigné à un pays." };

  const targetCountryId = playerRow.country_id;

  const { data: req, error: fetchErr } = await supabase
    .from("state_action_requests")
    .select("id, target_country_id, status")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Demande introuvable." };
  if (req.status !== "pending_target") return { error: "Cette demande n'est plus en attente d'acceptation." };
  if (req.target_country_id !== targetCountryId) return { error: "Vous n'êtes pas la cible de cette demande." };

  const { error: upErr } = await supabase
    .from("state_action_requests")
    .update({ status: "pending" })
    .eq("id", requestId);

  if (upErr) return { error: upErr.message };

  revalidatePath("/pays");
  revalidatePath("/admin/demandes");
  return {};
}

export async function refuseTargetStateActionRequest(
  requestId: string,
  message?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté." };

  const { data: playerRow } = await supabase
    .from("country_players")
    .select("country_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!playerRow) return { error: "Vous n'êtes pas assigné à un pays." };

  const targetCountryId = playerRow.country_id;

  const { data: req, error: fetchErr } = await supabase
    .from("state_action_requests")
    .select("id, country_id, action_type_id, target_country_id, status")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Demande introuvable." };
  if (req.status !== "pending_target") return { error: "Cette demande n'est plus en attente d'acceptation." };
  if (req.target_country_id !== targetCountryId) return { error: "Vous n'êtes pas la cible de cette demande." };

  const { data: actionType } = await supabase
    .from("state_action_types")
    .select("cost")
    .eq("id", req.action_type_id)
    .single();
  const cost = (actionType?.cost ?? 1) as number;

  const { data: balanceRow } = await supabase
    .from("country_state_action_balance")
    .select("balance")
    .eq("country_id", req.country_id)
    .maybeSingle();
  const current = (balanceRow?.balance ?? 0) as number;

  const { error: upErr } = await supabase
    .from("state_action_requests")
    .update({
      status: "target_refused",
      refusal_message: typeof message === "string" && message.trim() ? message.trim() : null,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", requestId);

  if (upErr) return { error: upErr.message };

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

  revalidatePath("/pays");
  revalidatePath("/admin/demandes");
  return {};
}
