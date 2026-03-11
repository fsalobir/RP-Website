import { createClient } from "npm:@supabase/supabase-js@2";
import { applyStateActionConsequences, ACTION_KEYS_REQUIRING_IMPACT_ROLL } from "./_shared/stateActionConsequences.ts";
import { computeAiEventDiceRoll } from "./_shared/stateActionDice.ts";
import type { DiceResults } from "./_shared/types.ts";

type ActionTypeRow = { key: string; label_fr: string; params_schema: Record<string, number> };

function isTruthy(value: string | undefined | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function getDryRun(request: Request): boolean {
  const url = new URL(request.url);
  const qp = url.searchParams.get("dry_run");
  if (qp) return isTruthy(qp);
  const header = request.headers.get("x-dry-run");
  if (header) return isTruthy(header);
  return false;
}

function isAuthorized(request: Request): boolean {
  const expected = Deno.env.get("PROCESS_DUE_EDGE_SECRET");
  if (!expected) return false;
  const provided = request.headers.get("x-process-secret");
  return provided === expected;
}

Deno.serve(async (request) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non supportée" }), { status: 405 });
  }
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });
  }

  const edgeEnabled = isTruthy(Deno.env.get("PROCESS_DUE_EDGE_ENABLED"));
  const dryRun = getDryRun(request);
  if (!edgeEnabled) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "PROCESS_DUE_EDGE_ENABLED=false" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) {
    return new Response(JSON.stringify({ ok: false, error: "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

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

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

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
  let skippedByReservation = 0;
  let refusedBySuccessRoll = 0;
  const errors: { id: string; error: string }[] = [];
  const dryRunIds: string[] = [];

  for (const row of list) {
    if (dryRun) {
      dryRunIds.push(row.id);
      continue;
    }

    const { data: reserved } = await supabase
      .from("ai_event_requests")
      .update({ processing_started_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("consequences_applied_at", null)
      .or(`processing_started_at.is.null,processing_started_at.lt.${retryThreshold}`)
      .select("id")
      .single();

    if (!reserved) {
      skippedByReservation++;
      continue;
    }

    const typeRow = Array.isArray(row.state_action_types) ? row.state_action_types[0] : row.state_action_types;
    if (!typeRow?.key) {
      failed++;
      errors.push({ id: row.id, error: "Type d'action manquant ou invalide" });
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
        errors.push({ id: row.id, error: successErr ?? "Jet de succès impossible" });
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
        refusedBySuccessRoll++;
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
          errors.push({ id: row.id, error: impactErr ?? "Jet d'impact impossible" });
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
        errors.push({ id: row.id, error: diceUpErr.message });
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
      errors.push({ id: row.id, error: applyErr });
      continue;
    }

    const { error: upErr } = await supabase
      .from("ai_event_requests")
      .update({ consequences_applied_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("consequences_applied_at", null);

    if (upErr) {
      failed++;
      errors.push({ id: row.id, error: upErr.message });
    } else {
      processed++;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      dry_run: dryRun,
      processed,
      failed,
      total: list.length,
      skippedByReservation,
      refusedBySuccessRoll,
      dryRunIds: dryRun ? dryRunIds : undefined,
      errors,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
