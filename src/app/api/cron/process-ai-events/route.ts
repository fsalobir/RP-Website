/**
 * Route API appelée par le cron externe pour exécuter le job « Process due AI events » :
 * applique les conséquences (relations, influence, effets, Discord) pour les events IA
 * acceptés dont scheduled_trigger_at est passé (ou null) et consequences_applied_at non renseigné.
 * Réservation via processing_started_at pour éviter le double traitement (appels parallèles).
 * Timeout retry : 10 min (lignes en cours sans consequences_applied_at re-sélectionnables).
 * Protégée par CRON_SECRET (en-tête ou query).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { applyStateActionConsequences } from "@/lib/stateActionConsequences";

function getCronSecret(request: NextRequest): string | null {
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (header) return header;
  return request.nextUrl.searchParams.get("secret");
}

export async function GET(request: NextRequest) {
  const secret = getCronSecret(request);
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

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
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const list = (rows ?? []) as Array<{
    id: string;
    country_id: string;
    payload: Record<string, unknown>;
    admin_effect_added: unknown;
    dice_results: unknown;
    state_action_types: { key: string; label_fr: string; params_schema: Record<string, number> } | null;
  }>;

  let processed = 0;
  let failed = 0;
  const errors: { id: string; error: string }[] = [];

  for (const row of list) {
    const { data: reserved } = await supabase
      .from("ai_event_requests")
      .update({ processing_started_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("consequences_applied_at", null)
      .or(`processing_started_at.is.null,processing_started_at.lt.${retryThreshold}`)
      .select("id")
      .single();

    if (!reserved) {
      continue;
    }

    const typeRow = Array.isArray(row.state_action_types) ? row.state_action_types[0] : row.state_action_types;
    if (!typeRow?.key) {
      failed++;
      errors.push({ id: row.id, error: "Type d'action manquant ou invalide" });
      continue;
    }

    const { error: applyErr } = await applyStateActionConsequences({
      supabase,
      countryId: row.country_id,
      payload: (row.payload ?? {}) as Record<string, string>,
      adminEffectAdded: row.admin_effect_added,
      diceResults: (row.dice_results ?? null) as Parameters<typeof applyStateActionConsequences>[0]["diceResults"],
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

  return NextResponse.json({ ok: true, processed, failed, total: list.length, errors });
}
