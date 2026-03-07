/**
 * Route API pour déclencher la génération des events IA (run_ai_events_cron).
 * À appeler par un cron externe (ex. cron-job.org) ou manuellement pour tester.
 * Protégée par CRON_SECRET (en-tête x-cron-secret ou query secret).
 * La fonction SQL décide selon interval_hours et last_run si des events sont générés.
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

  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("run_ai_events_cron");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
