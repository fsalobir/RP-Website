/**
 * Route API pour déclencher la génération des events IA (run_ai_events_cron).
 * À appeler par un cron externe ou manuellement pour tester.
 * Protégée par CRON_SECRET (en-tête x-cron-secret ou query secret).
 * Query ?force=true : appelle run_ai_events_cron(p_force=true) pour ignorer l'intervalle.
 * La réponse inclut un résumé de config pour diagnostiquer pourquoi 0 event est généré.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

  const force = request.nextUrl.searchParams.get("force") === "true";
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("run_ai_events_cron", { p_force: force });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const [configRes, lastRunRes] = await Promise.all([
    supabase.from("rule_parameters").select("value").eq("key", "ai_events_config").maybeSingle(),
    supabase.from("rule_parameters").select("value").eq("key", "ai_events_last_run").maybeSingle(),
  ]);
  const config = (configRes.data as { value?: Record<string, unknown> } | null)?.value ?? null;
  const lastRunRaw = (lastRunRes.data as { value?: string } | null)?.value;
  const lastRun = typeof lastRunRaw === "string" ? lastRunRaw : null;

  const countMajor = config && typeof config.count_major_per_run === "number" ? config.count_major_per_run : 0;
  const countMinor = config && typeof config.count_minor_per_run === "number" ? config.count_minor_per_run : 0;
  const allowedMajor = Array.isArray(config?.allowed_action_type_keys_major) ? config.allowed_action_type_keys_major.length : 0;
  const allowedMinor = Array.isArray(config?.allowed_action_type_keys_minor) ? config.allowed_action_type_keys_minor.length : 0;

  return NextResponse.json({
    ok: true,
    forced: force,
    diagnostic: {
      count_major_per_run: countMajor,
      count_minor_per_run: countMinor,
      allowed_action_type_keys_major_count: allowedMajor,
      allowed_action_type_keys_minor_count: allowedMinor,
      last_run: lastRun,
      hint:
        countMajor + countMinor === 0
          ? "Aucun event : count_major_per_run et count_minor_per_run sont à 0 (Règles > Events IA)."
          : allowedMajor === 0 && allowedMinor === 0
            ? "Aucun event : listes d'actions autorisées vides (Règles > Events IA)."
            : undefined,
    },
  });
}
