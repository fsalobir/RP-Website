"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { DiceResults, DiceRollResult } from "@/types/database";
import { computeAiEventDiceRoll } from "@/lib/stateActionDice";
import { getRelation } from "@/lib/relations";
import {
  applyStateActionConsequences,
  ACTION_KEYS_REQUIRING_IMPACT_ROLL,
} from "@/lib/stateActionConsequences";
import { getStateActionMinRelationRequired } from "@/lib/actionKeys";

async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, error: "Non connecté." };
  const { data: adminRow } = await supabase.from("admins").select("id").eq("user_id", user.id).single();
  if (!adminRow) return { supabase: null, error: "Réservé aux admins." };
  return { supabase, error: null, userId: user.id };
}

export async function rollD100ForAiEvent(
  eventId: string,
  rollType: "success" | "impact",
  adminModifiers: Array<{ label: string; value: number }> = []
): Promise<{ error?: string; result?: DiceRollResult }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: req, error: fetchErr } = await supabase
    .from("ai_event_requests")
    .select("id, country_id, action_type_id, status, payload, dice_results")
    .eq("id", eventId)
    .single();

  if (fetchErr || !req) return { error: fetchErr?.message ?? "Événement introuvable." };
  if (req.status !== "pending") return { error: "Cet événement a déjà été traité." };

  const { data: actionType } = req.action_type_id
    ? await supabase.from("state_action_types").select("key, params_schema").eq("id", req.action_type_id).maybeSingle()
    : { data: null };
  const actionKey = (actionType as { key?: string } | null)?.key ?? "";
  const paramsSchema = (actionType?.params_schema ?? {}) as Record<string, unknown>;

  const { error: computeErr, result } = await computeAiEventDiceRoll({
    supabase,
    countryId: req.country_id,
    actionKey,
    paramsSchema,
    payload: (req.payload ?? {}) as Record<string, unknown>,
    rollType,
    adminModifiers,
  });
  if (computeErr || !result) return { error: computeErr ?? "Calcul du jet impossible." };

  const existing = (req.dice_results ?? {}) as DiceResults;
  const next: DiceResults = {
    ...existing,
    admin_modifiers: adminModifiers.length > 0 ? adminModifiers : existing.admin_modifiers,
    ...(rollType === "success" ? { success_roll: result } : { impact_roll: result }),
  };

  const { error: upErr } = await supabase
    .from("ai_event_requests")
    .update({ dice_results: next as unknown as Record<string, unknown> })
    .eq("id", eventId);

  if (upErr) return { error: upErr.message };
  revalidatePath("/admin/event-ia");
  return { result };
}

export async function acceptAiEvent(
  eventId: string,
  options?: { scheduleWithAmplitude?: boolean }
): Promise<{ error?: string }> {
  const { supabase, error: authError, userId } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: ev, error: fetchErr } = await supabase
    .from("ai_event_requests")
    .select("id, country_id, action_type_id, status, payload, admin_effect_added, dice_results")
    .eq("id", eventId)
    .single();

  if (fetchErr || !ev) return { error: fetchErr?.message ?? "Événement introuvable." };
  if (ev.status !== "pending") return { error: "Cet événement a déjà été traité." };

  const { data: actionType } = await supabase
    .from("state_action_types")
    .select("key, label_fr, params_schema")
    .eq("id", ev.action_type_id)
    .single();

  const key = (actionType?.key ?? "") as string;
  const actionLabel = (actionType as { label_fr?: string } | null)?.label_fr ?? key;
  const payload = (ev.payload ?? {}) as Record<string, string>;
  const params = (actionType?.params_schema ?? {}) as Record<string, number>;
  const diceResults = ev.dice_results as DiceResults | null;

  if (ACTION_KEYS_REQUIRING_IMPACT_ROLL.has(key) && !diceResults?.impact_roll) {
    return { error: "Un jet d'impact doit être réalisé avant d'accepter cet événement." };
  }

  const scheduleWithAmplitude = options?.scheduleWithAmplitude ?? false;

  if (scheduleWithAmplitude) {
    const { data: configRow } = await supabase
      .from("rule_parameters")
      .select("value")
      .eq("key", "ai_events_config")
      .maybeSingle();
    const config = (configRow?.value ?? {}) as { trigger_amplitude_minutes?: number };
    const amplitude = Math.max(0, Number(config.trigger_amplitude_minutes) || 0);
    const delayMinutes = Math.random() * amplitude;
    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

    const { error: upErr } = await supabase
      .from("ai_event_requests")
      .update({
        status: "accepted",
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        scheduled_trigger_at: scheduledAt,
      })
      .eq("id", eventId);

    if (upErr) return { error: upErr.message };
    revalidatePath("/admin/event-ia");
    revalidatePath("/pays");
    revalidatePath("/");
    return {};
  }

  const applyErr = await applyStateActionConsequences({
    supabase,
    countryId: ev.country_id,
    payload,
    adminEffectAdded: ev.admin_effect_added,
    diceResults,
    actionKey: key,
    actionLabel,
    paramsSchema: params,
  });
  if (applyErr.error) return applyErr;

  const { error: upErr } = await supabase
    .from("ai_event_requests")
    .update({
      status: "accepted",
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
      consequences_applied_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (upErr) return { error: upErr.message };

  revalidatePath("/admin/event-ia");
  revalidatePath("/pays");
  revalidatePath("/");
  return {};
}

export async function refuseAiEvent(eventId: string, refusalMessage: string): Promise<{ error?: string }> {
  const { supabase, error: authError, userId } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { data: ev, error: fetchErr } = await supabase
    .from("ai_event_requests")
    .select("id, status")
    .eq("id", eventId)
    .single();

  if (fetchErr || !ev) return { error: fetchErr?.message ?? "Événement introuvable." };
  if (ev.status !== "pending") return { error: "Cet événement a déjà été traité." };

  const { error: upErr } = await supabase
    .from("ai_event_requests")
    .update({
      status: "refused",
      refusal_message: refusalMessage.trim() || null,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", eventId);

  if (upErr) return { error: upErr.message };

  revalidatePath("/admin/event-ia");
  return {};
}

export async function createAiEvent(payload: {
  actionTypeId: string;
  countryId: string;
  targetCountryId: string;
}): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { actionTypeId, countryId, targetCountryId } = payload;
  if (targetCountryId === countryId) {
    return { error: "La cible ne doit pas être l'émetteur." };
  }

  const { data: actionType, error: actionTypeErr } = await supabase
    .from("state_action_types")
    .select("key, params_schema")
    .eq("id", actionTypeId)
    .single();
  if (actionTypeErr || !actionType) return { error: actionTypeErr?.message ?? "Type d'action introuvable." };

  const minRelationRequired = getStateActionMinRelationRequired(
    actionType.key,
    (actionType.params_schema ?? {}) as Record<string, unknown>
  );
  if (minRelationRequired !== null) {
    const relation = await getRelation(supabase, countryId, targetCountryId);
    if (relation > minRelationRequired) {
      return {
        error: `Relation insuffisamment hostile. Cette action exige une relation de ${minRelationRequired} ou moins.`,
      };
    }
  }

  const { error: insErr } = await supabase.from("ai_event_requests").insert({
    country_id: countryId,
    action_type_id: actionTypeId,
    status: "pending",
    payload: { target_country_id: targetCountryId },
    source: "manual",
  });

  if (insErr) return { error: insErr.message };

  revalidatePath("/admin/event-ia");
  return {};
}

/** Simule un passage du cron de génération des events IA (appelle run_ai_events_cron). Réservé aux admins. */
export async function simulateAiEventsCron(): Promise<{ error?: string }> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const { error } = await supabase.rpc("run_ai_events_cron", { p_force: true });
  if (error) return { error: error.message };

  revalidatePath("/admin/event-ia");
  return {};
}

/** Traite les events IA acceptés dont le déclenchement est dû (même logique que GET /api/cron/process-ai-events). Réservé aux admins. */
export async function processDueAiEvents(): Promise<{
  error?: string;
  processed?: number;
  failed?: number;
  total?: number;
}> {
  const { supabase, error: authError } = await ensureAdmin();
  if (authError || !supabase) return { error: authError ?? "Non autorisé." };

  const now = new Date();
  const retryAfterMs = 10 * 60 * 1000;
  const retryThreshold = new Date(now.getTime() - retryAfterMs).toISOString();

  const { data: rows, error: fetchErr } = await supabase
    .from("ai_event_requests")
    .select(`
      id,
      country_id,
      payload,
      admin_effect_added,
      dice_results,
      state_action_types:action_type_id(key, label_fr, params_schema)
    `)
    .eq("status", "accepted")
    .is("consequences_applied_at", null)
    .or("scheduled_trigger_at.is.null,scheduled_trigger_at.lte." + now.toISOString())
    .or(`processing_started_at.is.null,processing_started_at.lt.${retryThreshold}`)
    .limit(50);

  if (fetchErr) return { error: fetchErr.message };

  type ActionTypeRow = { key: string; label_fr: string; params_schema: Record<string, number> };
  const list = (rows ?? []) as Array<{
    id: string;
    country_id: string;
    payload: Record<string, unknown>;
    admin_effect_added: unknown;
    dice_results: unknown;
    state_action_types: ActionTypeRow | ActionTypeRow[] | null;
  }>;

  let processed = 0;
  let failed = 0;

  for (const row of list) {
    const { data: reserved } = await supabase
      .from("ai_event_requests")
      .update({ processing_started_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("consequences_applied_at", null)
      .or(`processing_started_at.is.null,processing_started_at.lt.${retryThreshold}`)
      .select("id")
      .single();

    if (!reserved) continue;

    const typeRow = Array.isArray(row.state_action_types) ? row.state_action_types[0] : row.state_action_types;
    if (!typeRow?.key) {
      failed++;
      continue;
    }

    let diceResults: DiceResults | null = (row.dice_results ?? null) as DiceResults | null;
    const needsRolls = diceResults == null || (ACTION_KEYS_REQUIRING_IMPACT_ROLL.has(typeRow.key) && !diceResults?.impact_roll);

    if (needsRolls) {
      const { error: successErr, result: successResult } = await computeAiEventDiceRoll({
        supabase,
        countryId: row.country_id,
        actionKey: typeRow.key,
        paramsSchema: (typeRow.params_schema ?? {}) as Record<string, unknown>,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        rollType: "success",
        adminModifiers: [],
      });
      if (successErr || !successResult) {
        failed++;
        continue;
      }
      if (successResult.total < 50) {
        await supabase
          .from("ai_event_requests")
          .update({
            status: "refused",
            refusal_message: "Échec au jet de succès (auto-accept).",
            resolved_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        continue;
      }
      diceResults = { success_roll: successResult };
      if (ACTION_KEYS_REQUIRING_IMPACT_ROLL.has(typeRow.key)) {
        const { error: impactErr, result: impactResult } = await computeAiEventDiceRoll({
          supabase,
          countryId: row.country_id,
          actionKey: typeRow.key,
          paramsSchema: (typeRow.params_schema ?? {}) as Record<string, unknown>,
          payload: (row.payload ?? {}) as Record<string, unknown>,
          rollType: "impact",
          adminModifiers: [],
        });
        if (impactErr || !impactResult) {
          failed++;
          continue;
        }
        diceResults = { ...diceResults, impact_roll: impactResult };
      }
      const { error: diceUpErr } = await supabase
        .from("ai_event_requests")
        .update({ dice_results: diceResults as unknown as Record<string, unknown> })
        .eq("id", row.id);
      if (diceUpErr) {
        failed++;
        continue;
      }
    }

    const { error: applyErr } = await applyStateActionConsequences({
      supabase,
      countryId: row.country_id,
      payload: (row.payload ?? {}) as Record<string, string>,
      adminEffectAdded: row.admin_effect_added,
      diceResults,
      actionKey: typeRow.key,
      actionLabel: typeRow.label_fr,
      paramsSchema: typeRow.params_schema ?? {},
    });

    if (applyErr) {
      failed++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("ai_event_requests")
      .update({ consequences_applied_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("consequences_applied_at", null);

    if (upErr) failed++;
    else processed++;
  }

  revalidatePath("/admin/event-ia");
  revalidatePath("/pays");
  revalidatePath("/");
  return { processed, failed, total: list.length };
}
